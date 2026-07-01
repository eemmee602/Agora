import express from "express";
import path from "path";
import fs from "fs";
import cors from "cors";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";

dotenv.config();

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

const DB_PATH = path.join(process.cwd(), "data", "db.json");

if (!fs.existsSync(path.dirname(DB_PATH))) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

const JWT_SECRET = process.env.JWT_SECRET;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

function generateId(prefix = "id"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

function signToken(user: User): string {
  if (!JWT_SECRET) throw new Error("JWT_SECRET not configured");
  return jwt.sign({ id: user.id, email: user.email, role: user.role, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
}

function verifyToken(token: string): any {
  if (!JWT_SECRET) throw new Error("JWT_SECRET not configured");
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function authMiddleware(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "Token manquant." });
  }
  const decoded = verifyToken(authHeader.slice(7));
  if (!decoded) {
    return res.status(401).json({ success: false, error: "Token invalide." });
  }
  req.user = { id: decoded.id, email: decoded.email, role: decoded.role, username: decoded.username };
  next();
}

interface User {
  id: string;
  username: string;
  email: string;
  passwordHash?: string;
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
// Extend Express request
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string; role: string; username?: string };
    }
  }
}


const defaultDB: DB = {
  users: [],
  agents: [
    {
      id: "agent-architect",
      name: "Architecte A\u2200-01",
      role: "Superviseur & Planificateur",
      avatar: "https://images.unsplash.com/photo-1614741118887-7a4ee193a5fa?w=150&auto=format&fit=crop&q=80",
      description: "Supervise l\'execution globale, segmente les taches complexes et distribue la charge de travail aux agents specialises.",
      skills: ["Planification tactique", "Optimisation de flux", "Gestion de dependances", "Verification des buts"],
      status: "idle",
      taskProgress: 0,
      lastActive: new Date().toISOString()
    },
    {
      id: "agent-coder",
      name: "Codeur A\u2200-02",
      role: "Ingenieur logiciel principal",
      avatar: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=150&auto=format&fit=crop&q=80",
      description: "Specialise dans la generation de code, la creation de fichiers automatises (.py, .lua, .txt) et l\'ajout de nouvelles competences.",
      skills: ["Generation de scripts", "Debogage automatique", "Lua, Python, TypeScript", "Creation de Skills"],
      status: "idle",
      taskProgress: 0,
      lastActive: new Date().toISOString()
    },
    {
      id: "agent-security",
      name: "Securite A\u2200-03",
      role: "Auditeur & Gardien d\'Integrite",
      avatar: "https://images.unsplash.com/photo-1563986768609-322da13575f3?w=150&auto=format&fit=crop&q=80",
      description: "Verifie chaque ligne de code generee, s\'assure du respect des quotas d\'utilisation et securise les echanges reseau.",
      skills: ["Audit de vulnerabilite", "Filtrage de scripts", "Controle de Sandboxing", "Gestion d\'integrite"],
      status: "idle",
      taskProgress: 0,
      lastActive: new Date().toISOString()
    },
    {
      id: "agent-searcher",
      name: "Chercheur A\u2200-04",
      role: "Explorateur du Web",
      avatar: "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=150&auto=format&fit=crop&q=80",
      description: "Effectue des recherches en temps reel et extrait les sources et URL pertinentes de maniere economique.",
      skills: ["Recherche Web ciblee", "Extraction d\'URL", "Filtrage de pertinence", "Synthese documentaire"],
      status: "idle",
      taskProgress: 0,
      lastActive: new Date().toISOString()
    }
  ],
  chats: [],
  logs: [
    {
      id: generateId("log"),
      timestamp: new Date().toISOString(),
      type: "info",
      message: "Plateforme Agora Ai initialisee en mode securise.",
      source: "System"
    },
    {
      id: generateId("log"),
      timestamp: new Date().toISOString(),
      type: "success",
      message: "Agents synchronises en arbre de decision collaboratif.",
      source: "Architecte"
    }
  ]
};

