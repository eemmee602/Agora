import express from "express";
import path from "path";
import fs from "fs";
import cors from "cors";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase: SupabaseClient | null = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, { auth: { autoRefreshToken: true, persistSession: false } })
  : null;

if (!supabase) {
  console.warn("[Agora] SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY manquants — auth Supabase désactivée.");
}

const DB_PATH = process.env.VERCEL ? path.join("/tmp", "agora-db.json") : path.join(process.cwd(), "data", "db.json");

if (!fs.existsSync(path.dirname(DB_PATH))) {
  try { fs.mkdirSync(path.dirname(DB_PATH), { recursive: true }); } catch (e) { /* /tmp may exist */ }
}

const JWT_SECRET = process.env.JWT_SECRET;

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

async function authMiddleware(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "Token manquant." });
  }
  const token = authHeader.slice(7);

  // 1) Valider JWT local
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ success: false, error: "Token invalide." });
  }

  // 2) Valider session Supabase si disponible
  if (supabase) {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ success: false, error: "Session Supabase invalide." });
    }
    const metadata = user.user_metadata || {};
    req.user = {
      id: user.id,
      email: user.email || decoded.email,
      role: metadata.role || decoded.role || "user",
      username: metadata.username || decoded.username || user.email?.split("@")[0],
      supabaseId: user.id,
    };
  } else {
    req.user = { id: decoded.id, email: decoded.email, role: decoded.role, username: decoded.username };
  }
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

interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  content: string;
  steps?: MessageStep[];
  attachments?: MessageAttachment[];
  timestamp: string;
}

interface Chat {
  id: string;
  userId: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
  status: "active" | "archived";
}

interface DB {
  users: User[];
  agents: Agent[];
  chats: Chat[];
  logs: any[];
}

function readDB(): DB {
  if (!fs.existsSync(DB_PATH)) {
    const initial: DB = { users: [], agents: [], chats: [], logs: [] };
    writeDB(initial);
    return initial;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf-8")) as DB;
  } catch (e) {
    console.error("[Agora] DB parse error, resetting", e);
    const initial: DB = { users: [], agents: [], chats: [], logs: [] };
    writeDB(initial);
    return initial;
  }
}

function writeDB(db: DB): void {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

function addLog(level: string, message: string, category: string) {
  try {
    const db = readDB();
    db.logs.unshift({
      id: generateId("log"),
      level,
      message,
      category,
      timestamp: new Date().toISOString(),
    });
    if (db.logs.length > 500) db.logs = db.logs.slice(0, 500);
    writeDB(db);
  } catch (e) {
    console.error("[Agora] addLog failed", e);
  }
}

function sanitizeUser(u: User) {
  const { passwordHash, ...rest } = u;
  return rest;
}

// ---------------------------------------------
// AUTH ENDPOINTS (SECURE)
// ---------------------------------------------

app.post("/api/auth/register", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ success: false, error: "Champs requis manquants." });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, error: "Mot de passe trop court (6 caracteres min)." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, error: "Email invalide." });
  }

  const db = readDB();
  if (db.users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ success: false, error: "Cet email est deja utilise." });
  }
  if (db.users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(409).json({ success: false, error: "Ce nom d'utilisateur est deja pris." });
  }

  let supabaseUserId: string | undefined;
  if (supabase) {
    try {
      const result = await Promise.race([
        supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { username, role: "user" },
        }),
        new Promise(resolve => setTimeout(() => resolve("timeout"), 5000))
      ]);
      if (result === "timeout") {
        console.warn("[Agora] createUser Supabase timeout, continuing local-only");
      } else {
        const { data, error } = result as any;
        if (error) {
          console.error("[Agora] Supabase createUser error", error);
          // Continue locally if error is not a hard conflict
          if (error.message?.toLowerCase().includes("already")) {
            return res.status(409).json({ success: false, error: error.message });
          }
        } else {
          supabaseUserId = data?.user?.id;
        }
      }
    } catch (e: any) {
      console.error("[Agora] Supabase createUser exception", e?.message || e);
    }
  }

  const newUser: User = {
    id: supabaseUserId || generateId("user"),
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

app.post("/api/auth/login", async (req, res) => {
  const { email, password, username } = req.body;
  const identifier = email || username;
  if (!identifier || !password) {
    return res.status(400).json({ success: false, error: "Identifiants requis." });
  }

  const db = readDB();
  const user = db.users.find(
    u => u.username.toLowerCase() === identifier.toLowerCase() ||
         u.email.toLowerCase() === identifier.toLowerCase()
  );

  if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ success: false, error: "Identifiants invalides." });
  }

  if (supabase) {
    const { error } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: user.email,
      options: { redirectTo: `${req.headers.origin || ""}/auth/callback` },
    });
    if (error) console.warn("[Agora] generate magiclink on login failed", error.message);
  }

  addLog("success", `Connexion : ${user.username}`, "Authentification");
  const token = signToken(user);
  return res.json({ success: true, token, user: sanitizeUser(user) });
});


