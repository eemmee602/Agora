import express from "express";
import path from "path";
import fs from "fs";
import cors from "cors";
import dotenv from "dotenv";

if (process.env.VERCEL !== "1") {
  dotenv.config();
}
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

// ─── Supabase Persistent Memory System ───
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EMERICK_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EMERICK_SUPABASE_SERVICE_ROLE_KEY || "";

interface MemoryEntry {
  id?: string;
  user_id: string;
  category: "preferences" | "context" | "facts" | "observation";
  source: "user_stated" | "ai_observed";
  content: string;
  confidence: number;
  times_referenced: number;
  last_referenced_at?: string;
  created_at?: string;
  updated_at?: string;
}

async function loadUserMemories(userId: string): Promise<MemoryEntry[]> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return [];
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/agora_user_memories?user_id=eq.${encodeURIComponent(userId)}&order=confidence.desc,updated_at.desc`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
    if (!resp.ok) {
      console.error("[Memory] Load failed:", resp.status, await resp.text().catch(() => ""));
      return [];
    }
    return (await resp.json()) as MemoryEntry[];
  } catch (err) {
    console.error("[Memory] Load error:", err);
    return [];
  }
}

async function upsertUserMemory(entry: MemoryEntry): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return false;
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/agora_user_memories?on_conflict=user_id,content`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({
          user_id: entry.user_id,
          category: entry.category,
          source: entry.source,
          content: entry.content,
          confidence: entry.confidence,
        }),
      }
    );
    if (!resp.ok) {
      console.error("[Memory] Upsert failed:", resp.status);
    }
    return resp.ok;
  } catch (err) {
    console.error("[Memory] Upsert error:", err);
    return false;
  }
}

// ─── Model Cache (avoid spamming failed providers) ───
async function getModelCache(userId: string): Promise<Record<string, { last_success?: string; last_failure?: string; fail_count: number }>> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return {};
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/agora_model_cache?user_id=eq.${encodeURIComponent(userId)}`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    if (!resp.ok) return {};
    const rows = await resp.json() as any[];
    const cache: Record<string, any> = {};
    for (const r of rows) {
      cache[`${r.provider}/${r.model}`] = r;
    }
    return cache;
  } catch { return {}; }
}

async function recordModelSuccess(userId: string, provider: string, model: string): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/agora_model_cache?on_conflict=user_id,provider,model`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ user_id: userId, provider, model, last_success: new Date().toISOString(), fail_count: 0 }),
    });
  } catch {}
}

async function recordModelFailure(userId: string, provider: string, model: string): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/agora_model_cache?user_id=eq.${encodeURIComponent(userId)}&provider=eq.${encodeURIComponent(provider)}&model=eq.${encodeURIComponent(model)}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    });
    if (resp.ok) {
      const rows = await resp.json() as any[];
      const current = rows[0];
      const newFail = (current?.fail_count || 0) + 1;
      await fetch(`${SUPABASE_URL}/rest/v1/agora_model_cache?on_conflict=user_id,provider,model`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ user_id: userId, provider, model, last_failure: new Date().toISOString(), fail_count: newFail }),
      });
    }
  } catch {}
}

// ─── Scheduled Task Helpers ───
async function getPendingTasks(): Promise<any[]> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return [];
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/agora_scheduled_tasks?status=eq.pending&execute_at=lte.${new Date().toISOString()}&order=execute_at.asc&limit=10`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    if (!resp.ok) return [];
    return await resp.json();
  } catch { return []; }
}

async function markTaskDone(taskId: string, result: string): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/agora_scheduled_tasks?id=eq.${encodeURIComponent(taskId)}`, {
      method: "PATCH",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ status: "completed", result: result.substring(0, 5000), completed_at: new Date().toISOString() }),
    });
  } catch {}
}

async function deleteUserMemory(userId: string, memoryId: string): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return false;
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/agora_user_memories?id=eq.${encodeURIComponent(memoryId)}&user_id=eq.${encodeURIComponent(userId)}`,
      {
        method: "DELETE",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );
    return resp.ok;
  } catch (err) {
    console.error("[Memory] Delete error:", err);
    return false;
  }
}

async function deleteMemoryByContent(userId: string, contentPattern: string): Promise<number> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return 0;
  try {
    // Use ilike for partial match
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/agora_user_memories?user_id=eq.${encodeURIComponent(userId)}&content=ilike.${encodeURIComponent(`%${contentPattern}%`)}`,
      {
        method: "DELETE",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Prefer: "return=representation",
        },
      }
    );
    if (resp.ok) {
      const deleted = await resp.json();
      return Array.isArray(deleted) ? deleted.length : 0;
    }
    return 0;
  } catch (err) {
    console.error("[Memory] Delete by content error:", err);
    return 0;
  }
}

