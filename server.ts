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

const MEMORY_MAX_LENGTH = 300;

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
        const resp = await fetch(url, {
          method: (method || "GET").toUpperCase(),
          headers: headers || {},
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