app.post("/api/auth/magic", async (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, error: "Email invalide." });
  }
  if (!supabase) {
    return res.status(503).json({ success: false, error: "Service Supabase non configure." });
  }
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: process.env.MAGIC_LINK_REDIRECT || "https://agora-ai-clean.vercel.app/auth/callback"
    }
  });
  if (error) {
    console.error("[Agora] Magic link error", error);
    return res.status(500).json({ success: false, error: error.message });
  }
  return res.json({ success: true, message: "Lien magique envoye. Verifie tes courriels." });
});

app.post("/api/auth/magic-callback", async (req, res) => {
  const { supabaseToken } = req.body;
  if (!supabaseToken) {
    return res.status(400).json({ success: false, error: "Token Supabase manquant." });
  }
  if (!supabase) {
    return res.status(503).json({ success: false, error: "Supabase non configure." });
  }

  const { data: { user: sbUser }, error } = await supabase.auth.getUser(supabaseToken);
  if (error || !sbUser || !sbUser.email) {
    console.error("[Agora] magic-callback invalid Supabase token", error?.message);
    return res.status(401).json({ success: false, error: "Token magique invalide ou expire." });
  }

  const email = sbUser.email.trim().toLowerCase();
  const db = readDB();
  let user = db.users.find(u => u.email.toLowerCase() === email);

  if (!user) {
    const metadata = sbUser.user_metadata || {};
    const username = (metadata.username || email.split("@")[0]).trim();
    const isAdmin = email === (process.env.ADMIN_EMAIL || "egirouxlafontaine@gmail.com").toLowerCase();
    user = {
      id: sbUser.id,
      username,
      email,
      role: isAdmin ? "admin" : "user",
      quotaLimit: 250,
      quotaUsed: 0,
      apiKeys: [],
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    writeDB(db);
    addLog("success", `Nouveau compte magic link : ${user.username}`, "Authentification");
  }

  const token = signToken(user);
  addLog("success", `Connexion magic link : ${user.username}`, "Authentification");
  return res.json({ success: true, token, user: sanitizeUser(user) });
});

app.post("/api/auth/logout", authMiddleware, async (req, res) => {
  if (supabase && req.user?.supabaseId) {
    await supabase.auth.admin.signOut(req.user.supabaseId);
  }
  return res.json({ success: true });
});

// Admin routes are protected
app.use("/api/admin", authMiddleware);

// Admin: Retrieve all users
app.get("/api/admin/users", (req, res) => {
  const db = readDB();
  res.json(db.users);
});

// Admin: Update user role
app.patch("/api/admin/users/:id/role", (req, res) => {
  const { role } = req.body;
  if (role !== "admin" && role !== "user") {
    return res.status(400).json({ success: false, error: "Role invalide." });
  }
  const db = readDB();
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, error: "Utilisateur introuvable." });
  }
  user.role = role;
  writeDB(db);
  addLog("info", `Role mis a jour : ${user.username} -> ${role}`, "Admin");
  res.json({ success: true, user: sanitizeUser(user) });
});