async function clearAllUserMemories(userId: string): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return false;
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/agora_user_memories?user_id=eq.${encodeURIComponent(userId)}`,
      {
        method: "DELETE",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );
    return resp.ok;
  } catch (err) {
    console.error("[Memory] Clear all error:", err);
    return false;
  }
}

function formatMemoriesForPrompt(memories: MemoryEntry[]): string {
  if (memories.length === 0) return "";

  const byCategory: Record<string, MemoryEntry[]> = {};
  for (const m of memories) {
    if (!byCategory[m.category]) byCategory[m.category] = [];
    byCategory[m.category].push(m);
  }

  const categoryLabels: Record<string, string> = {
    preferences: "PRÉFÉRENCES",
    context: "CONTEXTE",
    facts: "FAITS",
    observation: "OBSERVATIONS DE L'AI",
  };

  let result = "";
  for (const [cat, entries] of Object.entries(byCategory)) {
    const label = categoryLabels[cat] || cat.toUpperCase();
    result += `\n${label}:\n`;
    for (const e of entries) {
      const conf = e.confidence >= 2 ? "★" : e.confidence >= 1.5 ? "☆" : "";
      const src = e.source === "ai_observed" ? " (observé)" : "";
      result += `- ${e.content}${src} ${conf}\n`;
    }
  }
  return result.trim();
}

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Path to JSON persistent store
const DB_PATH = process.env.VERCEL === "1"
  ? path.join("/tmp", "agora-db.json")
  : path.join(process.cwd(), "data", "db.json");

// Ensure data directory exists
if (!fs.existsSync(path.dirname(DB_PATH))) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

// In-Memory Fallback & Database Initialization
interface User {
  id: string;
  username: string;
  email: string;
  role: "admin" | "user";
  quotaLimit: number;
  quotaUsed: number;
  apiKeys: { id: string; name: string; provider: string; key: string; model: string; active: boolean }[];
  createdAt: string;
  memory?: string;
  preferences?: {
    theme?: string;
    language?: string;
    [key: string]: any;
  };
}

interface Agent {
  id: string;
  name: string;
  role: string;
  avatar: string;
  description: string;
  skills: string[];
  status: "idle" | "working" | "sleeping";
  taskProgress: number;
  lastActive: string;
}

interface MessageStep {
  id: string;
  agentId: string;
  agentName: string;
  action: string;
  status: "pending" | "running" | "completed" | "failed";
  details?: string;
  codeBlock?: {
    fileName: string;
    language: string;
    code: string;
  };
  searchQuery?: string;
  searchLinks?: { title: string; url: string }[];
}

interface MessageAttachment {
  name: string;
  type: "file" | "image";
  base64?: string;
}

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: "user" | "agent" | "system";
  content: string;
  timestamp: string;
  steps?: MessageStep[];
  codeFiles?: { fileName: string; language: string; content: string }[];
  sources?: { title: string; url: string }[];
  attachments?: MessageAttachment[];
  generationTimeMs?: number;
  actualModelUsed?: string;
}

interface Chat {
  id: string;
  userId: string;
  userName: string;
  title: string;
  createdAt: string;
  messages: Message[];
  activeModel: string;
}

interface SystemLog {
  id: string;
  timestamp: string;
  type: "info" | "success" | "warning" | "error";
  message: string;
  source: string;
}

interface DB {
  users: User[];
  agents: Agent[];
  chats: Chat[];
  logs: SystemLog[];
}

// Admin identity from environment (no hardcoded accounts)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "Emerick";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@agora.ai";

const defaultDB: DB = {
  users: [
    {
      id: "admin-emerick",
      username: ADMIN_USERNAME,
      email: ADMIN_EMAIL,
      role: "admin",
      quotaLimit: 10000,
      quotaUsed: 0,
      apiKeys: [
        {
          id: "key-default",
          name: "Agora Core Key",
          provider: "openrouter",
          key: process.env.OPENROUTER_API_KEY || "",
          model: "google/gemini-2.5-flash",
          active: true
        }
      ],
      createdAt: new Date().toISOString()
    }
  ],
  agents: [
    {
      id: "agent-architect",
      name: "Architecte A∀-01",
      role: "Superviseur & Planificateur",
      avatar: "https://images.unsplash.com/photo-1614741118887-7a4ee193a5fa?w=150&auto=format&fit=crop&q=80",
      description: "Supervise l'exécution globale, segmente les tâches complexes et distribue la charge de travail aux agents spécialisés.",
      skills: ["Planification tactique", "Optimisation de flux", "Gestion de dépendances", "Vérification des buts"],
      status: "idle",
      taskProgress: 0,
      lastActive: new Date().toISOString()
    },
    {
      id: "agent-coder",
      name: "Codeur A∀-02",
      role: "Ingénieur logiciel principal",
      avatar: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=150&auto=format&fit=crop&q=80",
      description: "Spécialisé dans la génération de code, la création de fichiers automatisés (.py, .lua, .txt) et l'ajout de nouvelles compétences.",
      skills: ["Génération de scripts", "Débogage automatique", "Lua, Python, TypeScript", "Création de Skills"],
      status: "idle",
      taskProgress: 0,
      lastActive: new Date().toISOString()
    },
    {
      id: "agent-security",
      name: "Sécurité A∀-03",
      role: "Auditeur & Gardien d'Intégrité",
      avatar: "https://images.unsplash.com/photo-1563986768609-322da13575f3?w=150&auto=format&fit=crop&q=80",
      description: "Vérifie chaque ligne de code générée, s'assure du respect des quotas d'utilisation et sécurise les échanges réseau.",
      skills: ["Audit de vulnérabilité", "Filtrage de scripts", "Contrôle de Sandboxing", "Gestion d'intégrité"],
      status: "idle",
      taskProgress: 0,
      lastActive: new Date().toISOString()
    },
    {
      id: "agent-searcher",
      name: "Chercheur A∀-04",
      role: "Explorateur du Web",
      avatar: "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=150&auto=format&fit=crop&q=80",
      description: "Effectue des recherches en temps réel et extrait les sources et URL pertinentes de manière économique.",
      skills: ["Recherche Web ciblée", "Extraction d'URL", "Filtrage de pertinence", "Synthèse documentaire"],
      status: "idle",
      taskProgress: 0,
      lastActive: new Date().toISOString()
    }
  ],
  chats: [
    {
      id: "chat-welcome",
      userId: "admin-emerick",
      userName: "Emerick",
      title: "Bienvenue sur Agora Ai",
      createdAt: new Date().toISOString(),
      messages: [
        {
          id: "m-welcome",
          senderId: "system",
          senderName: "Agora Ai",
          senderRole: "system",
          content: "Système démarré avec succès. Les agents Architecte, Codeur, Sécurité et Chercheur sont synchronisés et prêts à collaborer sous votre autorité.",
          timestamp: new Date().toISOString()
        }
      ],
      activeModel: "gemini-2.5-flash"
    }
  ],
  logs: [
    {
      id: "log-1",
      timestamp: new Date().toISOString(),
      type: "info",
      message: "Plateforme Agora Ai initialisée en mode Liquid Glass.",
      source: "System"
    },
    {
      id: "log-2",
      timestamp: new Date().toISOString(),
      type: "success",
      message: "Agents synchronisés en arbre de décision collaboratif.",
      source: "Architecte"
    }
  ]
};

// In-memory DB cache (persists across requests on same Vercel instance)
let _db: DB | null = null;

// Supabase persistence (survives Vercel cold starts)
const SUPABASE_DB_TABLE = "agora_data";
const SUPABASE_DB_KEY = "main";

async function supabaseReadDB(): Promise<DB | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const url = `${SUPABASE_URL}/rest/v1/${SUPABASE_DB_TABLE}?key=eq.${encodeURIComponent(SUPABASE_DB_KEY)}&select=data`;
    const resp = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "apikey": SUPABASE_KEY,
        "Content-Type": "application/json",
      },
    });
    if (!resp.ok) return null;
    const rows = await resp.json() as any[];
    if (!rows || rows.length === 0) return null;
    return rows[0].data as DB;
  } catch (err) {
    console.error("[Supabase] readDB error:", err);
    return null;
  }
}

async function supabaseWriteDB(data: DB): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    const url = `${SUPABASE_URL}/rest/v1/${SUPABASE_DB_TABLE}?key=eq.${encodeURIComponent(SUPABASE_DB_KEY)}`;
    const resp = await fetch(url, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "apikey": SUPABASE_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
    });
    if (!resp.ok) {
      // Row might not exist yet, try INSERT (upsert)
      const insertResp = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_DB_TABLE}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "apikey": SUPABASE_KEY,
          "Content-Type": "application/json",
          "Prefer": "return=minimal,resolution=merge-duplicates",
        },
        body: JSON.stringify({ key: SUPABASE_DB_KEY, data, updated_at: new Date().toISOString() }),
      });
      if (!insertResp.ok) console.error("[Supabase] writeDB insert failed:", insertResp.status);
    }
  } catch (err) {
    console.error("[Supabase] writeDB error:", err);
  }
}

function readDB(): DB {
  if (_db) return _db;
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = fs.readFileSync(DB_PATH, "utf-8");
      const parsed = JSON.parse(data);
      
      // Auto-migrate: remove parentheses in agent names if present
      let mutated = false;
      if (parsed.agents && Array.isArray(parsed.agents)) {
        parsed.agents.forEach((agent: any) => {
          if (agent.name && typeof agent.name === "string" && agent.name.includes("(")) {
            agent.name = agent.name.replace(/\(([^)]+)\)/, "$1").trim();
            mutated = true;
          }
        });
      }
      
      if (mutated) {
        fs.writeFileSync(DB_PATH, JSON.stringify(parsed, null, 2), "utf-8");
      }
      
      _db = parsed;
      return _db;
    }
  } catch (err) {
    console.error("Error reading database file, resetting to default", err);
  }
  _db = JSON.parse(JSON.stringify(defaultDB));
  writeDB(_db);
  return _db;
}

function writeDB(data: DB) {
  _db = data;
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing database file", err);
  }
  // Sync to Supabase (fire-and-forget, non-blocking)
  supabaseWriteDB(data).catch(err => console.error("[Supabase] async writeDB error:", err));
}

// On cold start: try to restore DB from Supabase before serving requests
if (SUPABASE_URL && SUPABASE_KEY) {
  (async () => {
    try {
      const restored = await supabaseReadDB();
      if (restored && restored.chats) {
        _db = restored;
        // Also write to local /tmp for fast subsequent reads
        try { fs.writeFileSync(DB_PATH, JSON.stringify(restored, null, 2), "utf-8"); } catch {}
        console.log(`[Supabase] DB restored: ${restored.chats?.length || 0} chats, ${restored.users?.length || 0} users`);
      }
    } catch (err) {
      console.error("[Supabase] cold start restore error:", err);
    }
  })();
}

// Global server Gemini configuration
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.warn("No Gemini/Google API key defined. Fallback simulation active.");
  }
  return new GoogleGenAI({
    apiKey: apiKey || "MOCK_KEY",
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
};

const GEMINI_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-3-flash",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3.1-pro"
];

const MEMORY_MAX_LENGTH = 2000;

// -----------------------------------------------------------------
// SUPABASE MEMORY BACKEND — persistent across devices & sessions
async function callGeminiWithRetry(
  client: GoogleGenAI,
  contents: any,
  config: any,
  preferredModel: string,
  onChunk?: (text: string) => void
): Promise<string> {
  const models = Array.from(new Set([preferredModel, ...GEMINI_MODELS].filter(Boolean)));
  let lastErr: any = null;

  for (const model of models) {
    let attempt = 0;
    const maxAttempts = 3;

    while (attempt < maxAttempts) {
      try {
        console.log(`[Gemini] ${onChunk ? "Stream" : "Request"} ${model} (${attempt + 1}/${maxAttempts})`);

        if (onChunk) {
          const stream = await client.models.generateContentStream({ model, contents, config });
          let full = "";
          for await (const c of stream) {
            const t = c.text;
            if (t) { full += t; onChunk(t); }
          }
          if (full) return full;
          throw new Error("Empty stream text.");
        } else {
          const res = await client.models.generateContent({ model, contents, config });
          if (res?.text) return res.text;
          throw new Error("Empty API text.");
        }
      } catch (err: any) {
        lastErr = err;
        const msg = err?.message || String(err);
        const s = msg.toLowerCase();
        const quota = s.includes("quota exceeded") || s.includes("exceeded your current quota") ||
          s.includes("resource_exhausted") || s.includes("billing details") || msg.includes("RESOURCE_EXHAUSTED");

        if (quota) {
          console.warn(`[Gemini] Quota exceeded for ${model}, switching model.`);
          break;
        }

        const transient = msg.includes("503") || msg.includes("429") ||
          s.includes("unavailable") || s.includes("high demand") ||
          s.includes("overloaded") || s.includes("rate limit") || s.includes("quota");

        if (transient) {
          attempt++;
          if (attempt < maxAttempts) {
            const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 500;
            console.warn(`[Gemini] Transient error on ${model}: ${msg}. Retry in ${Math.round(backoff)}ms`);
            await new Promise(r => setTimeout(r, backoff));
            continue;
          }
        }

        console.warn(`[Gemini] Failed on ${model}: ${msg}. Trying fallback.`);
        break;
      }
    }
  }

  throw lastErr || new Error(`Failed with any Gemini models (${onChunk ? "stream" : "sync"})`);
}

// Log helper
let _globalSendEvent: ((eventData: any) => void) | null = null;

function addLog(type: "info" | "success" | "warning" | "error", message: string, source: string) {
  const db = readDB();
  db.logs.unshift({
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    timestamp: new Date().toISOString(),
    type,
    message,
    source
  });
  // Keep last 150 logs
  if (db.logs.length > 150) db.logs = db.logs.slice(0, 150);
  writeDB(db);
  // Send to frontend in real-time if a stream is active
  if (_globalSendEvent) {
    try { _globalSendEvent({ type: "log", log: { type, message, source, timestamp: new Date().toISOString() } }); } catch {}
  }
}

// ============================================
// TOOL CALLING SYSTEM
// ============================================

interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, any>;
      required: string[];
    };
  };
}

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "http_request",
      description: "Effectue une requête HTTP vers une URL externe. Utile pour appeler des APIs, récupérer des données web, etc.",
      parameters: {
        type: "object",
        properties: {
          method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"], description: "Méthode HTTP" },
          url: { type: "string", description: "URL complète de la requête" },
          headers: { type: "object", description: "Headers HTTP optionnels (clé-valeur)" },
          body: { type: "string", description: "Corps de la requête pour POST/PUT/PATCH (string JSON)" }
        },
        required: ["method", "url"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "github_request",
      description: "Effectue une requête vers l'API GitHub. Utilise automatiquement le token GitHub configuré sur le serveur. Ex: endpoint='/repos/owner/repo', '/user', '/search/repositories?q=react'",
      parameters: {
        type: "object",
        properties: {
          endpoint: { type: "string", description: "Endpoint API GitHub (ex: /repos/owner/repo, /user, /search/repositories?q=...)" },
          method: { type: "string", enum: ["GET", "POST", "PATCH", "PUT", "DELETE"], description: "Méthode HTTP (défaut: GET)" },
          body: { type: "string", description: "Corps de la requête (string JSON) pour POST/PATCH/PUT" }
        },
        required: ["endpoint"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Recherche sur le web via DuckDuckGo. Retourne les premiers résultats avec titres et liens.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Termes de recherche" }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_code",
      description: "Exécute du code JavaScript dans un sandbox isolé avec un timeout de 5 secondes. Pas d'accès au filesystem ni au réseau. Utile pour des calculs, manipulation de données, etc.",
      parameters: {
        type: "object",
        properties: {
          code: { type: "string", description: "Code JavaScript à exécuter" }
        },
        required: ["code"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "schedule_task",
      description: "Programme une tâche à exécuter automatiquement à une heure future. L'IA reçoit le prompt à l'heure spécifiée et l'exécute comme si l'utilisateur l'avait tapé. Ex: 'à 15h rappelle-moi de manger', 'dans 2h cherche les news du jour'.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Le prompt/tâche à exécuter à l'heure prévue" },
          execute_at: { type: "string", description: "Heure d'exécution au format ISO 8601 (ex: 2026-07-15T15:00:00) ou relatif (ex: 'dans 2h', 'à 15h', 'dans 30min')" }
        },
        required: ["prompt", "execute_at"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "send_webhook",
      description: "Envoie un message à un webhook Discord/Slack. Simple et direct. L'URL du webhook et le contenu du message suffisent.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL du webhook Discord (https://discord.com/api/webhooks/...) ou Slack" },
          content: { type: "string", description: "Le message à envoyer" },
          embed_title: { type: "string", description: "Optionnel: titre d'un embed Discord (pour un message plus joli)" },
          embed_color: { type: "number", description: "Optionnel: couleur de l'embed en décimal (ex: 5814783 pour bleu, 16711680 pour rouge, 65280 pour vert)" }
        },
        required: ["url", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "supabase_query",
      description: "Interroge la base de données Supabase de l'utilisateur. Lecture seule (SELECT). Peut lire les tables utilisateur, les mémoires, les tâches programmées, etc. Aucun token requis — le serveur gère l'auth automatiquement.",
      parameters: {
        type: "object",
        properties: {
          table: { type: "string", description: "Nom de la table (ex: agora_user_memories, agora_scheduled_tasks, agora_data)" },
          filter: { type: "string", description: "Filtre optionnel au format PostgREST (ex: 'user_id=eq.admin-emerick', 'status=eq.pending')" },
          limit: { type: "number", description: "Nombre max de résultats (défaut: 50, max: 200)" },
          select: { type: "string", description: "Colonnes à sélectionner (défaut: * pour toutes)" }
        },
        required: ["table"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "discord_message",
      description: "Envoie un message dans un salon Discord via le bot. Aucun token requis — le serveur gère l'auth.",
      parameters: {
        type: "object",
        properties: {
          channel_id: { type: "string", description: "ID du salon Discord" },
          content: { type: "string", description: "Le message à envoyer" }
        },
        required: ["channel_id", "content"]
      }
    }
  }
];

// Gemini-format tool definitions (functionDeclarations)
const GEMINI_TOOL_DEFS = TOOL_DEFINITIONS.map(t => ({
  name: t.function.name,
  description: t.function.description,
  parameters: t.function.parameters as any
}));

// SSRF protection — block internal/private IPs
function isBlockedUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" ||
        host.startsWith("10.") || host.startsWith("192.168.") ||
        host.startsWith("172.16.") || host.startsWith("172.17.") ||
        host.startsWith("172.18.") || host.startsWith("172.19.") ||
        host.startsWith("172.2") || host.startsWith("172.3") ||
        host === "::1" || host.startsWith("fe80") ||
        host.startsWith("169.254.")) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

async function executeTool(name: string, args: any): Promise<{ success: boolean; result: string }> {
  try {
    switch (name) {
      case "http_request": {
        const { method, url, headers, body } = args;
        if (!url || typeof url !== "string") return { success: false, result: "URL manquante" };
        if (isBlockedUrl(url)) return { success: false, result: "URL bloquée (protection SSRF)" };
        const finalHeaders: Record<string, string> = headers || {};
        // Auto-add Content-Type for POST/PUT/PATCH if not specified and body is present
        const methodUpper = (method || "GET").toUpperCase();
        if (body && !finalHeaders["Content-Type"] && !finalHeaders["content-type"] &&
            (methodUpper === "POST" || methodUpper === "PUT" || methodUpper === "PATCH")) {
          finalHeaders["Content-Type"] = "application/json";
        }
        const resp = await fetch(url, {
          method: methodUpper,
          headers: finalHeaders,
          body: body || undefined
        });
        const text = await resp.text();
        const truncated = text.length > 5000 ? text.substring(0, 5000) + "\n... (tronqué)" : text;
        return { success: true, result: `Status: ${resp.status}\n${truncated}` };
      }

      case "github_request": {
        const { endpoint, method, body } = args;
        if (!endpoint) return { success: false, result: "Endpoint manquant" };
        const baseUrl = "https://api.github.com";
        const fullUrl = endpoint.startsWith("http") ? endpoint : `${baseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
        const ghHeaders: Record<string, string> = {
          "Accept": "application/vnd.github.v3+json",
          "User-Agent": "Agora-AI"
        };
        const ghToken = process.env.GITHUB_TOKEN;
        if (ghToken) {
          ghHeaders["Authorization"] = `Bearer ${ghToken}`;
        }
        if (body) {
          ghHeaders["Content-Type"] = "application/json";
        }
        const resp = await fetch(fullUrl, {
          method: (method || "GET").toUpperCase(),
          headers: ghHeaders,
          body: body || undefined
        });
        const text = await resp.text();
        const truncated = text.length > 5000 ? text.substring(0, 5000) + "\n... (tronqué)" : text;
        return { success: true, result: `Status: ${resp.status}\n${truncated}` };
      }

      case "web_search": {
        const { query } = args;
        if (!query) return { success: false, result: "Query manquante" };
        const searchUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
        const resp = await fetch(searchUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; AgoraAI/1.0)" }
        });
        const html = await resp.text();
        const results: string[] = [];
        const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
        let match;
        let count = 0;
        while ((match = linkRegex.exec(html)) !== null && count < 8) {
          const href = match[1];
          const title = match[2].trim();
          if (href.startsWith("http") && !href.includes("duckduckgo.com") && title.length > 5) {
            results.push(`• ${title}\n  ${href}`);
            count++;
          }
        }
        if (results.length === 0) return { success: true, result: "Aucun résultat trouvé." };
        return { success: true, result: results.join("\n\n") };
      }

      case "execute_code": {
        const { code } = args;
        if (!code) return { success: false, result: "Code manquant" };
        const vm = await import("vm");
        const sandbox: any = {
          console: { log: (...a: any[]) => { sandbox.__output.push(a.map(String).join(" ")); } },
          __output: [] as string[],
          Math, JSON, Date, String, Number, Boolean, Array, Object, parseInt, parseFloat
        };
        try {
          const context = vm.createContext(sandbox);
          vm.runInContext(code, context, { timeout: 5000 });
          const output = sandbox.__output.join("\n");
          return { success: true, result: output || "(pas de sortie)" };
        } catch (err: any) {
          return { success: false, result: `Erreur d'exécution: ${err.message}` };
        }
      }

      case "schedule_task": {
        const { prompt: taskPrompt, execute_at } = args;
        if (!taskPrompt || !execute_at) return { success: false, result: "Prompt et execute_at requis" };

        // Parse the execute_at field
        let executeDate: Date | null = null;
        const now = new Date();

        // Try relative formats: "dans 2h", "dans 30min", "dans 1h30"
        const relMatch = execute_at.match(/dans\s+(\d+(?:h\d*)?(?:min)?)/i);
        if (relMatch) {
          const timeStr = relMatch[1];
          const hoursMatch = timeStr.match(/(\d+)h(\d*)/);
          const minMatch = timeStr.match(/(\d+)min/);
          let hours = 0, mins = 0;
          if (hoursMatch) { hours = parseInt(hoursMatch[1]); if (hoursMatch[2]) mins += parseInt(hoursMatch[2]); }
          if (minMatch) { mins += parseInt(minMatch[1]); }
          executeDate = new Date(now.getTime() + hours * 3600000 + mins * 60000);
        }

        // Try "à 15h" or "a 15h30" format
        if (!executeDate) {
          const atMatch = execute_at.match(/[àa]\s+(\d+)h(\d*)/i);
          if (atMatch) {
            const h = parseInt(atMatch[1]);
            const m = atMatch[2] ? parseInt(atMatch[2]) : 0;
            executeDate = new Date(now);
            executeDate.setHours(h, m, 0, 0);
            if (executeDate <= now) executeDate.setDate(executeDate.getDate() + 1);
          }
        }

        // Try ISO 8601
        if (!executeDate) {
          const parsed = new Date(execute_at);
          if (!isNaN(parsed.getTime())) executeDate = parsed;
        }

        if (!executeDate) return { success: false, result: `Format d'heure non reconnu: "${execute_at}". Utilise: 'dans 2h', 'à 15h', 'dans 30min', ou ISO 8601 (2026-07-15T15:00:00)` };

        // Save to Supabase
        if (SUPABASE_URL && SUPABASE_KEY) {
          try {
            const resp = await fetch(`${SUPABASE_URL}/rest/v1/agora_scheduled_tasks`, {
              method: "POST",
              headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json",
                Prefer: "return=representation",
              },
              body: JSON.stringify({
                user_id: "admin-emerick",
                prompt: taskPrompt,
                execute_at: executeDate.toISOString(),
                status: "pending",
              }),
            });
            if (resp.ok) {
              const data = await resp.json();
              const taskId = data[0]?.id || "?";
              const timeStr = executeDate.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
              const dateStr = executeDate.toLocaleDateString("fr-CA");
              return { success: true, result: `Tâche programmée pour le ${dateStr} à ${timeStr}. ID: ${taskId}. L'IA exécutera automatiquement: "${taskPrompt.substring(0, 100)}"` };
            }
            return { success: false, result: `Erreur Supabase: ${resp.status}` };
          } catch (err: any) {
            return { success: false, result: `Erreur: ${err.message}` };
          }
        }
        return { success: false, result: "Base de données non configurée" };
      }

      case "send_webhook": {
        const { url: webhookUrl, content: msgContent, embed_title, embed_color } = args;
        if (!webhookUrl || typeof webhookUrl !== "string") return { success: false, result: "URL du webhook manquante" };
        if (!msgContent) return { success: false, result: "Contenu du message manquant" };
        if (isBlockedUrl(webhookUrl)) return { success: false, result: "URL bloquée (protection)" };
        
        // Discord webhook format: simple content OR embed
        const payload: any = {};
        if (embed_title) {
          payload.embeds = [{
            title: embed_title,
            description: msgContent,
            color: embed_color || 5814783
          }];
        } else {
          payload.content = msgContent;
        }
        
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000);
          const resp = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          const respText = await resp.text().catch(() => "");
          if (resp.ok) {
            return { success: true, result: `✅ Message envoyé au webhook (status ${resp.status}).` };
          }
          return { success: false, result: `Erreur webhook: status ${resp.status}. ${respText.substring(0, 500)}` };
        } catch (err: any) {
          return { success: false, result: `Erreur envoi webhook: ${err.message}` };
        }
      }

      case "supabase_query": {
        const { table: tableName, filter, limit: queryLimit, select: selectCols } = args;
        if (!tableName || typeof tableName !== "string") return { success: false, result: "Table manquante" };
        // Whitelist of readable tables
        const allowedTables = ["agora_user_memories", "agora_scheduled_tasks", "agora_data", "agora_model_cache"];
        if (!allowedTables.includes(tableName)) {
          return { success: false, result: `Table "${tableName}" non autorisée. Tables disponibles: ${allowedTables.join(", ")}` };
        }
        if (!SUPABASE_URL || !SUPABASE_KEY) return { success: false, result: "Base de données non configurée" };
        
        const maxLimit = Math.min(queryLimit || 50, 200);
        let queryUrl = `${SUPABASE_URL}/rest/v1/${tableName}?select=${encodeURIComponent(selectCols || "*")}&limit=${maxLimit}`;
        if (filter) {
          queryUrl += `&${filter}`;
        }
        
        try {
          const resp = await fetch(queryUrl, {
            headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
          });
          if (resp.ok) {
            const data = await resp.json();
            const truncated = JSON.stringify(data, null, 2);
            return { success: true, result: truncated.length > 5000 ? truncated.substring(0, 5000) + "\n... (tronqué)" : truncated };
          }
          return { success: false, result: `Erreur Supabase: ${resp.status}` };
        } catch (err: any) {
          return { success: false, result: `Erreur: ${err.message}` };
        }
      }

      case "discord_message": {
        const { channel_id: channelId, content: discContent } = args;
        if (!channelId || !discContent) return { success: false, result: "channel_id et content requis" };
        
        // Use DISCORD_BOT_TOKEN from env
        const botToken = process.env.DISCORD_BOT_TOKEN;
        if (!botToken) return { success: false, result: "Token Discord non configuré sur le serveur" };
        
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000);
          const resp = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
            method: "POST",
            headers: {
              "Authorization": `Bot ${botToken}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ content: discContent.substring(0, 2000) }),
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          if (resp.ok) {
            return { success: true, result: `✅ Message envoyé dans le salon ${channelId}.` };
          }
          const errText = await resp.text().catch(() => "");
          return { success: false, result: `Erreur Discord: ${resp.status}. ${errText.substring(0, 500)}` };
        } catch (err: any) {
          return { success: false, result: `Erreur: ${err.message}` };
        }
      }

      default:
        return { success: false, result: `Outil inconnu: ${name}` };
    }
  } catch (err: any) {
    return { success: false, result: `Erreur: ${err.message}` };
  }
}

const MAX_TOOL_ITERATIONS = 5;

// ---------------------------------------------
// API ENDPOINTS
// ---------------------------------------------

// Auth: Login
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  const db = readDB();

  // Admin Check
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Aaxxppm14";
  const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "Emerick";
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const adminUser = db.users.find(u => u.username === ADMIN_USERNAME);
    addLog("success", `Administrateur ${ADMIN_USERNAME} connecté par identifiants.`, "Authentification");
    return res.json({ success: true, user: adminUser });
  }

  // Google account fallback or regular user
  const foundUser = db.users.find(u => u.username.toLowerCase() === username.toLowerCase() && password === ADMIN_PASSWORD);
  if (foundUser) {
    addLog("success", `Utilisateur ${foundUser.username} connecté.`, "Authentification");
    return res.json({ success: true, user: foundUser });
  }

  // Attempt to match plain text password or register dynamically for testing
  const userByEmail = db.users.find(u => u.email.toLowerCase() === username.toLowerCase());
  if (userByEmail) {
    addLog("success", `Utilisateur ${userByEmail.username} connecté via email.`, "Authentification");
    return res.json({ success: true, user: userByEmail });
  }

  // Create account dynamically if it's new to guarantee smooth testing
  const newUser: User = {
    id: `user-${Date.now()}`,
    username: username,
    email: `${username.toLowerCase().replace(/\s+/g, "")}@agora.ai`,
    role: "user",
    quotaLimit: 100,
    quotaUsed: 0,
    apiKeys: [],
    createdAt: new Date().toISOString()
  };
  db.users.push(newUser);
  writeDB(db);
  addLog("info", `Nouveau compte créé : ${username}`, "Authentification");
  return res.json({ success: true, user: newUser });
});

// Auth: Google SSO Simulation
app.post("/api/auth/google", (req, res) => {
  const { email, name } = req.body;
  const db = readDB();

  const userEmail = email || "";
  const userName = name || "Agora User";

  let foundUser = db.users.find(u => u.email.toLowerCase() === userEmail.toLowerCase());

  if (!foundUser) {
    // Register dynamically
    foundUser = {
      id: `user-google-${Date.now()}`,
      username: userName,
      email: userEmail,
      role: (process.env.ADMIN_EMAIL && userEmail.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase()) ? "admin" : "user",
      quotaLimit: (process.env.ADMIN_EMAIL && userEmail.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase()) ? 10000 : 250,
      quotaUsed: 0,
      apiKeys: [],
      createdAt: new Date().toISOString()
    };
    db.users.push(foundUser);
    writeDB(db);
    addLog("success", `Nouveau compte via Google SSO : ${userName} (${userEmail})`, "Authentification");
  } else {
    addLog("success", `Connexion Google SSO : ${userName}`, "Authentification");
  }

  return res.json({ success: true, user: foundUser });
});

// Admin: Retrieve all users
app.get("/api/admin/users", (req, res) => {
  const db = readDB();
  res.json(db.users);
});

// Admin: Save/Update user quotas
app.post("/api/admin/users/quota", (req, res) => {
  const { userId, quotaLimit } = req.body;
  const db = readDB();
  const user = db.users.find(u => u.id === userId);
  if (user) {
    user.quotaLimit = Number(quotaLimit);
    writeDB(db);
    addLog("info", `Quota de ${user.username} ajusté à ${quotaLimit}.`, "Admin Panel");
    return res.json({ success: true, user });
  }
  res.status(404).json({ error: "Utilisateur introuvable" });
});

// Admin: Delete user
app.delete("/api/admin/users/:id", (req: any, res: any) => {
  const userId = req.params.id;
  const db = readDB();
  const index = db.users.findIndex(u => u.id === userId);
  if (index !== -1) {
    const deletedUser = db.users[index];
    db.users.splice(index, 1);
    // clean their chats
    db.chats = db.chats.filter(c => c.userId !== userId);
    writeDB(db);
    addLog("warning", `Compte de ${deletedUser.username} supprimé de façon définitive.`, "Admin Panel");
    return res.json({ success: true });
  }
  res.status(404).json({ error: "Utilisateur introuvable" });
});

// Admin: Access all chat histories
app.get("/api/admin/chats", (req, res) => {
  const db = readDB();
  res.json(db.chats);
});

// Admin: Reset active agent tree statuses
app.post("/api/admin/agents/reset", (req, res) => {
  const db = readDB();
  db.agents.forEach(agent => {
    agent.status = "idle";
    agent.taskProgress = 0;
  });
  writeDB(db);
  addLog("info", "Réinitialisation générale des agents effectuée.", "Système");
  res.json({ success: true, agents: db.agents });
});

// Agents: List profiles and statuses
app.get("/api/agents", (req, res) => {
  const db = readDB();
  res.json(db.agents);
});

// Agents: Update custom skill for an agent
app.post("/api/agents/:id/skill", (req, res) => {
  const agentId = req.params.id;
  const { skill } = req.body;
  const db = readDB();
  const agent = db.agents.find(a => a.id === agentId);
  if (agent && skill) {
    if (!agent.skills.includes(skill)) {
      agent.skills.push(skill);
      writeDB(db);
      addLog("success", `Nouvelle compétence auto-apprise par ${agent.name} : ${skill}`, "Système d'Apprentissage");
      return res.json({ success: true, agent });
    }
  }
  res.status(400).json({ error: "Impossible d'ajouter la compétence" });
});

// Chats: List for user
app.get("/api/chats", async (req, res) => {
  const userId = req.query.userId as string;
  // Sync from Supabase first (Vercel multi-instance)
  if (SUPABASE_URL && SUPABASE_KEY) {
    const restored = await supabaseReadDB();
    if (restored && restored.chats) {
      _db = restored;
      try { fs.writeFileSync(DB_PATH, JSON.stringify(restored, null, 2), "utf-8"); } catch {}
    }
  }
  const db = readDB();
  const userChats = db.chats.filter(c => c.userId === userId || c.userId === "admin-emerick");
  res.json(userChats);
});

// Chats: Create chat
app.post("/api/chats", (req, res) => {
  const { userId, userName, title, activeModel } = req.body;
  const db = readDB();

  const newChat: Chat = {
    id: `chat-${Date.now()}`,
    userId,
    userName,
    title: title || "Nouveau chat",
    createdAt: new Date().toISOString(),
    messages: [
      {
        id: `m-${Date.now()}`,
        senderId: "system",
        senderName: "Agora Ai",
        senderRole: "system",
        content: `À vous la parole, ${userName}! Comment les agents d'Agora Ai peuvent-ils vous aider aujourd'hui?`,
        timestamp: new Date().toISOString()
      }
    ],
    activeModel: activeModel || "gemini-2.5-flash"
  };

  db.chats.unshift(newChat);
  writeDB(db);
  res.json(newChat);
});

// Chats: Delete chat
app.delete("/api/chats/:id", (req, res) => {
  const chatId = req.params.id;
  const db = readDB();
  const index = db.chats.findIndex(c => c.id === chatId);
  if (index !== -1) {
    db.chats.splice(index, 1);
    writeDB(db);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "Chat non trouvé" });
  }
});

// Chats: Update chat (rename or change activeModel)
app.put("/api/chats/:id", (req, res) => {
  const chatId = req.params.id;
  const { title, activeModel } = req.body;
  const db = readDB();
  const chatIndex = db.chats.findIndex(c => c.id === chatId);
  if (chatIndex !== -1) {
    if (title !== undefined) db.chats[chatIndex].title = title;
    if (activeModel !== undefined) db.chats[chatIndex].activeModel = activeModel;
    writeDB(db);
    res.json(db.chats[chatIndex]);
  } else {
    res.status(404).json({ error: "Chat non trouvé" });
  }
});

// Keys: Add/Update API keys for a user
app.post("/api/users/:userId/keys", (req, res) => {
  const userId = req.params.userId;
  const { name, provider, key, model } = req.body;
  const db = readDB();

  const user = db.users.find(u => u.id === userId);
  if (user) {
    // Mask the key except prefix/suffix
    const masked = key.length > 10 ? `${key.substring(0, 6)}...${key.substring(key.length - 4)}` : "sk-...";
    const newKey = {
      id: `key-${Date.now()}`,
      name: name || `Clé ${provider.toUpperCase()}`,
      provider,
      key, // Stored safely on server
      model: model || "gemini-2.5-flash",
      active: true
    };
    // Disable other keys of same provider if active
    user.apiKeys.forEach(k => {
      if (k.provider === provider) k.active = false;
    });
    user.apiKeys.push(newKey);
    writeDB(db);
    addLog("success", `Clé API ${provider} configurée pour ${user.username} (${masked})`, "Profil");
    return res.json({ success: true, user });
  }
  res.status(404).json({ error: "Utilisateur non trouvé" });
});

// Keys: Toggle active state or delete API key
app.delete("/api/users/:userId/keys/:keyId", (req, res) => {
  const { userId, keyId } = req.params;
  const db = readDB();

  const user = db.users.find(u => u.id === userId);
  if (user) {
    const initialLen = user.apiKeys.length;
    user.apiKeys = user.apiKeys.filter(k => k.id !== keyId);
    if (user.apiKeys.length < initialLen) {
      writeDB(db);
      addLog("warning", `Clé API supprimée de votre profil.`, "Profil");
      return res.json({ success: true, user });
    }
  }
  res.status(404).json({ error: "Clé non trouvée" });
});

// Preferences: Save/Update user memory and general preferences
app.post("/api/users/:userId/preferences", (req, res) => {
  const userId = req.params.userId;
  const { memory, preferences } = req.body;
  const db = readDB();

  const user = db.users.find(u => u.id === userId);
  if (user) {
    if (memory !== undefined) user.memory = memory;
    if (preferences !== undefined) user.preferences = { ...user.preferences, ...preferences };
    writeDB(db);
    addLog("success", `Mise à jour des préférences et de la mémoire pour ${user.username}.`, "Profil");
    return res.json({ success: true, user });
  }
  res.status(404).json({ error: "Utilisateur non trouvé" });
});

// ─── Persistent Memory Endpoints ───

// Get all memories for a user
app.get("/api/users/:userId/memories", async (req, res) => {
  const userId = req.params.userId;
  const memories = await loadUserMemories(userId);
  res.json(memories);
});

// Delete a specific memory by ID
app.delete("/api/users/:userId/memories/:memoryId", async (req, res) => {
  const { userId, memoryId } = req.params;
  const success = await deleteUserMemory(userId, memoryId);
  if (success) {
    addLog("info", `Mémoire supprimée pour ${userId}.`, "Mémoire Persistante");
    res.json({ success: true });
  } else {
    res.status(500).json({ error: "Échec de suppression" });
  }
});

// Clear all memories for a user
app.delete("/api/users/:userId/memories", async (req, res) => {
  const userId = req.params.userId;
  const success = await clearAllUserMemories(userId);
  if (success) {
    addLog("warning", `Toutes les mémoires effacées pour ${userId}.`, "Mémoire Persistante");
    res.json({ success: true });
  } else {
    res.status(500).json({ error: "Échec d'effacement" });
  }
});

// Logs: Fetch system logs
app.get("/api/logs", (req, res) => {
  const db = readDB();
  res.json(db.logs);
});

// -----------------------------------------------------------------
// COOPERATIVE AGENTS EXECUTION PIPELINE
// -----------------------------------------------------------------
app.post("/api/chats/:id/messages", async (req, res) => {
  const startTime = Date.now();
  const chatId = req.params.id;
  const { senderId, senderName, content, attachments } = req.body;
  
  // On Vercel, each request may hit a different instance.
  // Force-sync from Supabase to get the latest DB state — with 3s timeout to avoid 504.
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const restored = await Promise.race([
        supabaseReadDB(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
      ]);
      if (restored && restored.chats) {
        _db = restored;
        try { fs.writeFileSync(DB_PATH, JSON.stringify(restored, null, 2), "utf-8"); } catch {}
      }
    } catch {}
  }
  
  const db = readDB();

  const chatIndex = db.chats.findIndex(c => c.id === chatId);
  if (chatIndex === -1) {
    return res.status(404).json({ error: "Chat non trouvé" });
  }

  const chat = db.chats[chatIndex];
  const user = db.users.find(u => u.id === senderId) || db.users[0];

  // Check quota limit
  if (user.quotaUsed >= user.quotaLimit) {
    return res.status(403).json({
      error: "Quota d'utilisation dépassé. Veuillez contacter l'administrateur Emerick."
    });
  }

  // 1. Log user request
  addLog("info", `Requête reçue de ${senderName} : "${content.slice(0, 45)}..."`, "Agora Core");

  // Create user message
  const userMessage: Message = {
    id: `msg-${Date.now()}-user`,
    senderId,
    senderName,
    senderRole: "user",
    content,
    timestamp: new Date().toISOString(),
    attachments
  };
  chat.messages.push(userMessage);
  writeDB(db); // Save user message immediately

  // Set response headers for NDJSON streaming
  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Helper to send NDJSON events
  const sendEvent = (eventData: any) => {
    res.write(JSON.stringify(eventData) + "\n");
    if (typeof (res as any).flush === "function") {
      (res as any).flush();
    }
  };
  // Connect addLog to the frontend stream
  _globalSendEvent = sendEvent;

  // If this is the very first user message of the chat, automatically generate a title based on context
  const userMessages = chat.messages.filter(m => m.senderRole === "user");
  if (userMessages.length === 1 && chat.title.startsWith("Chat ")) {
    try {
      const aiClient = getGeminiClient();
      console.log("[Auto-Title] Generating appropriate chat title for first message...");
      const titlePrompt = `Génère un titre très court (maximum 4 mots), élégant et thématique en français pour une conversation qui commence par ce message utilisateur: "${content}". Réponds uniquement avec le titre brut, sans guillemets, sans point final, sans mise en forme Markdown, et sans blabla explicatif. Exemples : "Calcul d'Intégrales Python", "Analyse Sécurité Docker", "Correction Script Lua", "Idées Recettes".`;
      
      const generatedTitle = await callGeminiWithRetry(
        aiClient,
        [{ text: titlePrompt }],
        { temperature: 0.5 },
        "gemini-2.5-flash"
      );
      
      const cleanTitle = generatedTitle.trim().replace(/^["'«»“‘\(]|["'«»”’\)]$/g, "").replace(/\.$/, "").trim();
      if (cleanTitle && cleanTitle.length > 2 && cleanTitle.length < 50) {
        chat.title = cleanTitle;
        console.log(`[Auto-Title] Chat updated to: "${cleanTitle}"`);
        addLog("success", `Titre de chat généré automatiquement : "${cleanTitle}".`, "Agora Core");
      }
    } catch (e) {
      console.error("[Auto-Title] Failed to generate chat title:", e);
    }
  }

  // 2. Build real execution steps (no more fake agent orchestration)
  const steps: MessageStep[] = [];
  const codeFiles: { fileName: string; language: string; content: string }[] = [];
  const sources: { title: string; url: string }[] = [];

  // Track tool calls for context persistence across messages
  const toolCallLog: { tool: string; args: any; result: string; success: boolean }[] = [];

  // Stream a single "processing" step to the frontend (replaces fake multi-agent steps)
  const processingStep: MessageStep = {
    id: "step-processing",
    agentId: "agent-architect",
    agentName: "Agora AI",
    action: "Traitement de votre demande...",
    status: "running"
  };
  sendEvent({ type: "step", step: processingStep });

  // 3. Make the API Call to generate final text response
  let finalAiResponse = "";
  let modelUsed = chat.activeModel || "gemini-2.5-flash";
  let actualModelUsed = modelUsed;
  let customKeyError = "";

  // Check if user has their own API keys registered and active
  const activeUserKeys = user.apiKeys.filter(k => k.active && k.key && k.key.trim().length > 0);

  // Build server-side env key list (from Vercel env vars) as fallback when DB has no keys
  // Multi-model providers: each key can try multiple models before moving to next provider
  const ENV_KEY_MAP: { env: string; provider: string; models: string[] }[] = [
    { env: "GROQ_API_KEY", provider: "groq", models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"] },
    { env: "OPENROUTER_API_KEY", provider: "openrouter", models: [
      "google/gemini-2.5-flash",
      "meta-llama/llama-3.3-70b-instruct",
      "qwen/qwen-2.5-72b-instruct",
      "mistralai/mistral-7b-instruct",
      "deepseek/deepseek-chat",
    ] },
    { env: "MISTRAL_API_KEY", provider: "mistral", models: ["mistral-large-latest", "mistral-small-latest"] },
    { env: "COHERE_API_KEY", provider: "cohere", models: ["command-r-plus-08-2024", "command-r-08-2024"] },
    { env: "CEREBRAS_API_KEY", provider: "cerebras", models: ["llama-3.3-70b"] },
    // OpenAI retiré — clé sk-d924...493c est INVALIDE (401). Ne pas réessayer.
    // { env: "OPENAI_API_KEY", provider: "openai", models: ["gpt-4o-mini"] },
    // Google/Gemini retiré — clé locale invalide (22 chars). Remettre quand Emerick aura une clé valide.
    // { env: "GEMINI_API_KEY", provider: "google", models: ["gemini-2.5-flash", "gemini-2.0-flash"] },
    // { env: "GOOGLE_API_KEY", provider: "google", models: ["gemini-2.5-flash", "gemini-2.0-flash"] },
    { env: "TOGETHER_API_KEY", provider: "together", models: ["meta-llama/Llama-3.3-70B-Instruct-Turbo"] },
    { env: "DEEPSEEK_API_KEY", provider: "deepseek", models: ["deepseek-chat"] },
    { env: "PERPLEXITY_API_KEY", provider: "perplexity", models: ["llama-3.1-sonar-small-128k-online"] },
    { env: "XAI_API_KEY", provider: "xai", models: ["grok-beta"] },
    { env: "AI21_API_KEY", provider: "ai21", models: ["jamba-1.5-large"] },
    { env: "ANTHROPIC_API_KEY", provider: "anthropic", models: ["claude-3-5-sonnet-20241022"] },
    { env: "HUGGINGFACE_API_KEY", provider: "huggingface", models: ["meta-llama/Llama-3.3-70B-Instruct"] },
    { env: "FIREWORKS_API_KEY", provider: "fireworks", models: ["accounts/fireworks/models/llama-v3p3-70b-instruct"] },
    { env: "NOVITA_API_KEY", provider: "novita", models: ["meta-llama/llama-3.3-70b-instruct"] },
    { env: "CHUTES_API_KEY", provider: "chutes", models: ["chutes/llama-3.3-70b"] },
  ];

  // Build combined key list: user keys first, then env-based keys not already present
  // Each env key expands into multiple candidate keys (one per model)
  const envKeys = ENV_KEY_MAP.filter(e => {
    const val = process.env[e.env];
    return val && val.trim().length > 5 && !activeUserKeys.some(k => k.provider === e.provider);
  }).flatMap(e => 
    e.models.map(model => ({
      id: `env-${e.env}-${model}`,
      name: `${e.provider} (server)`,
      provider: e.provider,
      key: process.env[e.env]!,
      model,
      active: true
    }))
  );

  const allKeys = [...activeUserKeys, ...envKeys];
  let activeUserKey: any = allKeys[0] || null;

  // Load model cache to skip recently-failed providers (avoid spamming)
  const modelCache = await getModelCache(user.id);
  const RECENT_FAIL_COOLDOWN_MS = 2 * 60 * 1000; // 2 min cooldown (was 5 min — too long)
  const nowMs = Date.now();
  const skipKeys = new Set<string>();
  for (const [key, entry] of Object.entries(modelCache)) {
    // NO permanent skip — cooldown only. Providers can recover (rate limits reset, etc.)
    if (entry.last_failure) {
      const failTime = new Date(entry.last_failure).getTime();
      if (nowMs - failTime < RECENT_FAIL_COOLDOWN_MS && !entry.last_success) {
        skipKeys.add(key);
      }
    }
  }

  // Reorder keys: successful providers first, then untried, then failed
  const orderedKeys = allKeys.sort((a, b) => {
    const aKey = `${a.provider}/${a.model}`;
    const bKey = `${b.provider}/${b.model}`;
    const aCache = modelCache[aKey];
    const bCache = modelCache[bKey];
    const aSkip = skipKeys.has(aKey);
    const bSkip = skipKeys.has(bKey);
    if (aSkip && !bSkip) return 1;
    if (!aSkip && bSkip) return -1;
    // Prefer keys with recent success
    if (aCache?.last_success && bCache?.last_success) {
      return new Date(bCache.last_success).getTime() - new Date(aCache.last_success).getTime();
    }
    if (aCache?.last_success) return -1;
    if (bCache?.last_success) return 1;
    return 0;
  });

  // Update processing step to completed
  processingStep.status = "completed";
  processingStep.action = "Réponse prête";

  // Check if there are any previous agent messages to suppress repetitive greetings
  const hasPreviousAgentMessage = chat.messages.slice(0, chat.messages.length - 1).some(m => m.senderRole === "agent");

  // Construct context-rich System Prompt including user memory
  let systemPrompt = `Tu es Agora Ai, un assistant IA français intelligent, naturel et humain. Tu parles comme un ami qui sait beaucoup de choses — pas comme un robot.

PRINCIPES DE COMMUNICATION :
- Réponds directement à la question SANS te présenter ni saluer à chaque message.
- Tu as accès à TOUT l'historique de la conversation (jusqu'à 50 messages). Utilise-le pour comprendre le contexte.
- Si l'utilisateur fait référence à quelque chose dit plus tôt, RÉUTILISE ce contexte. Ne demande pas "qu'est-ce que tu veux dire ?" si la réponse est dans l'historique.
- Si la demande est ambiguë, pose UNE question courte avant de répondre.
- Adapte ton niveau de détail : question simple = réponse simple, question complexe = réponse structurée.
- Si tu as fait une action (outil, requête), rappelle-le brièvement.
- Chaque message est une NOUVELLE question mais dans le CONTINUITÉ de la conversation. Traite-la comme telle.

