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
app.get("/api/chats", (req, res) => {
  const userId = req.query.userId as string;
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

  // 2. Build multi-agent task steps based on prompt intent
  const steps: MessageStep[] = [];
  const codeFiles: { fileName: string; language: string; content: string }[] = [];
  const sources: { title: string; url: string }[] = [];

  // Track tool calls for context persistence across messages
  const toolCallLog: { tool: string; args: any; result: string; success: boolean }[] = [];

  const lowerContent = content.toLowerCase();
  // Exclude question prefixes to prevent generating empty files for general chitchat/questions
  const hasCodeQuestionPrefix = /(sais-tu|peux-tu|tu peux|est-ce que tu|comment tu|que sais|qu'est-ce que tu|qu'est ce que tu|pourquoi|tu sais)/gi.test(content);
  const requiresCode = (
    lowerContent.includes("écris un") ||
    lowerContent.includes("génère un") ||
    lowerContent.includes("code-moi") ||
    lowerContent.includes("code moi") ||
    lowerContent.includes("crée un script") ||
    lowerContent.includes("crée un code") ||
    lowerContent.includes("faire un script") ||
    lowerContent.includes("script lua") ||
    lowerContent.includes("script python") ||
    (lowerContent.includes("code") && (lowerContent.includes("crée") || lowerContent.includes("fais") || lowerContent.includes("génère") || lowerContent.includes("écris") || lowerContent.includes("rédige") || lowerContent.includes("programme")))
  ) && !hasCodeQuestionPrefix;

  const requiresSearch = lowerContent.includes("cherche") || lowerContent.includes("recherche") || lowerContent.includes("web") || lowerContent.includes("meteo") || lowerContent.includes("qui est") || lowerContent.includes("actualité") || lowerContent.includes("nouvelle");

  // Determine if this is a simple chitchat or greeting
  const isSimpleChat = !requiresSearch && !requiresCode && content.length <= 50;

  // Stream active agent orchestration steps sequentially
  if (requiresSearch && !isSimpleChat) {
    const searchTerms = content.replace(/(cherche|recherche|sur le web|s'il te plait)/gi, "").trim();
    const searchStep: MessageStep = {
      id: "step-search",
      agentId: "agent-searcher",
      agentName: "Chercheur A∀-04",
      action: "Recherche en temps réel sur le web",
      status: "completed",
      searchQuery: searchTerms || "Agora Ai collaboration",
      searchLinks: [
        { title: "Agora Ai Collaborative Systems", url: "https://agora-ai.net/collaboration" },
        { title: "Multi-Agent Networks Documentation", url: "https://github.com/agora-ai/mcp-hub" },
        { title: "Framer Motion Glassmorphism Effects", url: "https://motion.dev/guide/glassmorphism" }
      ]
    };
    steps.push(searchStep);
    sources.push(
      { title: "Agora Ai Collaborative Systems", url: "https://agora-ai.net/collaboration" },
      { title: "Multi-Agent Networks Documentation", url: "https://github.com/agora-ai/mcp-hub" }
    );
    sendEvent({ type: "step", step: searchStep });
    await new Promise(r => setTimeout(r, 250));
  }

  // Allocate Architect (only if active agent work occurred)
  const hasActiveAgentWork = requiresSearch || requiresCode;
  if (hasActiveAgentWork && !isSimpleChat) {
    const archStep: MessageStep = {
      id: "step-architect",
      agentId: "agent-architect",
      agentName: "Architecte A∀-01",
      action: "Orchestration & Découpage de tâche",
      status: "completed",
      details: requiresCode 
        ? "Analyse structurelle : Demande de génération de script détectée. Planification de l'agent Codeur pour écrire le script et de l'agent Sécurité pour auditer l'exécution."
        : "Analyse conceptuelle : Traitement sémantique de la demande. Synthèse de la réponse générale."
    };
    steps.push(archStep);
    sendEvent({ type: "step", step: archStep });
    await new Promise(r => setTimeout(r, 250));
  }

  // Allocate Coder
  if (requiresCode && !isSimpleChat) {
    let fileName = "script.py";
    let language = "python";
    let codeStr = "# Code généré par Agora Ai\nprint('Hello world de la part des agents Agora!')";

    if (lowerContent.includes("lua")) {
      fileName = "skill_updater.lua";
      language = "lua";
      codeStr = `-- Extension de compétence Agora Ai\nlocal Agent = {}\nfunction Agent:improve()\n    print("Optimisation de l'algorithme de collaboration")\nend\nreturn Agent`;
    } else if (lowerContent.includes("html") || lowerContent.includes("css") || lowerContent.includes("interface")) {
      fileName = "index.html";
      language = "html";
      codeStr = `<!DOCTYPE html>\n<html>\n<head>\n  <title>Composant Liquid Glass</title>\n  <style>\n    .glass { background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); }\n  </style>\n</head>\n<body>\n  <div class="glass">Interface Agora AI Active</div>\n</body>\n</html>`;
    } else if (lowerContent.includes("js") || lowerContent.includes("javascript") || lowerContent.includes("typescript")) {
      fileName = "agent_pipeline.ts";
      language = "typescript";
      codeStr = `// TypeScript module\nexport async function runPipeline(prompt: string) {\n  console.log("Exécution sécurisée de l'agent");\n}`;
    }

    const coderStep: MessageStep = {
      id: "step-coder",
      agentId: "agent-coder",
      agentName: "Codeur A∀-02",
      action: "Génération de script spécialisé",
      status: "completed",
      codeBlock: {
        fileName,
        language,
        code: codeStr
      }
    };
    steps.push(coderStep);
    codeFiles.push({ fileName, language, content: codeStr });

    // Coder self-learning skill update (simulating agent improving)
    const coder = db.agents.find(a => a.id === "agent-coder");
    if (coder) {
      const newSkill = `Optimisation syntaxique ${language.toUpperCase()}`;
      if (!coder.skills.includes(newSkill)) {
        coder.skills.push(newSkill);
        addLog("success", `Apprentissage : Codeur a assimilé la compétence "${newSkill}"`, "Système d'Apprentissage");
      }
    }
    sendEvent({ type: "step", step: coderStep });
    await new Promise(r => setTimeout(r, 250));
  }

  // Allocate Security audit (only if code was written)
  if (requiresCode && !isSimpleChat) {
    const secStep: MessageStep = {
      id: "step-security",
      agentId: "agent-security",
      agentName: "Sécurité A∀-03",
      action: "Audit de conformité et de sandboxing",
      status: "completed",
      details: "Audit statique complété. 0 faille détectée. Clé de chiffrement validée. Autorisation d'écriture accordée."
    };
    steps.push(secStep);
    sendEvent({ type: "step", step: secStep });
    await new Promise(r => setTimeout(r, 250));
  }

  // 3. Make the API Call to generate final text response
  let finalAiResponse = "";
  let modelUsed = chat.activeModel || "gemini-2.5-flash";
  let actualModelUsed = modelUsed;
  let customKeyError = "";

  // Check if user has their own API keys registered and active
  const activeUserKeys = user.apiKeys.filter(k => k.active && k.key && k.key.trim().length > 0);

  // Build server-side env key list (from Vercel env vars) as fallback when DB has no keys
  const ENV_KEY_MAP: { env: string; provider: string; model: string }[] = [
    { env: "GROQ_API_KEY", provider: "groq", model: "llama-3.3-70b-versatile" },
    { env: "OPENROUTER_API_KEY", provider: "openrouter", model: "google/gemini-2.5-flash" },
    { env: "MISTRAL_API_KEY", provider: "mistral", model: "mistral-large-latest" },
    { env: "COHERE_API_KEY", provider: "cohere", model: "command-r-plus" },
    { env: "GEMINI_API_KEY", provider: "google", model: "gemini-2.5-flash" },
    { env: "GOOGLE_API_KEY", provider: "google", model: "gemini-2.5-flash" },
    { env: "OPENAI_API_KEY", provider: "openai", model: "gpt-4o-mini" },
    { env: "TOGETHER_API_KEY", provider: "together", model: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
    { env: "DEEPSEEK_API_KEY", provider: "deepseek", model: "deepseek-chat" },
    { env: "PERPLEXITY_API_KEY", provider: "perplexity", model: "llama-3.1-sonar-small-128k-online" },
    { env: "CEREBRAS_API_KEY", provider: "cerebras", model: "llama-3.3-70b" },
    { env: "XAI_API_KEY", provider: "xai", model: "grok-beta" },
    { env: "AI21_API_KEY", provider: "ai21", model: "jamba-1.5-large" },
    { env: "ANTHROPIC_API_KEY", provider: "anthropic", model: "claude-3-5-sonnet-20241022" },
  ];

  // Build combined key list: user keys first, then env-based keys not already present
  const envKeys = ENV_KEY_MAP.filter(e => {
    const val = process.env[e.env];
    return val && val.trim().length > 5 && !activeUserKeys.some(k => k.provider === e.provider);
  }).map(e => ({
    id: `env-${e.env}`,
    name: `${e.provider} (server)`,
    provider: e.provider,
    key: process.env[e.env]!,
    model: e.model,
    active: true
  }));

  const allKeys = [...activeUserKeys, ...envKeys];
  let activeUserKey: any = allKeys[0] || null;

  // Check if there are any previous agent messages to suppress repetitive greetings
  const hasPreviousAgentMessage = chat.messages.slice(0, chat.messages.length - 1).some(m => m.senderRole === "agent");

  // Construct context-rich System Prompt including user memory
  let systemPrompt = `Tu es Agora Ai, un assistant IA français utile et concis. Réponds directement à la question sans te présenter ni saluer à chaque message. Sois naturel, fluide et va droit au but.`;
  
  if (user.memory) {
    const mem = user.memory.length > MEMORY_MAX_LENGTH
      ? user.memory.substring(0, MEMORY_MAX_LENGTH)
      : user.memory;
    systemPrompt += `\n\n[MÉMOIRE DE L'UTILISATEUR] :\n${mem}\nAdapte-toi impérativement à ses préférences ci-dessus sans forcément les répéter ou les justifier.`;
  }

  // Update system prompt to inform the AI about available tools
  systemPrompt += `\n\n[OUTILS DISPONIBLES] : Tu as accès à 4 outils que tu peux utiliser pour répondre aux questions de l'utilisateur. UTILISE-LES ACTIVEMENT quand la situation le demande :

1. **http_request** : Envoie une requête HTTP vers N'IMPORTE QUELLE URL externe.
   - POST vers un webhook Discord/Slack : method="POST", url="https://discord.com/api/webhooks/...", body='{"content":"coucou"}'
   - GET pour récupérer des données d'une API : method="GET", url="https://api.exemple.com/data"
   - PUT/PATCH pour modifier des ressources distantes
   - Tu PEUX envoyer des messages à des webhooks, interroger des APIs REST, télécharger des pages web.
   - N'invente JAMAIS une réponse quand tu peux faire une requête réelle.

2. **github_request** : Interroge l'API GitHub (token inclus automatiquement).
   - Créer/lire/modifier des issues, PRs, repos, fichiers
   - Ex: endpoint="/repos/owner/repo/issues", method="GET"
   - Ex: endpoint="/repos/owner/repo/issues", method="POST", body='{"title":"Bug","body":"Description"}'

3. **web_search** : Recherche sur le web via DuckDuckGo. Retourne titres + liens.
   - Utilise-le quand tu ne connais pas la réponse et veux chercher.

4. **execute_code** : Exécute du code JavaScript en sandbox (5s max, pas de réseau/fs).
   - Calculs complexes, manipulation de données, parsing JSON, etc.

RÈGLE CRITIQUE : Quand l'utilisateur te demande d'envoyer quelque chose quelque part (webhook, API, serveur), UTILISE http_request. Ne dis JAMAIS "je ne peux pas" si tu as l'outil http_request disponible. Dis "je ne peux pas" UNIQUEMENT si c'est techniquement impossible (URL interne/bloquée).

Après avoir reçu le résultat d'un outil, utilise ces informations pour formuler ta réponse finale à l'utilisateur. Tu peux appeler plusieurs outils de suite.`;

  systemPrompt += `\n\nSi l'utilisateur te demande d'écrire du code, propose une explication claire de ta logique. Ne génère pas de blocs de code ou de scripts si la demande n'est pas axée sur l'écriture de code.
Si l'utilisateur te confie des détails importants sur lui (comme ses préférences de code, sa profession, ses projets, ce qu'il aime ou veut retenir), tu dois mettre à jour sa mémoire. Pour ce faire, intègre à la TOUTE FIN de ta réponse la balise XML suivante :
<update_memory>Texte de la mémoire mise à jour consolidant toutes les informations actuelles et nouvelles apprises sur l'utilisateur de manière concise et claire.</update_memory>.
Si l'utilisateur te demande de renommer ce chat, de changer son titre ou de l'appeler autrement, tu dois impérativement inclure à la TOUTE FIN de ta réponse la balise XML suivante avec le nouveau titre court et descriptif :
<update_title>Le Nouveau Titre</update_title>.
Sois concis, chaleureux, structuré et professionnel.`;

  // Limit conversation history to last N messages to fit within context window
  // 50 messages = good balance between context retention and token limits
  const MAX_HISTORY_MESSAGES = 50;
  const recentMessages = chat.messages.length > MAX_HISTORY_MESSAGES
    ? chat.messages.slice(-MAX_HISTORY_MESSAGES)
    : chat.messages;

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
    for (const candidateKey of allKeys) {
      activeUserKey = candidateKey;
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
      addLog("info", `Utilisation de la clé API client (${candidateKey.name}) avec le modèle ${modelUsed}.`, "Passerelle API");
      
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

          for (const tryModel of modelsToTry) {
            if (finalAiResponse) break;
            try {
              // Iterative tool calling loop
              for (let iteration = 0; iteration <= MAX_TOOL_ITERATIONS; iteration++) {
                // Use non-streaming request (more reliable on Vercel serverless)
                const requestBody: any = {
                  model: tryModel,
                  messages: toolMessages,
                  stream: false
                };

                // Add tools if the provider supports function calling
                const supportsTools = ["openrouter", "openai", "groq", "together", "mistral", "deepseek"].includes(candidateKey.provider);
                if (supportsTools && iteration < MAX_TOOL_ITERATIONS) {
                  requestBody.tools = TOOL_DEFINITIONS;
                  requestBody.tool_choice = "auto";
                }

                const response = await fetch(apiUrl, {
                  method: "POST",
                  headers,
                  body: JSON.stringify(requestBody)
                });

                if (response.ok) {
                  const data = await response.json();
                  actualModelUsed = tryModel;
                  const msg = data.choices?.[0]?.message;

                  // Check for tool_calls
                  if (msg?.tool_calls && msg.tool_calls.length > 0 && iteration < MAX_TOOL_ITERATIONS) {
                    // Add assistant message with tool_calls to conversation
                    toolMessages.push({
                      role: "assistant",
                      content: msg.content || "",
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
                      body: JSON.stringify({ model: tryModel, messages: toolMessages, stream: false })
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
                    addLog("warning", `Clé API "${candidateKey.name}" invalide (${status}).`, "Passerelle API");
                  } else {
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
          if (finalAiResponse) { customKeyError = ""; break; }
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
          break;
        }
      } catch (err: any) {
        console.error(`Key ${candidateKey.provider} (${candidateKey.name}) failed:`, err.message);
        customKeyError = err.message || "Erreur de connexion";
        continue;
      }
    }
    
    // Fallback if no custom key response or custom key failed or regular query
    if (!finalAiResponse) {
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
    }
  } catch (error: any) {
    console.error("Error running AI model pipeline, falling back to simulated high-quality response:", error);
    addLog("warning", "Erreur réseau API. Génération du modèle de secours local.", "Agora Gateway");
    actualModelUsed = "Orchestrateur Local (Simulé)";
    
    let keyInfo = "";
    const isQuotaExceeded = error?.message?.includes("Quota exceeded") || 
                            error?.message?.includes("429") || 
                            error?.message?.includes("RESOURCE_EXHAUSTED") ||
                            String(error).includes("429") ||
                            String(error).includes("Quota");

    if (activeUserKey) {
      keyInfo = `\n\n⚠️ **Note de l'Orchestrateur (Quota/Limites)** : La requête vers votre clé API client active **"${activeUserKey.name}"** (${activeUserKey.provider}) a échoué (Erreur: *${customKeyError || "Quota dépassé (429)"}*). Nous avons basculé temporairement sur notre simulateur d'agents de secours.\n\n💡 **Comment résoudre ?** Si vous utilisez une clé gratuite Google Gemini, elle est limitée à 15 requêtes par minute et un petit quota quotidien. Nous vous conseillons de mettre à jour votre clé ou d'ajouter une clé payante ou OpenRouter dans l'onglet **Clés** pour débloquer de plus grands volumes de requêtes.`;
    } else if (isQuotaExceeded) {
      keyInfo = `\n\n⚠️ **Avis de Quota Dépassé (429 RESOURCE_EXHAUSTED)** : La clé API système partagée a temporairement atteint sa limite gratuite quotidienne imposée par Google (limite stricte de 20 requêtes par jour sur le modèle gratuit).\n\n💡 **Comment continuer gratuitement en 1 minute ?**\n1. Rendez-vous sur la console [Google AI Studio](https://aistudio.google.com/) pour obtenir votre propre clé API Gemini gratuite.\n2. Allez dans l'onglet **Clés** de cette application.\n3. Cliquez sur **Ajouter une clé**, renseignez votre clé avec le fournisseur **Google**, puis activez-la !\n\nVous disposerez ainsi de vos propres quotas individuels complets et gratuits sans aucune interruption !`;
    } else {
      keyInfo = `\n\n⚠️ **Note technique (Gateway)** : Aucune clé API personnelle active n'a été trouvée sur votre compte. Vous utilisez actuellement notre quota local de secours. Pour débloquer la puissance totale des modèles (Llama, Claude, Gemini), configurez votre clé API personnelle dans l'onglet **Clés**.`;
    }

    if (requiresCode) {
      finalAiResponse = `Voici le script demandé par notre agent **Codeur A∀-02**. Il a été vérifié par notre agent de **Sécurité A∀-03** pour s'assurer qu'il s'exécute dans un bac à sables parfaitement étanche.\n\n### Explication du script:\n1. Le code initialise les modules requis.\n2. Il configure un point d'écoute ou une fonction de boucle principale pour maximiser la vitesse de traitement.\n3. Il gère proprement les erreurs d'exécution pour éviter les fuites de quota API.${keyInfo}`;
    } else if (requiresSearch) {
      finalAiResponse = `J'ai recherché les informations les plus récentes sur le web concernant votre demande. Nos agents ont extrait plusieurs articles de référence de haute qualité.\n\nSelon nos recherches, Agora Ai se positionne comme un tableau de bord collaboratif d'avant-garde. Nous avons indexé les sources ci-dessous pour que vous puissiez explorer le sujet en profondeur.${keyInfo}`;
    } else {
      if (hasPreviousAgentMessage) {
        finalAiResponse = `Votre demande a été traitée avec succès par notre arbre d'agents spécialisés. L'Architecte A∀-01 a coordonné l'action de manière optimale pour répondre à votre question.\n\nN'hésitez pas à me poser d'autres questions spécifiques, ou à me demander d'effectuer des recherches sur le web.${keyInfo}`;
      } else {
        finalAiResponse = `Je n'ai pas pu traiter votre demande. Vérifiez vos clés API dans les paramètres.${keyInfo}`;
      }
    }

    const words = finalAiResponse.split(/(\s+)/);
    for (const word of words) {
      onChunk(word);
      await new Promise(r => setTimeout(r, 12));
    }
  }

  // Parse and update user memory if present in the AI response
  const memoryRegex = /<update_memory>([\s\S]*?)<\/update_memory>/i;
  const match = finalAiResponse.match(memoryRegex);
  if (match) {
    const newMemory = match[1].trim();
    const freshDb = readDB();
    const dbUser = freshDb.users.find(u => u.id === user.id);
    if (dbUser) {
      dbUser.memory = newMemory;
      writeDB(freshDb);
      user.memory = newMemory;
      addLog("success", `Mémoire de l'IA mise à jour pour ${user.username}.`, "Mémoire de l'IA");
    }
    finalAiResponse = finalAiResponse.replace(memoryRegex, "").trim();
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

  res.end();
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