// Admin: Quota update
app.patch("/api/admin/users/:id/quota", (req, res) => {
  const { limit } = req.body;
  if (typeof limit !== "number" || limit < 0) {
    return res.status(400).json({ success: false, error: "Quota invalide." });
  }
  const db = readDB();
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, error: "Utilisateur introuvable." });
  }
  user.quotaLimit = limit;
  writeDB(db);
  addLog("info", `Quota mis a jour : ${user.username} -> ${limit}`, "Admin");
  res.json({ success: true, user: sanitizeUser(user) });
});

// Admin: Get logs
app.get("/api/logs", (req, res) => {
  const db = readDB();
  res.json(db.logs.slice(0, 200));
});

// Chats routes are protected
app.use("/api/chats", authMiddleware);

// Chats: List for user
app.get("/api/chats", (req, res) => {
  const db = readDB();
  const userChats = db.chats
    .filter((c) => c.userId === req.user.id || req.user.role === "admin")
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  res.json(userChats);
});

// Chats: Create
app.post("/api/chats", (req, res) => {
  const { title = "Nouvelle conversation" } = req.body;
  const db = readDB();
  const chat: Chat = {
    id: generateId("chat"),
    userId: req.user.id,
    title,
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "active",
  };
  db.chats.push(chat);
  writeDB(db);
  addLog("info", `Nouvelle conversation : ${chat.id}`, "Chat");
  res.json({ success: true, chat });
});

// Chats: Update title
app.patch("/api/chats/:id", (req, res) => {
  const { title } = req.body;
  const db = readDB();
  const chat = db.chats.find((c) => c.id === req.params.id && (c.userId === req.user.id || req.user.role === "admin"));
  if (!chat) {
    return res.status(404).json({ success: false, error: "Conversation introuvable." });
  }
  if (title) chat.title = title;
  chat.updatedAt = new Date().toISOString();
  writeDB(db);
  res.json({ success: true, chat });
});

// Chats: Archive
app.delete("/api/chats/:id", (req, res) => {
  const db = readDB();
  const chat = db.chats.find((c) => c.id === req.params.id && c.userId === req.user.id);
  if (!chat) {
    return res.status(404).json({ success: false, error: "Conversation introuvable." });
  }
  chat.status = "archived";
  chat.updatedAt = new Date().toISOString();
  writeDB(db);
  res.json({ success: true });
});

// User routes are protected
app.use("/api/users", authMiddleware);

// Keys: Add/Update API keys for a user
app.post("/api/users/:userId/keys", (req, res) => {
  const { name, provider, key, model } = req.body;
  if (!name || !provider || !key || !model) {
    return res.status(400).json({ success: false, error: "Champs requis manquants." });
  }
  const db = readDB();
  const user = db.users.find((u) => u.id === req.params.userId);
  if (!user) {
    return res.status(404).json({ success: false, error: "Utilisateur introuvable." });
  }
  const existing = user.apiKeys.find((k) => k.provider === provider && k.model === model);
  if (existing) {
    existing.key = key;
    existing.name = name;
    existing.active = true;
  } else {
    user.apiKeys.push({ id: generateId("key"), name, provider, key, model, active: true });
  }
  writeDB(db);
  addLog("info", `Cle API ajoutee : ${provider}/${model} pour ${user.username}`, "API Keys");
  res.json({ success: true, user: sanitizeUser(user) });
});

// Keys: Delete API key
app.delete("/api/users/:userId/keys/:keyId", (req, res) => {
  const db = readDB();
  const user = db.users.find((u) => u.id === req.params.userId);
  if (!user) {
    return res.status(404).json({ success: false, error: "Utilisateur introuvable." });
  }
  user.apiKeys = user.apiKeys.filter((k) => k.id !== req.params.keyId);
  writeDB(db);
  res.json({ success: true, user: sanitizeUser(user) });
});

// -----------------------------------------------------------------
// AGENTS MANAGEMENT
// -----------------------------------------------------------------