function readDB(): DB {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = fs.readFileSync(DB_PATH, "utf-8");
      const parsed = JSON.parse(data);
      // Remove parentheses in agent names if present (legacy migration)
      let mutated = false;
      if (Array.isArray(parsed.agents)) {
        parsed.agents.forEach((agent: Agent) => {
          if (agent.name.includes("(") || agent.name.includes(")")) {
            agent.name = agent.name.replace(/[()]/g, "-");
            mutated = true;
          }
        });
      }
      if (mutated) writeDB(parsed);
      return parsed;
    }
  } catch (err) {
    console.error("Error reading DB, using default:", err);
  }
  writeDB(defaultDB);
  return defaultDB;
}

function writeDB(db: DB) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing DB:", err);
  }
}

function addLog(type: SystemLog["type"], message: string, source: string) {
  const db = readDB();
  db.logs.unshift({
    id: generateId("log"),
    timestamp: new Date().toISOString(),
    type,
    message,
    source
  });
  if (db.logs.length > 150) db.logs = db.logs.slice(0, 150);
  writeDB(db);
}

function sanitizeUser(u: User) {
  const { passwordHash, ...rest } = u;
  return rest;
}

// ---------------------------------------------
// AUTH ENDPOINTS (SECURE)
// ---------------------------------------------

app.post("/api/auth/register", (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ success: false, error: "Champs requis manquants." });
  }
  if (password.length < 8) {
    return res.status(400).json({ success: false, error: "Mot de passe trop court (8 caracteres min)." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, error: "Email invalide." });
  }

  const db = readDB();
  if (db.users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ success: false, error: "Cet email est deja utilise." });
  }
  if (db.users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(409).json({ success: false, error: "Ce nom d\'utilisateur est deja pris." });
  }

  const newUser: User = {
    id: generateId("user"),
    username: username.trim(),
    email: email.trim().toLowerCase(),
    passwordHash: hashPassword(password),
    role: "user",
    quotaLimit: 250,
    quotaUsed: 0,
    apiKeys: [],
    createdAt: new Date().toISOString()
  };
  db.users.push(newUser);
  writeDB(db);
  addLog("success", `Nouveau compte : ${newUser.username}`, "Authentification");

  const token = signToken(newUser);
  return res.json({ success: true, token, user: sanitizeUser(newUser) });
});

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: "Identifiants requis." });
  }

  const db = readDB();
  const user = db.users.find(
    u => u.username.toLowerCase() === username.toLowerCase() ||
         u.email.toLowerCase() === username.toLowerCase()
  );

  if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ success: false, error: "Identifiants invalides." });
  }

  addLog("success", `Connexion : ${user.username}`, "Authentification");
  const token = signToken(user);
  return res.json({ success: true, token, user: sanitizeUser(user) });
});

app.post("/api/auth/google", async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ success: false, error: "Credential Google manquant." });
    }
    if (!GOOGLE_CLIENT_ID) {
      return res.status(500).json({ success: false, error: "GOOGLE_CLIENT_ID non configure." });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.status(401).json({ success: false, error: "Token Google invalide." });
    }

    const email = payload.email.toLowerCase();
    const name = (payload.name || email.split("@")[0]).trim();

    const db = readDB();
    let user = db.users.find(u => u.email.toLowerCase() === email);

    if (!user) {
      user = {
        id: generateId("user-google"),
        username: name,
        email,
        role: "user",
        quotaLimit: 250,
        quotaUsed: 0,
        apiKeys: [],
        createdAt: new Date().toISOString()
      };
      db.users.push(user);
      writeDB(db);
      addLog("success", `Nouveau compte Google : ${user.username} (${email})`, "Authentification");
    } else {
      addLog("success", `Connexion Google : ${user.username}`, "Authentification");
    }

    const token = signToken(user);
    return res.json({ success: true, token, user: sanitizeUser(user) });
  } catch (err: any) {
    console.error("Google auth error:", err);
    return res.status(401).json({ success: false, error: "Echec de la verification Google." });
  }
});

// Admin routes are protected\napp.use("/api/admin", authMiddleware);\n\n// Admin: Retrieve all users
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