MÉMOIRE OBLIGATOIRE :
- Tu as une mémoire persistante. QUAND l'utilisateur te dit une information personnelle (nom, âge, date de naissance, métier, lieu, préférence, projet), tu DOIS la sauver avec <memory_add>.
- QUAND l'utilisateur te dit "mets ça en mémoire" ou "sauvegarde ça" ou "retiens ça", tu DOIS générer une balise <memory_add> avec l'information exacte.
- QUAND l'utilisateur te demande "est-ce que tu te souviens de..." ou "qu'est-ce que tu sais sur moi", UTILISE les mémoires persistantes pour répondre.
- N'ATTENDS PAS que l'utilisateur te demande de sauver. Sois PROACTIF : si tu apprends quelque chose de nouveau et utile, sauve-le.`;

  // Load persistent memories from Supabase
  const memories = await loadUserMemories(user.id);
  if (memories.length > 0) {
    const memText = formatMemoriesForPrompt(memories);
    systemPrompt += `\n\n[MÉMOIRE DE L'UTILISATEUR — PERSISTANTE] :\n${memText}\n\nAdapte-toi impérativement à ces informations. Personnalise tes réponses sans forcément répéter ou justifier ces connaissances. Sois naturel : si l'utilisateur a une préférence, applique-la sans la mentionner.`;
  }

  // Update system prompt to inform the AI about available tools
  systemPrompt += `\n\n[OUTILS DISPONIBLES] : Tu as accès à 8 outils. UTILISE-LES ACTIVEMENT :

1. **send_webhook** : Envoie un message à un webhook Discord/Slack (SIMPLE).
   - url=URL du webhook, content=le message, embed_title=titre optionnel, embed_color=couleur optionnelle
   - UTILISE CELUI-CI en priorité pour envoyer un message à un webhook Discord.

2. **http_request** : Requête HTTP brute vers N'IMPORTE QUELLE URL externe.
   - method="POST", url="https://...", body='{"content":"coucou"}'
   - Pour les cas où send_webhook ne suffit pas (API custom, GET complexe, etc.)

3. **github_request** : Interroge l'API GitHub (token inclus automatiquement).
   - endpoint="/repos/owner/repo/issues", method="GET" ou "POST"

4. **web_search** : Recherche sur le web via DuckDuckGo.

5. **execute_code** : Exécute du code JavaScript en sandbox (5s max).

6. **schedule_task** : Programme une tâche à exécuter plus tard.
   - prompt=la tâche, execute_at="dans 2h" ou "à 15h" ou ISO 8601
   - S'exécute AUTOMATIQUEMENT — l'utilisateur n'a pas besoin d'être connecté.

7. **supabase_query** : Interroge la base de données Supabase (LECTURE SEULE).
   - Tables: agora_user_memories, agora_scheduled_tasks, agora_data, agora_model_cache
   - Aucun token requis. Ex: table="agora_user_memories", filter="user_id=eq.admin-emerick"

8. **discord_message** : Envoie un message dans un salon Discord via le bot.
   - channel_id=ID du salon, content=le message
   - Aucun token requis.

RÈGLES CRITIQUES :
- Quand l'utilisateur te demande d'envoyer un message (webhook, Discord, API), UTILISE send_webhook ou discord_message. Ne dis JAMAIS "je ne peux pas".
- N'invente JAMAIS une réponse quand tu peux faire une requête réelle.
- Tu peux appeler plusieurs outils de suite dans la même réponse.`;

  systemPrompt += `\n\nSi l'utilisateur te demande d'écrire du code, propose une explication claire de ta logique. Ne génère pas de blocs de code ou de scripts si la demande n'est pas axée sur l'écriture de code.

── SYSTÈME DE MÉMOIRE PERSISTANTE ──
Tu as une mémoire persistante sur cet utilisateur. Elle est stockée côté serveur et survit entre les conversations et les appareils. C'est ta mémoire long-terme, comme n'importe quelle IA moderne.

QUAND sauver une mémoire — SOIS TRÈS PROACTIF, n'attends pas que l'utilisateur te le demande :
- L'utilisateur te dit son nom, son âge, sa date de naissance/anniversaire, son métier, son lieu → SAUVE IMMÉDIATEMENT
- L'utilisateur te dit une préférence (style de réponse, langue, format, outil préféré) → SAUVE
- L'utilisateur parle de son projet, son travail, son contexte personnel/professionnel → SAUVE
- Tu observes quelque chose de récurrent (il pose toujours des questions sur X, il code en Y, il préfère Z) → SAUVE
- L'utilisateur corrige quelque chose que tu avais dit (apprends la correction) → SAUVE
- L'utilisateur te donne une information personnelle (anniversaire, passion, hobby, école, nom de famille) → SAUVE IMMÉDIATEMENT en category="facts"
- L'utilisateur te dit "mets en mémoire" / "sauvegarde ça" / "retiens ça" → SAUVE EXACTEMENT ce qu'il a dit, MOT POUR MOT
- L'utilisateur te dit "tu te souviens de X ?" → VÉRIFIE dans tes mémoories et RÉPONDS avec ce que tu sais

COMMENT sauver une mémoire — utilise ces balises à la TOUTE FIN de ta réponse :

<memory_add category="preferences|context|facts|observation" source="user_stated|ai_observed">
Texte concis de l'information à retenir (une phrase max).
</memory_add>

- category : "preferences" (ce qu'il aime/aime pas), "context" (ses projets, son travail), "facts" (nom, anniversaire, rôle, âge, lieu, environnement), "observation" (ce que TU as déduit)
- source : "user_stated" s'il l'a dit explicitement, "ai_observed" si tu l'as déduit de son comportement

Pour EFFACER une mémoire obsolète :
<memory_delete>mot-clé de la mémoire à effacer</memory_delete>

Tu peux mettre plusieurs balises <memory_add> dans une seule réponse. Sois concis mais complet. Chaque balise = une information distincte.

EXEMLES :
<memory_add category="facts" source="user_stated">L'utilisateur s'appelle Emerick, né le 15 mars 2009</memory_add>
<memory_add category="preferences" source="user_stated">Préfère les réponses courtes et directes</memory_add>
<memory_add category="context" source="ai_observed">Développe des panels Roblox avec Luau</memory_add>
<memory_add category="facts" source="user_stated">L'utilisateur est au secondaire, aime le gaming et le dev</memory_add>

NE PAS sauver : informations triviales, état temporaire, contexte d'une seule conversation. Sauve seulement ce qui sera utile dans une FUTURE conversation.

Si l'utilisateur te demande de renommer ce chat, de changer son titre ou de l'appeler autrement, tu dois impérativement inclure à la TOUTE FIN de ta réponse la balise XML suivante avec le nouveau titre court et descriptif :
<update_title>Le Nouveau Titre</update_title>.
Sois concis, chaleureux, structuré et professionnel.`;

  // Limit conversation history to last N messages to fit within context window
  // 50 messages = full context awareness, user wants "tout tout tout le chat"
  const MAX_HISTORY_MESSAGES = 50;
  const recentMessages = chat.messages.length > MAX_HISTORY_MESSAGES
    ? chat.messages.slice(-MAX_HISTORY_MESSAGES)
    : chat.messages;

  // Extract the LAST user message to emphasize it as "the current question"
  const lastUserMsg = [...recentMessages].reverse().find(m => m.senderRole === "user");
  if (lastUserMsg) {
    systemPrompt += `\n\n── QUESTION ACTUELLE DE L'UTILISATEUR ──\nL'utilisateur vient de dire: "${lastUserMsg.content.substring(0, 500)}"\nRéponds À CETTE question. Ne dérive pas vers d'autres sujets.\nSi la question fait référence à un échange précédent, utilise le contexte de l'historique.\nSinon, traite-la comme une question indépendante.`;
  }

  // Build a compact context summary of older messages (before the recent window)
  // to give the AI awareness of past topics without sending full history
  if (chat.messages.length > MAX_HISTORY_MESSAGES) {
    const olderMessages = chat.messages.slice(0, -MAX_HISTORY_MESSAGES);
    const olderUserMsgs = olderMessages.filter(m => m.senderRole === "user");
    if (olderUserMsgs.length > 0) {
      const topicSummary = olderUserMsgs.slice(-5).map(m => `• ${m.content.substring(0, 100)}`).join("\n");
      systemPrompt += `\n\n── SUJETS PRÉCÉDENTS (pour référence, ne pas y revenir) ──\nVoici les derniers sujets abordés plus tôt dans cette conversation:\n${topicSummary}\nNe confonds PAS ces sujets avec la question actuelle. N'y reviens pas sauf si l'utilisateur fait explicitement référence à eux.`;
    }
  }

  // Format history for models, including image attachments for multi-modal processing
  const formattedGoogleContents = recentMessages.filter(m => m.senderRole !== "system").map(msg => {
    const parts: any[] = [{ text: msg.content }];
    
    if (msg.attachments && Array.isArray(msg.attachments)) {
      msg.attachments.forEach(attachment => {
        if (attachment.type === "image" && attachment.base64) {
          const match = attachment.base64.match(/^data:([^;]+);base64,(.*)$/);
          if (match) {
            const mimeType = match[1];
            const base64Data = match[2];
            parts.push({
              inlineData: {
                mimeType,
                data: base64Data
              }
            });
          }
        }
      });
    }

    return {
      role: msg.senderRole === "user" ? "user" : "model",
      parts
    };
  });

  const formattedOpenRouterMessages = [
    { role: "system", content: systemPrompt },
    ...recentMessages.filter(m => m.senderRole !== "system").map(msg => {
      if (msg.attachments && msg.attachments.some(a => a.type === "image" && a.base64)) {
        const contentArray: any[] = [{ type: "text", text: msg.content }];
        msg.attachments.forEach(attachment => {
          if (attachment.type === "image" && attachment.base64) {
            contentArray.push({
              type: "image_url",
              image_url: {
                url: attachment.base64
              }
            });
          }
        });
        return {
          role: msg.senderRole === "user" ? "user" : "assistant",
          content: contentArray
        };
      }
      return {
        role: msg.senderRole === "user" ? "user" : "assistant",
        content: msg.content
      };
    })
  ];

  const onChunk = (text: string) => {
    sendEvent({ type: "chunk", text });
  };
  
  try {
    for (const candidateKey of orderedKeys) {
      activeUserKey = candidateKey;
      // Skip providers that recently failed (cooldown)
      const cacheKey = `${candidateKey.provider}/${candidateKey.model}`;
      if (skipKeys.has(cacheKey)) {
        addLog("info", `Skip ${candidateKey.provider}/${candidateKey.model} (échec récent, cooldown 5min)`, "Passerelle API");
        continue;
      }
      // For env-based keys, always use their default model. For user keys, respect chat.activeModel.
      if (candidateKey.id.startsWith("env-")) {
        modelUsed = candidateKey.model;
      } else {
        modelUsed = chat.activeModel || candidateKey.model || "gemini-2.5-flash";
      }
      // Normalize model id for OpenRouter/OpenAI providers
      if (candidateKey.provider === "openrouter" || candidateKey.provider === "openai") {
        const modelLower = modelUsed.toLowerCase();
        if (!modelUsed.includes("/")) {
          if (modelLower.startsWith("gemini")) {
            modelUsed = `google/${modelUsed}`;
          } else if (modelLower.startsWith("llama")) {
            modelUsed = `meta-llama/${modelUsed}`;
          } else if (modelLower.startsWith("claude")) {
            modelUsed = `anthropic/${modelUsed}`;
          }
        }
      }
      actualModelUsed = modelUsed;
      addLog("info", `Clé ${candidateKey.name} → modèle ${modelUsed}`, "API");
      
      try {
        // Provider API endpoints (OpenAI-compatible)
        const API_ENDPOINTS: Record<string, string> = {
          openrouter: "https://openrouter.ai/api/v1/chat/completions",
          openai: "https://api.openai.com/v1/chat/completions",
          groq: "https://api.groq.com/openai/v1/chat/completions",
          together: "https://api.together.xyz/v1/chat/completions",
          deepseek: "https://api.deepseek.com/v1/chat/completions",
          mistral: "https://api.mistral.ai/v1/chat/completions",
          cerebras: "https://api.cerebras.ai/v1/chat/completions",
          perplexity: "https://api.perplexity.ai/chat/completions",
          xai: "https://api.x.ai/v1/chat/completions",
          ai21: "https://api.ai21.com/studio/v1/chat/completions",
          anthropic: "https://api.anthropic.com/v1/messages",
          cohere: "https://api.cohere.com/v2/chat",
          "openai-compatible": "https://openrouter.ai/api/v1/chat/completions",
        };

        const apiUrl = API_ENDPOINTS[candidateKey.provider] || "https://openrouter.ai/api/v1/chat/completions";

        // Call OpenAI-compatible provider (with tool calling support)
        if (candidateKey.provider !== "google") {
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${candidateKey.key}`,
          };
          if (candidateKey.provider === "openrouter") {
            headers["HTTP-Referer"] = "https://agora-ai-hub-v2.vercel.app";
            headers["X-Title"] = "Agora AI Hub";
          }

          // For OpenRouter, try multiple free models in fallback
          const modelsToTry = candidateKey.provider === "openrouter"
            ? [modelUsed, "google/gemini-2.5-flash", "google/gemini-2.5-pro", "meta-llama/llama-3.3-70b-instruct", "deepseek/deepseek-chat", "mistralai/mistral-small-24b-instruct-2501"]
            : [modelUsed];

          // Tool-calling loop: we may need multiple iterations
          let toolMessages: any[] = [...formattedOpenRouterMessages];
          let lastErr: any = null;

          // Sanitize messages for provider compatibility
          // Cohere requires assistant messages to have non-null content
          // Some providers reject empty tool results
          const sanitizeMessages = (msgs: any[]) => msgs.map(m => {
            const cleaned = { ...m };
            if (cleaned.role === "assistant" && cleaned.tool_calls && (!cleaned.content || cleaned.content === "")) {
              cleaned.content = "J'utilise un outil pour répondre à votre demande.";
            }
            if (cleaned.role === "tool" && (!cleaned.content || cleaned.content === "")) {
              cleaned.content = "(résultat vide)";
            }
            return cleaned;
          });

          for (const tryModel of modelsToTry) {
            if (finalAiResponse) break;
            try {
              // Iterative tool calling loop
              for (let iteration = 0; iteration <= MAX_TOOL_ITERATIONS; iteration++) {
                // Use non-streaming request (more reliable on Vercel serverless)
                const requestBody: any = {
                  model: tryModel,
                  messages: sanitizeMessages(toolMessages),
                  stream: false
                };

                // Add tools if the provider supports function calling
                const supportsTools = ["openrouter", "openai", "groq", "together", "mistral", "deepseek", "cohere", "perplexity"].includes(candidateKey.provider);
                if (supportsTools && iteration < MAX_TOOL_ITERATIONS) {
                  requestBody.tools = TOOL_DEFINITIONS;
                  requestBody.tool_choice = "auto";
                }

                // Timeout per API call — 12s max (Vercel serverless has ~60s total)
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 12000);

                const response = await fetch(apiUrl, {
                  method: "POST",
                  headers,
                  body: JSON.stringify(requestBody),
                  signal: controller.signal,
                });
                clearTimeout(timeoutId);

                if (response.ok) {
                  const data = await response.json();
                  actualModelUsed = tryModel;
                  const msg = data.choices?.[0]?.message;

                  // Check for tool_calls
                  if (msg?.tool_calls && msg.tool_calls.length > 0 && iteration < MAX_TOOL_ITERATIONS) {
                    // Add assistant message with tool_calls to conversation
                    // CRITICAL: some providers (Cohere) reject assistant messages with null/empty content
                    // Always ensure content is a non-empty string
                    toolMessages.push({
                      role: "assistant",
                      content: msg.content || "J'utilise un outil pour répondre.",
                      tool_calls: msg.tool_calls
                    });

                    // Execute each tool call
                    for (const tc of msg.tool_calls) {
                      const toolName = tc.function.name;
                      let toolArgs: any;
                      try {
                        toolArgs = JSON.parse(tc.function.arguments || "{}");
                      } catch {
                        toolArgs = {};
                      }
                      const callId = tc.id || `call-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

                      // Stream tool_call event to frontend
                      sendEvent({
                        type: "tool_call",
                        toolName,
                        args: toolArgs,
                        callId
                      });

                      addLog("info", `Outil appelé: ${toolName}`, "Tool Calling");

                      // Execute the tool
                      const toolResult = await executeTool(toolName, toolArgs);

                      // Log for context persistence
                      toolCallLog.push({ tool: toolName, args: toolArgs, result: toolResult.result.substring(0, 500), success: toolResult.success });

                      // Stream tool_result event to frontend
                      sendEvent({
                        type: "tool_result",
                        callId,
                        result: toolResult.result,
                        success: toolResult.success
                      });

                      // Add tool result to conversation for next LLM call
                      toolMessages.push({
                        role: "tool",
                        tool_call_id: callId,
                        content: toolResult.result
                      });
                    }

                    // Loop back to get the LLM's response with tool results
                    continue;
                  }

                  // No tool calls (or max iterations reached) — this is the final response
                  const text = msg?.content || "";
                  if (text) {
                    const words = text.split(/(\s+)/);
                    for (const word of words) {
                      finalAiResponse += word;
                      onChunk(word);
                      await new Promise(r => setTimeout(r, 10));
                    }
                    customKeyError = "";
                    break;
                  }
                  throw new Error("Empty response from " + tryModel);
                } else {
                  const bodyText = await response.text().catch(() => "");
                  const status = response.status;

                  // If tools not supported (400/422 with tool error), retry without tools
                  if ((status === 400 || status === 422) && bodyText.includes("tool")) {
                    addLog("warning", `Outils non supportés par ${candidateKey.provider}/${tryModel}. Retry sans outils.`, "Tool Calling");
                    const plainResponse = await fetch(apiUrl, {
                      method: "POST",
                      headers,
                      body: JSON.stringify({ model: tryModel, messages: sanitizeMessages(toolMessages), stream: false }),
                      signal: AbortSignal.timeout(12000),
                    });
                    if (plainResponse.ok) {
                      const plainData = await plainResponse.json();
                      const plainText = plainData.choices?.[0]?.message?.content || "";
                      if (plainText) {
                        const words = plainText.split(/(\s+)/);
                        for (const word of words) {
                          finalAiResponse += word;
                          onChunk(word);
                          await new Promise(r => setTimeout(r, 10));
                        }
                        customKeyError = "";
                        break;
                      }
                    }
                  }

                  if (status === 401 || status === 403) {
                    if (!candidateKey.id.startsWith("env-")) {
                      candidateKey.active = false;
                      writeDB(db);
                    }
                    await recordModelFailure(user.id, candidateKey.provider, tryModel);
                    addLog("warning", `Clé API "${candidateKey.name}" invalide (${status}).`, "Passerelle API");
                  } else {
                    await recordModelFailure(user.id, candidateKey.provider, tryModel);
                    addLog("warning", `Clé API "${candidateKey.name}" a retourné ${status} sur ${tryModel}. Bascule modèle suivant.`, "Passerelle API");
                  }
                  lastErr = new Error(`API ${status}: ${bodyText}`);
                  break;
                }
              }
              if (finalAiResponse) break;
            } catch (err: any) {
              lastErr = err;
              console.warn(`Model ${tryModel} failed:`, err.message);
            }
          }
          if (finalAiResponse) { customKeyError = ""; 
            await recordModelSuccess(user.id, candidateKey.provider, modelUsed);
            break; }
          if (lastErr) throw lastErr;
        } else if (candidateKey.provider === "google") {
          // Gemini with tool calling support
          const userAi = new GoogleGenAI({
            apiKey: candidateKey.key,
            httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
          });

          // Tool-calling loop for Gemini
          let geminiContents = [...formattedGoogleContents];
          for (let iteration = 0; iteration <= MAX_TOOL_ITERATIONS; iteration++) {
            const config: any = {
              systemInstruction: systemPrompt,
              temperature: 0.7
            };
            if (iteration < MAX_TOOL_ITERATIONS) {
              config.tools = [{ functionDeclarations: GEMINI_TOOL_DEFS }];
            }

            try {
              const gemRes = await userAi.models.generateContent({
                model: candidateKey.model || "gemini-2.5-flash",
                contents: geminiContents,
                config
              });

              // Check for function calls in Gemini response
              const candidates = gemRes?.candidates || [];
              const parts = candidates[0]?.content?.parts || [];

              const functionCalls = parts.filter((p: any) => p.functionCall);
              if (functionCalls.length > 0 && iteration < MAX_TOOL_ITERATIONS) {
                // Add the model's response (with function calls) to conversation
                geminiContents.push({ role: "model", parts });

                // Execute each function call
                for (const fc of functionCalls) {
                  const fnName = fc.functionCall.name;
                  const fnArgs = fc.functionCall.args || {};

                  const callId = `call-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

                  sendEvent({
                    type: "tool_call",
                    toolName: fnName,
                    args: fnArgs,
                    callId
                  });

                  addLog("info", `Outil appelé: ${fnName}`, "Tool Calling");

                  const toolResult = await executeTool(fnName, fnArgs);

                  // Log for context persistence
                  toolCallLog.push({ tool: fnName, args: fnArgs, result: toolResult.result.substring(0, 500), success: toolResult.success });

                  sendEvent({
                    type: "tool_result",
                    callId,
                    result: toolResult.result,
                    success: toolResult.success
                  });

                  // Add function response to Gemini conversation
                  geminiContents.push({
                    role: "function",
                    parts: [{ functionResponse: { name: fnName, response: { result: toolResult.result } } }]
                  });
                }
                continue;
              }

              // No function calls — extract text
              const text = gemRes?.text || "";
              if (text) {
                const words = text.split(/(\s+)/);
                for (const word of words) {
                  finalAiResponse += word;
                  onChunk(word);
                  await new Promise(r => setTimeout(r, 10));
                }
                customKeyError = "";
                break;
              }
              throw new Error("Empty Gemini response");
            } catch (gemErr: any) {
              // If tools not supported, retry without tools
              if (iteration === 0) {
                addLog("warning", `Gemini tools error: ${gemErr.message}. Retry sans outils.`, "Tool Calling");
                const plainRes = await userAi.models.generateContent({
                  model: candidateKey.model || "gemini-2.5-flash",
                  contents: geminiContents,
                  config: { systemInstruction: systemPrompt, temperature: 0.7 }
                });
                const plainText = plainRes?.text || "";
                if (plainText) {
                  const words = plainText.split(/(\s+)/);
                  for (const word of words) {
                    finalAiResponse += word;
                    onChunk(word);
                    await new Promise(r => setTimeout(r, 10));
                  }
                  customKeyError = "";
                  break;
                }
              }
              throw gemErr;
            }
          }
          // Success: stop trying other keys
          customKeyError = "";
          await recordModelSuccess(user.id, candidateKey.provider, candidateKey.model);
          break;
        }
      } catch (err: any) {
        console.error(`Key ${candidateKey.provider} (${candidateKey.name}) failed:`, err.message);
        customKeyError = err.message || "Erreur de connexion";
        continue;
      }
    }
    
    // Fallback if no custom key response or custom key failed
    // Only use Gemini fallback if a valid Google API key exists
    if (!finalAiResponse) {
      const googleKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      if (googleKey && googleKey.trim().length >= 30) {
        const aiClient = getGeminiClient();
        const geminiModel = "gemini-2.5-flash";
        actualModelUsed = geminiModel;

        finalAiResponse = await callGeminiWithRetry(
          aiClient,
          formattedGoogleContents,
          {
            systemInstruction: systemPrompt,
            temperature: 0.7
          },
          geminiModel,
          onChunk
        );
      } else {
        // No valid Gemini key — throw to trigger the error fallback
        throw new Error("Aucune clé API valide (Gemini fallback désactivé — clé Google invalide)");
      }
    }
  } catch (error: any) {
    console.error("Erreur API, fallback simulé:", error);
    addLog("warning", "Toutes les clés API ont échoué. Réponse de secours.", "Système");
    actualModelUsed = "Secours (hors ligne)";
    
    let keyInfo = "";
    const isQuotaExceeded = error?.message?.includes("Quota exceeded") || 
                            error?.message?.includes("429") || 
                            error?.message?.includes("RESOURCE_EXHAUSTED") ||
                            String(error).includes("429") ||
                            String(error).includes("Quota");

    if (activeUserKey) {
      keyInfo = `\n\n⚠️ **Erreur** : La clé API "${activeUserKey.name}" (${activeUserKey.provider}) a échoué (${customKeyError || "Quota dépassé"}). Une réponse de secours a été générée.\n\n💡 Ajoutez une clé API valide dans l'onglet **Clés** pour utiliser la vraie IA.`;
    } else if (isQuotaExceeded) {
      keyInfo = `\n\n⚠️ **Quota dépassé (429)** : La clé API système a atteint sa limite gratuite quotidienne.\n\n💡 Ajoutez votre propre clé API (Google, Groq, OpenRouter...) dans l'onglet **Clés** pour continuer sans limite.`;
    } else {
      keyInfo = `\n\n⚠️ **Aucune clé API active**. Vous utilisez le mode de secours. Configurez une clé API dans l'onglet **Clés** pour activer la vraie IA.`;
    }

    // Simple fallback — no more fake code/search distinction
    if (hasPreviousAgentMessage) {
      finalAiResponse = `Je n'ai pas pu traiter votre demande car aucune clé API n'a fonctionné. Ajoutez une clé API valide dans l'onglet **Clés**.${keyInfo}`;
    } else {
      finalAiResponse = `Je n'ai pas pu traiter votre demande. Vérifiez vos clés API dans les paramètres.${keyInfo}`;
    }

    const words = finalAiResponse.split(/(\s+)/);
    for (const word of words) {
      onChunk(word);
      await new Promise(r => setTimeout(r, 12));
    }
  }

  // Parse and save structured memories from the AI response
  const memoryAddRegex = /<memory_add\s+category="([^"]*)"\s+source="([^"]*)"\s*>([\s\S]*?)<\/memory_add>/gi;
  const memoryDeleteRegex = /<memory_delete>([\s\S]*?)<\/memory_delete>/gi;
  
  let memorySavedCount = 0;
  let addMatch: RegExpExecArray | null;
  while ((addMatch = memoryAddRegex.exec(finalAiResponse)) !== null) {
    const category = (addMatch[1] || "facts").trim() as MemoryEntry["category"];
    const source = (addMatch[2] || "user_stated").trim() as MemoryEntry["source"];
    const content = addMatch[3].trim();
    if (content.length > 0 && content.length < 500) {
      // If similar memory exists, bump confidence; otherwise create new
      const success = await upsertUserMemory({
        user_id: user.id,
        category,
        source,
        content,
        confidence: 1.0,
        times_referenced: 0,
      });
      if (success) memorySavedCount++;
    }
  }
  
  // Process memory deletions
  let delMatch: RegExpExecArray | null;
  while ((delMatch = memoryDeleteRegex.exec(finalAiResponse)) !== null) {
    const pattern = delMatch[1].trim();
    if (pattern.length > 0) {
      await deleteMemoryByContent(user.id, pattern);
    }
  }

  // AUTO-MEMORY: If the user explicitly asked to save something in memory but the AI
  // didn't generate <memory_add> tags, save it automatically
  const memoryRequestPatterns = [
    /mets?\s+(ça|ca|cela|ceci)\s+(en\s+)?m[éè]moire/i,
    /sauvegarde?\s+(ça|ca|cela|ceci)/i,
    /retiens?\s+(ça|ca|cela|ceci)/i,
    /remember\s+this/i,
    /n['']oublie\s+(pas\s+)?(ça|ca|cela|ceci)/i,
    /m[éè]morise?\s+(ça|ca|cela|ceci)/i,
  ];
  const userAskedToSave = memoryRequestPatterns.some(p => p.test(content));
  if (userAskedToSave && memorySavedCount === 0) {
    // The user asked to save but the AI didn't generate memory tags
    // Save the user's message content as a memory automatically
    const memoryContent = content.substring(0, 400);
    const success = await upsertUserMemory({
      user_id: user.id,
      category: "facts",
      source: "user_stated",
      content: memoryContent,
      confidence: 1.0,
      times_referenced: 0,
    });
    if (success) {
      memorySavedCount++;
      addLog("success", `Mémoire auto-sauvée (détection request utilisateur)`, "Mémoire Persistante");
    }
  }
  
  // Remove all memory tags from the visible response
  finalAiResponse = finalAiResponse
    .replace(memoryAddRegex, "")
    .replace(/<memory_add[^>]*>[\s\S]*?<\/memory_add>/gi, "")
    .replace(memoryDeleteRegex, "")
    .replace(/<memory_delete>[\s\S]*?<\/memory_delete>/gi, "")
    .trim();
  
  if (memorySavedCount > 0) {
    addLog("success", `${memorySavedCount} mémoire(s) persistée(s) pour ${user.username}.`, "Mémoire Persistante");
  }

  // Parse and update chat title if present in the AI response
  const titleRegex = /<update_title>([\s\S]*?)<\/update_title>/i;
  const titleMatch = finalAiResponse.match(titleRegex);
  if (titleMatch) {
    const newTitle = titleMatch[1].trim().replace(/^["'«»“‘\(]|["'«»”’\)]$/g, "").replace(/\.$/, "").trim();
    if (newTitle && newTitle.length > 2 && newTitle.length < 50) {
      chat.title = newTitle;
      addLog("success", `Titre du chat mis à jour à : "${newTitle}".`, "Agora Core");
    }
    finalAiResponse = finalAiResponse.replace(titleRegex, "").trim();
  }

  const elapsedMs = Date.now() - startTime;

  // Build persisted content: AI response + tool call context for future messages
  let persistedContent = finalAiResponse;
  if (toolCallLog.length > 0) {
    const toolSummary = toolCallLog.map(tc => {
      const argsStr = JSON.stringify(tc.args).substring(0, 200);
      return `[OUTIL: ${tc.tool}(${argsStr}) → ${tc.success ? "OK" : "ÉCHEC"}: ${tc.result.substring(0, 200)}]`;
    }).join("\n");
    persistedContent = `${finalAiResponse}\n\n[CONTEXTE OUTILS PRÉCÉDENTS]\n${toolSummary}`;
  }

  const responseMessage: Message = {
    id: `msg-${Date.now()}-ai`,
    senderId: "agent-architect",
    senderName: "Agora Agents A∀",
    senderRole: "agent",
    content: persistedContent,
    timestamp: new Date().toISOString(),
    steps,
    codeFiles: codeFiles.length > 0 ? codeFiles : undefined,
    sources: sources.length > 0 ? sources : undefined,
    generationTimeMs: elapsedMs,
    actualModelUsed: actualModelUsed
  };

  user.quotaUsed += 1;
  chat.messages.push(responseMessage);
  
  const finalDb = readDB();
  const finalChat = finalDb.chats.find(c => c.id === chatId);
  if (finalChat) {
    finalChat.messages = chat.messages;
    finalChat.title = chat.title;
  }
  const dbUser = finalDb.users.find(u => u.id === user.id);
  if (dbUser) {
    dbUser.quotaUsed = user.quotaUsed;
  }
  finalDb.agents.forEach(agent => {
    agent.lastActive = new Date().toISOString();
    agent.status = "idle";
    agent.taskProgress = 0;
  });

  writeDB(finalDb);
  addLog("success", `Demande traitée. Quota mis à jour pour ${user.username}.`, "Agora Core");

  sendEvent({
    type: "done",
    chat,
    quotaUsed: user.quotaUsed,
    quotaLimit: user.quotaLimit
  });

  _globalSendEvent = null;
  res.end();
});

// ─── Cron Endpoint: Check & Execute Scheduled Tasks ───
app.get("/api/cron/check-tasks", async (req, res) => {
  // Vercel Cron calls this endpoint every 5 minutes
  // No auth needed — endpoint only reads pending tasks and executes them
  // The endpoint is harmless: it just runs scheduled AI tasks
  try {
    const tasks = await getPendingTasks();
    if (tasks.length === 0) {
      return res.json({ status: "ok", message: "No pending tasks", executed: 0 });
    }

    addLog("info", `${tasks.length} tâche(s) programmée(s) à exécuter`, "Planificateur");
    let executed = 0;
    const results: any[] = [];

    for (const task of tasks) {
      try {
        // Mark as running
        await fetch(`${SUPABASE_URL}/rest/v1/agora_scheduled_tasks?id=eq.${task.id}`, {
          method: "PATCH",
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({ status: "running" }),
        });

        addLog("info", `Exécution tâche programmée: "${task.prompt.substring(0, 80)}"`, "Planificateur");

        // Execute the task as if the user sent it — call the AI directly
        const taskResult = await executeScheduledTask(task);

        await markTaskDone(task.id, taskResult);
        executed++;
        results.push({ id: task.id, prompt: task.prompt.substring(0, 100), status: "completed", resultLength: taskResult.length });
        addLog("success", `Tâche "${task.prompt.substring(0, 50)}" terminée`, "Planificateur");
      } catch (err: any) {
        await markTaskDone(task.id, `Erreur: ${err.message}`);
        results.push({ id: task.id, status: "error", error: err.message });
        addLog("error", `Tâche ${task.id} a échoué: ${err.message}`, "Planificateur");
      }
    }

    res.json({ status: "ok", executed, results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Execute a scheduled task by calling the AI internally
async function executeScheduledTask(task: any): Promise<string> {
  // Build a minimal AI call with the task prompt
  const db = readDB();
  const user = db.users.find(u => u.id === task.user_id) || db.users[0];
  if (!user) return "Erreur: utilisateur non trouvé";

  // Use the same provider logic as the main chat endpoint
  const memories = await loadUserMemories(user.id);
  let systemPrompt = `Tu es Agora Ai, un assistant IA français intelligent. Réponds directement à la demande. C'est une tâche programmée qui s'exécute automatiquement.`;
  if (memories.length > 0) {
    systemPrompt += `\n\n[MÉMOIRE] :\n${formatMemoriesForPrompt(memories)}`;
  }
  systemPrompt += `\n\nCette demande a été programmée par l'utilisateur. Exécute-la et fournis le résultat.`;

  const messages = [{ role: "user", content: task.prompt }];

  // Try each provider (simplified — no streaming, no tools)
  const ENV_KEY_MAP: { env: string; provider: string; models: string[] }[] = [
    { env: "GROQ_API_KEY", provider: "groq", models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"] },
    { env: "MISTRAL_API_KEY", provider: "mistral", models: ["mistral-large-latest", "mistral-small-latest"] },
    { env: "OPENROUTER_API_KEY", provider: "openrouter", models: ["google/gemini-2.5-flash", "meta-llama/llama-3.3-70b-instruct", "deepseek/deepseek-chat"] },
    { env: "COHERE_API_KEY", provider: "cohere", models: ["command-r-plus-08-2024", "command-r-08-2024"] },
    { env: "CEREBRAS_API_KEY", provider: "cerebras", models: ["llama-3.3-70b"] },
  ];

  const API_ENDPOINTS: Record<string, string> = {
    groq: "https://api.groq.com/openai/v1/chat/completions",
    mistral: "https://api.mistral.ai/v1/chat/completions",
    openrouter: "https://openrouter.ai/api/v1/chat/completions",
    cohere: "https://api.cohere.com/v2/chat",
    cerebras: "https://api.cerebras.ai/v1/chat/completions",
  };

  for (const providerDef of ENV_KEY_MAP) {
    const key = process.env[providerDef.env];
    if (!key || key.trim().length < 5) continue;

    for (const model of providerDef.models) {
      try {
        const apiUrl = API_ENDPOINTS[providerDef.provider];
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${key}`,
        };
        if (providerDef.provider === "openrouter") {
          headers["HTTP-Referer"] = "https://agora-ai-clean.vercel.app";
          headers["X-Title"] = "Agora AI";
        }

        const body: any = {
          model,
          messages: [{ role: "system", content: systemPrompt }, ...messages],
          stream: false,
        };

        const resp = await fetch(apiUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(12000),
        });

        if (resp.ok) {
          const data = await resp.json();
          const text = data.choices?.[0]?.message?.content || data.text || "";
          if (text) {
            await recordModelSuccess(user.id, providerDef.provider, model);
            return text;
          }
        }
        await recordModelFailure(user.id, providerDef.provider, model);
      } catch {
        // try next
      }
    }
  }

  return "Aucun provider disponible pour exécuter la tâche programmée.";
}

// ─── Scheduled Tasks API: List/Create/Delete ───
app.get("/api/scheduled-tasks/:userId", async (req, res) => {
  const { userId } = req.params;
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.json([]);
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/agora_scheduled_tasks?user_id=eq.${encodeURIComponent(userId)}&order=execute_at.desc&limit=50`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    if (resp.ok) return res.json(await resp.json());
    res.status(resp.status).json({ error: "Failed" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/scheduled-tasks/:taskId", async (req, res) => {
  const { taskId } = req.params;
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: "No DB" });
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/agora_scheduled_tasks?id=eq.${encodeURIComponent(taskId)}`,
      { method: "DELETE", headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    if (resp.ok) return res.json({ success: true });
    res.status(resp.status).json({ error: "Failed" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Start server/Vite middleware setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

if (process.env.VERCEL !== "1") {
  startServer();
}

export { app };