app.get("/api/agents", (req, res) => {
  const db = readDB();
  res.json(db.agents);
});

// Reset agents
app.post("/api/admin/agents/reset", (req, res) => {
  const db = readDB();
  db.agents = [
    {
      id: "agent-orchestrator",
      name: "Orchestrateur",
      role: "orchestrator",
      avatar: "🧠",
      description: "Coordonne les agents et decompose les taches complexes.",
      skills: ["planning", "routing", "summarization"],
      status: "idle",
      taskProgress: 0,
      lastActive: new Date().toISOString(),
    },
    {
      id: "agent-search",
      name: "Chercheur Web",
      role: "researcher",
      avatar: "🔍",
      description: "Recherche d'informations en temps reel.",
      skills: ["web_search", "fact_check"],
      status: "idle",
      taskProgress: 0,
      lastActive: new Date().toISOString(),
    },
    {
      id: "agent-coder",
      name: "Codeur",
      role: "developer",
      avatar: "💻",
      description: "Ecrit et corrige du code dans plusieurs langages.",
      skills: ["coding", "debugging", "architecture"],
      status: "idle",
      taskProgress: 0,
      lastActive: new Date().toISOString(),
    },
    {
      id: "agent-creative",
      name: "Createur",
      role: "creative",
      avatar: "✨",
      description: "Produit du contenu creatif et des idees.",
      skills: ["writing", "design", "brainstorming"],
      status: "idle",
      taskProgress: 0,
      lastActive: new Date().toISOString(),
    },
    {
      id: "agent-data",
      name: "Data Analyst",
      role: "analyst",
      avatar: "📊",
      description: "Analyse les donnees et produit des rapports.",
      skills: ["data_analysis", "visualization", "sql"],
      status: "idle",
      taskProgress: 0,
      lastActive: new Date().toISOString(),
    },
  ];
  writeDB(db);
  addLog("info", "Agents reinitialises", "Admin");
  res.json({ success: true });
});

// -----------------------------------------------------------------
// COOPERATIVE AGENTS EXECUTION PIPELINE (WITHOUT WASTING EXCESSIVE APIS QUOTA)
// -----------------------------------------------------------------

const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY || "" });

async function callGoogleLLM(prompt: string, model: string = "gemini-1.5-flash"): Promise<string> {
  try {
    const result = await genAI.models.generateContent({ model, contents: prompt });
    const text = result.text;
    if (!text) throw new Error("Reponse vide de Gemini");
    return text;
  } catch (err: any) {
    console.error("[Agora] Gemini error", err);
    throw new Error("Erreur API Google: " + (err.message || "inconnue"));
  }
}

function routeModel(modelName: string): { provider: string; model: string } {
  if (modelName.startsWith("gemini")) return { provider: "google", model: modelName };
  if (modelName.startsWith("claude")) return { provider: "anthropic", model: modelName };
  if (modelName.startsWith("gpt")) return { provider: "openai", model: modelName };
  if (modelName.startsWith("deepseek")) return { provider: "deepseek", model: modelName };
  return { provider: "google", model: "gemini-1.5-flash" };
}

function parseTags(content: string): string[] {
  const tags: string[] = [];
  const regex = /#\w+/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    tags.push(match[0].toLowerCase());
  }
  return tags;
}