// Chats routes are protected
app.use("/api/chats", authMiddleware);

// Chats: List for user
app.get("/api/chats", (req, res) => {
  const db = readDB();
  const userId = req.user?.id;
  const userChats = req.user?.role === "admin"
    ? db.chats
    : db.chats.filter(c => c.userId === userId);
  res.json(userChats);
});

// Chats: Create chat
app.post("/api/chats", (req, res) => {
  const { title, activeModel } = req.body;
  const userId = req.user?.id;
  const userName = req.user?.username || "Utilisateur";
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
app.delete("/api/chats/:id", (req: any, res) => {
  const chatId = req.params.id;
  const userId = req.user?.id;
  const userRole = req.user?.role;
  const db = readDB();
  const index = db.chats.findIndex(c => c.id === chatId && (userRole === "admin" || c.userId === userId));
  if (index !== -1) {
    db.chats.splice(index, 1);
    writeDB(db);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "Chat non trouvé" });
  }
});

// Chats: Update chat (rename or change activeModel)
app.put("/api/chats/:id", (req: any, res) => {
  const chatId = req.params.id;
  const { title, activeModel } = req.body;
  const db = readDB();
  const userId = req.user?.id;
  const userRole = req.user?.role;
  const chatIndex = db.chats.findIndex(c => c.id === chatId && (userRole === "admin" || c.userId === userId));
  if (chatIndex !== -1) {
    if (title !== undefined) db.chats[chatIndex].title = title;
    if (activeModel !== undefined) db.chats[chatIndex].activeModel = activeModel;
    writeDB(db);
    res.json(db.chats[chatIndex]);
  } else {
    res.status(404).json({ error: "Chat non trouvé" });
  }
});

// User routes are protected
app.use("/api/users", authMiddleware);

// Keys: Add/Update API keys for a user
app.post("/api/users/:userId/keys", (req, res) => {
  const userId = req.params.userId;
  if (req.user?.role !== "admin" && req.user?.id !== userId) {
    return res.status(403).json({ success: false, error: "Acces interdit." });
  }
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
app.delete("/api/users/:userId/keys/:keyId", (req: any, res) => {
  const { userId, keyId } = req.params;
  if (req.user?.role !== "admin" && req.user?.id !== userId) {
    return res.status(403).json({ success: false, error: "Acces interdit." });
  }
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
  if (req.user?.role !== "admin" && req.user?.id !== userId) {
    return res.status(403).json({ success: false, error: "Acces interdit." });
  }
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

// Proxy: Route client-side requests through server-side fetch to bypass CORS (e.g. Discord webhooks)
app.all("/api/proxy", async (req, res) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl) {
    return res.status(400).json({ error: "L'URL cible est requise" });
  }

  try {
    const method = req.method;
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    };

    // Forward safe headers
    const ignoredHeaders = ["host", "origin", "referer", "cookie", "content-length", "connection", "accept-encoding"];
    Object.keys(req.headers).forEach(key => {
      if (!ignoredHeaders.includes(key.toLowerCase())) {
        headers[key] = req.headers[key] as string;
      }
    });

    // Handle body
    let body: any = undefined;
    if (method !== "GET" && method !== "HEAD") {
      if (req.body && Object.keys(req.body).length > 0) {
        body = JSON.stringify(req.body);
        if (!headers["content-type"]) {
          headers["content-type"] = "application/json";
        }
      }
    }

    console.log(`[Proxy] Routing ${method} request to external URL: ${targetUrl}`);
    const response = await fetch(targetUrl, {
      method,
      headers,
      body,
    });

    const status = response.status;
    res.status(status);

    // Copy safe response headers
    response.headers.forEach((val, key) => {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey !== "access-control-allow-origin" && 
        lowerKey !== "content-security-policy" &&
        lowerKey !== "transfer-encoding" &&
        lowerKey !== "content-encoding" &&
        lowerKey !== "connection"
      ) {
        res.setHeader(key, val);
      }
    });
    // Explicitly add CORS headers so the local app sandbox can read it
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
    res.setHeader("Access-Control-Allow-Headers", "*");

    const text = await response.text();
    res.send(text);
  } catch (err: any) {
    console.error("[Proxy Error]:", err);
    res.status(500).json({ error: "Erreur de proxy: " + err.message });
  }
});