app.post("/api/chats/:id/messages", authMiddleware, async (req: any, res) => {
  const startTime = Date.now();
  const chatId = req.params.id;
  const { content, attachments } = req.body;
  const user = req.user;

  if (!content || typeof content !== "string") {
    return res.status(400).json({ success: false, error: "Message vide." });
  }

  const db = readDB();
  const chat = db.chats.find((c) => c.id === chatId && (c.userId === user.id || user.role === "admin"));
  if (!chat) {
    return res.status(404).json({ success: false, error: "Conversation introuvable." });
  }

  const dbUser = db.users.find((u) => u.id === user.id);
  if (!dbUser) {
    return res.status(404).json({ success: false, error: "Utilisateur introuvable." });
  }

  if (dbUser.quotaUsed >= dbUser.quotaLimit) {
    return res.status(429).json({ success: false, error: "Quota API depasse." });
  }

  // Add user message
  const userMessage: ChatMessage = {
    id: generateId("msg"),
    sender: "user",
    content,
    attachments,
    timestamp: new Date().toISOString(),
  };
  chat.messages.push(userMessage);

  // Orchestration: classify intent & select agents
  const tags = parseTags(content);
  let selectedAgents: string[] = [];
  const lower = content.toLowerCase();
  if (tags.includes("#code") || lower.includes("code") || lower.includes("bug")) {
    selectedAgents.push("agent-coder");
  }
  if (tags.includes("#search") || lower.includes("recherche") || lower.includes("actualite")) {
    selectedAgents.push("agent-search");
  }
  if (tags.includes("#data") || lower.includes("donnee") || lower.includes("analyse")) {
    selectedAgents.push("agent-data");
  }
  if (tags.includes("#idee") || lower.includes("idee") || lower.includes("creatif")) {
    selectedAgents.push("agent-creative");
  }
  if (selectedAgents.length === 0) {
    selectedAgents = ["agent-orchestrator"];
  }

  const selected = db.agents.filter((a) => selectedAgents.includes(a.id));

  const steps: MessageStep[] = selected.map((agent) => ({
    id: generateId("step"),
    agentId: agent.id,
    agentName: agent.name,
    action: "Analyse de la demande",
    status: "running" as const,
  }));

  const aiMessage: ChatMessage = {
    id: generateId("msg"),
    sender: "ai",
    content: "",
    steps,
    timestamp: new Date().toISOString(),
  };
  chat.messages.push(aiMessage);
  chat.updatedAt = new Date().toISOString();
  writeDB(db);

  // Update agent status
  selected.forEach((agent) => {
    agent.status = "working";
    agent.lastActive = new Date().toISOString();
  });
  writeDB(db);

  try {
    const prompt = `Tu es un assistant multi-agents nomme Agora. L'utilisateur demande : "${content}". Les agents impliques sont : ${selected.map((a) => `${a.name} (${a.role})`).join(", ")}. Donne une reponse utile, concise, en francais, maximum 400 mots.`;

    const responseText = await callGoogleLLM(prompt, "gemini-1.5-flash");

    aiMessage.content = responseText;
    steps.forEach((step) => {
      step.status = "completed";
      step.details = "Reponse generee";
    });

    selected.forEach((agent) => {
      agent.status = "idle";
      agent.taskProgress = 0;
    });

    dbUser.quotaUsed += 1;
    chat.updatedAt = new Date().toISOString();
    writeDB(db);

    addLog("info", `Message traite par ${selected.map((a) => a.name).join(", ")}`, "Chat");

    return res.json({
      success: true,
      chat,
      quotaUsed: dbUser.quotaUsed,
    });
  } catch (err: any) {
    console.error("[Agora] Pipeline error", err);
    aiMessage.content = "Desole, une erreur est survenue lors du traitement de votre demande.";
    steps.forEach((step) => {
      step.status = "failed";
      step.details = err.message || "Erreur inconnue";
    });
    selected.forEach((agent) => {
      agent.status = "idle";
    });
    writeDB(db);
    return res.status(500).json({ success: false, error: err.message || "Erreur serveur" });
  }
});

// -----------------------------------------------------------------
// VITE DEV MODE / PRODUCTION STATIC
// -----------------------------------------------------------------

(async () => {
  if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === undefined) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "custom",
    });
    app.use(vite.middlewares);
    app.listen(PORT, () => {
      console.log(`[Agora] Dev server running on http://localhost:${PORT}`);
    });
  } else if (!process.env.VERCEL) {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      if (req.path.startsWith("/api/")) return;
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
    app.listen(PORT, () => {
      console.log(`[Agora] Server running on http://localhost:${PORT}`);
    });
  }
})();

export default app;