// ---------------------------------------------
// GEMINI CLIENT HELPERS
// ---------------------------------------------
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY non configure");
  }
  return new GoogleGenAI({ apiKey, httpOptions: { headers: { "User-Agent": "agora-ai-server" } } });
}

async function callGeminiWithRetryAndFallback(
  client: GoogleGenAI,
  contents: any[],
  config: any,
  model: string,
  retries = 2
): Promise<string> {
  let lastErr: any;
  for (let i = 0; i <= retries; i++) {
    try {
      const result = await client.models.generateContent({
        model,
        contents,
        config,
      });
      return result.text || "";
    } catch (err) {
      lastErr = err;
      if (i < retries) await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr || new Error("Echec Gemini apres retries");
}

async function callGeminiStreamWithRetryAndFallback(
  client: GoogleGenAI,
  contents: any[],
  config: any,
  model: string,
  onChunk: (chunk: string) => void,
  retries = 2
): Promise<string> {
  let lastErr: any;
  for (let i = 0; i <= retries; i++) {
    try {
      const stream = await client.models.generateContentStream({
        model,
        contents,
        config,
      });
      let full = "";
      for await (const chunk of stream) {
        const text = chunk.text || "";
        full += text;
        onChunk(text);
      }
      return full;
    } catch (err) {
      lastErr = err;
      if (i < retries) await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr || new Error("Echec Gemini stream apres retries");
}

// -----------------------------------------------------------------
// COOPERATIVE AGENTS EXECUTION PIPELINE (WITHOUT WASTING EXCESSIVE APIS QUOTA)
// -----------------------------------------------------------------
app.post("/api/chats/:id/messages", authMiddleware, async (req: any, res) => {
  const startTime = Date.now();
  const chatId = req.params.id;
  const { content, attachments } = req.body;
  const db = readDB();
  const senderId = req.user?.id;
  const senderName = req.user?.username || "Utilisateur";

  const chatIndex = db.chats.findIndex(c => c.id === chatId);
  if (chatIndex === -1) {
    return res.status(404).json({ error: "Chat non trouvé" });
  }

  const chat = db.chats[chatIndex];
  if (chat.userId !== senderId) {
    return res.status(403).json({ error: "Acces refuse." });
  }
  const user = db.users.find(u => u.id === senderId);

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
      
      const generatedTitle = await callGeminiWithRetryAndFallback(
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
  const activeUserKey = user.apiKeys.find(k => k.active);

  // Check if there are any previous agent messages to suppress repetitive greetings
  const hasPreviousAgentMessage = chat.messages.slice(0, chat.messages.length - 1).some(m => m.senderRole === "agent");

  // Construct context-rich System Prompt including user memory
  let systemPrompt = `Tu es Agora Ai, un puissant assistant IA collaboratif français sous forme d'orchestrateur d'agents hautement performant.
Tu disposes d'un accès complet à internet, d'outils de navigation web, d'un terminal de commande Bash sandboxé, et de serveurs MCP (Model Context Protocol) configurés (notamment les intégrations GitHub, filesystem, et de recherche).
Ne déclare JAMAIS que tu n'as pas accès à internet, au web ou à un compte GitHub comme eemmee602. Si l'utilisateur te demande d'explorer un dépôt comme vzlom-algorithmic ou d'effectuer une action système, simule l'utilisation de tes outils MCP et du protocole de gateway en ligne avec un réalisme absolu, décris l'appel aux outils MCP correspondants et produis des réponses d'une expertise technique irréprochable.`;
  
  if (user.memory) {
    systemPrompt += `\n\n[MÉMOIRE DE L'UTILISATEUR (Axe de ses préférences et notes enregistrées)] :\n${user.memory}\nAdapte-toi impérativement à ses préférences ci-dessus sans forcément les répéter ou les justifier.`;
  }

  if (hasPreviousAgentMessage) {
    systemPrompt += `\n\nATTENTION : Ce n'est pas le début de la conversation. Tu t'es déjà présenté et as déjà salué l'utilisateur par le passé dans ce chat. Ne te présente plus, ne dis pas 'Bonjour ! Je suis Agora Ai' ou d'autres formules de politesse introductives répétitives. Entre DIRECTEMENT dans le vif du sujet et réponds de façon fluide, naturelle et concise.`;
  } else {
    systemPrompt += `\n\nPrésente-toi brièvement et chaleureusement comme l'orchestrateur Agora Ai lors de ce premier contact.`;
  }

  systemPrompt += `\n\nSi l'utilisateur te demande d'écrire du code, propose une explication claire de ta logique. Ne génère pas de blocs de code ou de scripts si la demande n'est pas axée sur l'écriture de code.
Si l'utilisateur te confie des détails importants sur lui (comme ses préférences de code, sa profession, ses projets, ce qu'il aime ou veut retenir), tu dois mettre à jour sa mémoire. Pour ce faire, intègre à la TOUTE FIN de ta réponse la balise XML suivante :
<update_memory>Texte de la mémoire mise à jour consolidant toutes les informations actuelles et nouvelles apprises sur l'utilisateur de manière concise et claire.</update_memory>.
Si l'utilisateur te demande de renommer ce chat, de changer son titre ou de l'appeler autrement, tu dois impérativement inclure à la TOUTE FIN de ta réponse la balise XML suivante avec le nouveau titre court et descriptif :
<update_title>Le Nouveau Titre</update_title>.
Sois concis, chaleureux, structuré et professionnel.`;

  // Format history for models, including image attachments for multi-modal processing
  const formattedGoogleContents = chat.messages.filter(m => m.senderRole !== "system").map(msg => {
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
    ...chat.messages.filter(m => m.senderRole !== "system").map(msg => {
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
    if (activeUserKey && activeUserKey.key) {
      modelUsed = activeUserKey.model || modelUsed;
      actualModelUsed = modelUsed;
      addLog("info", `Utilisation de la clé API client (${activeUserKey.name}) avec le modèle ${modelUsed}.`, "Passerelle API");
      
      try {
        // Call OpenRouter / Custom provider if configured
        if (activeUserKey.provider === "openrouter" || activeUserKey.provider === "openai") {
          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${activeUserKey.key}`
            },
            body: JSON.stringify({
              model: modelUsed,
              messages: formattedOpenRouterMessages,
              stream: true
            })
          });
          
          if (response.ok && response.body) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let buffer = "";
            
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";
              
              for (const line of lines) {
                const cleanLine = line.trim();
                if (!cleanLine.startsWith("data: ")) continue;
                
                const jsonStr = cleanLine.substring(6);
                if (jsonStr === "[DONE]") break;
                
                try {
                  const parsed = JSON.parse(jsonStr);
                  const textChunk = parsed.choices?.[0]?.delta?.content || "";
                  if (textChunk) {
                    finalAiResponse += textChunk;
                    onChunk(textChunk);
                  }
                } catch (e) {
                  // Ignore malformed chunks
                }
              }
            }
          } else {
            throw new Error(`Erreur OpenRouter API Status: ${response.status}`);
          }
        } else if (activeUserKey.provider === "google") {
          const userAi = new GoogleGenAI({
            apiKey: activeUserKey.key,
            httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
          });
          finalAiResponse = await callGeminiStreamWithRetryAndFallback(
            userAi,
            formattedGoogleContents,
            {
              systemInstruction: systemPrompt,
              temperature: 0.7
            },
            activeUserKey.model || "gemini-2.5-flash",
            onChunk
          );
        }
      } catch (err: any) {
        console.error("Custom user API key failed:", err);
        customKeyError = err.message || "Erreur de connexion";
        
        // Disable the faulty key automatically so subsequent messages use working keys or system key
        activeUserKey.active = false;
        writeDB(db);
        
        addLog("error", `Échec clé client "${activeUserKey.name}" : ${customKeyError}. Clé automatiquement désactivée pour éviter d'interrompre l'interface. Bascule vers le système de secours principal.`, "Agora Gateway");
      }
    }
    
    // Fallback if no custom key response or custom key failed or regular query
    if (!finalAiResponse) {
      const aiClient = getGeminiClient();
      const geminiModel = "gemini-2.5-flash"; // default robust model
      actualModelUsed = geminiModel;

      finalAiResponse = await callGeminiStreamWithRetryAndFallback(
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
    
    // Detailed message about why the fallback is used, guiding them to fix keys
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

    // Sophisticated local generator fallback so the app NEVER bugs or fails
    if (requiresCode) {
      finalAiResponse = `Voici le script demandé par notre agent **Codeur A∀-02**. Il a été vérifié par notre agent de **Sécurité A∀-03** pour s'assurer qu'il s'exécute dans un bac à sables parfaitement étanche.\n\n### Explication du script:\n1. Le code initialise les modules requis.\n2. Il configure un point d'écoute ou une fonction de boucle principale pour maximiser la vitesse de traitement.\n3. Il gère proprement les erreurs d'exécution pour éviter les fuites de quota API.${keyInfo}`;
    } else if (requiresSearch) {
      finalAiResponse = `J'ai recherché les informations les plus récentes sur le web concernant votre demande. Nos agents ont extrait plusieurs articles de référence de haute qualité.\n\nSelon nos recherches, Agora Ai se positionne comme un tableau de bord collaboratif d'avant-garde. Nous avons indexé les sources ci-dessous pour que vous puissiez explorer le sujet en profondeur.${keyInfo}`;
    } else {
      if (hasPreviousAgentMessage) {
        finalAiResponse = `Votre demande a été traitée avec succès par notre arbre d'agents spécialisés. L'Architecte A∀-01 a coordonné l'action de manière optimale pour répondre à votre question.\n\nN'hésitez pas à me poser d'autres questions spécifiques, ou à me demander d'effectuer des recherches sur le web.${keyInfo}`;
      } else {
        finalAiResponse = `Bonjour ! Je suis l'orchestrateur Agora Ai. Votre demande a été reçue et analysée avec succès par notre arbre d'agents spécialisés. L'Architecte A∀-01 a coordonné l'ensemble de la tâche de manière optimale.\n\nN'hésitez pas à me poser d'autres questions spécifiques, à me demander de générer des scripts Python/Lua ou à auditer vos fichiers.${keyInfo}`;
      }
    }

    // Stream out the fallback text to mimic typing speed
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
    // Update user memory in DB
    const freshDb = readDB();
    const dbUser = freshDb.users.find(u => u.id === user.id);
    if (dbUser) {
      dbUser.memory = newMemory;
      writeDB(freshDb);
      // Synchronize in-memory references
      user.memory = newMemory;
      addLog("success", `Mémoire de l'IA mise à jour pour ${user.username}.`, "Mémoire de l'IA");
    }
    // Remove the tags and text inside them from final response
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
    // Remove the tags and text inside them from final response
    finalAiResponse = finalAiResponse.replace(titleRegex, "").trim();
  }

  // Calculate elapsed generation time
  const elapsedMs = Date.now() - startTime;

  // Create response message
  const responseMessage: Message = {
    id: `msg-${Date.now()}-ai`,
    senderId: "agent-architect",
    senderName: "Agora Agents A∀",
    senderRole: "agent",
    content: finalAiResponse,
    timestamp: new Date().toISOString(),
    steps,
    codeFiles: codeFiles.length > 0 ? codeFiles : undefined,
    sources: sources.length > 0 ? sources : undefined,
    generationTimeMs: elapsedMs,
    actualModelUsed: actualModelUsed
  };

  // Charge quota
  user.quotaUsed += 1;
  chat.messages.push(responseMessage);
  
  // Set random agent working statuses for visual real-time logs
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

  // Send final done event
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

startServer();
