import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Server, Cpu, Database, ShieldAlert, ListChecks, RefreshCw, Play, Square, 
  Package, Search, ArrowUpRight, Activity, Terminal, AlertTriangle, CheckCircle2, 
  Info, Sparkles, Code2, Trash2, Send, HardDrive, FileCode
} from "lucide-react";
import { User, Chat, SystemLog, safeFormatDate, safeFormatTime } from "../types";

interface DevOpsConsoleProps {
  users: User[];
  logs: SystemLog[];
  chats: Chat[];
}

type DevOpsTab = "containers" | "analysis" | "database" | "dependencies";

export default function DevOpsConsole({ users, logs, chats }: DevOpsConsoleProps) {
  const [activeTab, setActiveTab] = useState<DevOpsTab>("containers");
  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    "[System] Console DevOps Agora AI initialisée.",
    "[System] Connexion au runtime établie avec succès."
  ]);
  const terminalBottomRef = useRef<HTMLDivElement>(null);

  const addTerminalLog = (message: string) => {
    const timestamp = safeFormatTime(new Date(), { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setTerminalLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  useEffect(() => {
    terminalBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalLogs]);

  // ==========================================
  // TAB 1: CONTAINER ORCHESTRATION STATE
  // ==========================================
  const [containers, setContainers] = useState([
    { id: "agora-core", name: "agora-core-service", status: "running", cpu: 4.5, mem: "142MB", port: "3000", uptime: "1d 4h", logs: ["Starting server...", "Listening on port 3000"] },
    { id: "agora-sandbox", name: "agora-sandbox-vm", status: "running", cpu: 0.1, mem: "64MB", port: "3001", uptime: "2h 15m", logs: ["Sandbox environment initialized", "Lua VM loaded"] },
    { id: "agora-db", name: "agora-db-postgres", status: "running", cpu: 1.2, mem: "98MB", port: "5432", uptime: "1d 4h", logs: ["Database system ready for connections", "Max connections: 100"] }
  ]);

  const handleRestartContainer = (id: string, name: string) => {
    addTerminalLog(`Commande reçue: docker restart ${name}`);
    
    // Set container state to transitioning
    setContainers(prev => prev.map(c => c.id === id ? { ...c, status: "restarting", cpu: 0 } : c));
    
    setTimeout(() => {
      addTerminalLog(`Conteneur ${name} arrêté avec succès.`);
      setTimeout(() => {
        setContainers(prev => prev.map(c => c.id === id ? { ...c, status: "running", cpu: Math.random() * 8 + 1, uptime: "0m" } : c));
        addTerminalLog(`Conteneur ${name} redémarré (Portée en ligne sur le réseau).`);
      }, 1000);
    }, 1200);
  };

  const handleStopContainer = (id: string, name: string) => {
    const isRunning = containers.find(c => c.id === id)?.status === "running";
    if (isRunning) {
      addTerminalLog(`Commande reçue: docker stop ${name}`);
      setContainers(prev => prev.map(c => c.id === id ? { ...c, status: "stopped", cpu: 0, mem: "0MB" } : c));
      addTerminalLog(`Conteneur ${name} arrêté.`);
    } else {
      addTerminalLog(`Commande reçue: docker start ${name}`);
      setContainers(prev => prev.map(c => c.id === id ? { ...c, status: "running", cpu: Math.random() * 5 + 1, mem: "80MB" } : c));
      addTerminalLog(`Conteneur ${name} démarré.`);
    }
  };

  // ==========================================
  // TAB 2: STATIC & DYNAMIC CODE ANALYSIS
  // ==========================================
  const [codeToAnalyze, setCodeToAnalyze] = useState(`// Exemple de code à analyser
function processUserData(user) {
  var unusedVariable = 42;
  eval("console.log('Nom de l\\'utilisateur: ' + user.name)"); // Attention!
  
  if (user.role == "admin") {
    console.log("Accès privilégié accordé.");
  }
}`);
  const [analysisResults, setAnalysisResults] = useState<{
    score: number;
    issues: { severity: "critical" | "warning" | "info"; message: string; line: number; rule: string }[];
    status: "idle" | "running" | "completed";
  }>({
    score: 100,
    issues: [],
    status: "idle"
  });

  const handleRunAnalysis = () => {
    setAnalysisResults(prev => ({ ...prev, status: "running" }));
    addTerminalLog("Lancement de l'analyse statique du code...");
    
    setTimeout(() => {
      const issues: any[] = [];
      const lines = codeToAnalyze.split("\n");
      
      lines.forEach((lineText, idx) => {
        const lineNum = idx + 1;
        
        // Check for eval()
        if (lineText.includes("eval(")) {
          issues.push({
            severity: "critical",
            rule: "Security-Risk: Avoid Eval",
            message: "L'utilisation de eval() présente un risque de sécurité majeur par injection de code.",
            line: lineNum
          });
        }
        
        // Check for var instead of let/const
        if (lineText.includes("var ")) {
          issues.push({
            severity: "warning",
            rule: "Code-Quality: Block Scoped Variables",
            message: "Privilégiez 'let' ou 'const' à la place de 'var' pour éviter les effets de bord de hoisting.",
            line: lineNum
          });
        }
        
        // Check for console.log
        if (lineText.includes("console.log(")) {
          issues.push({
            severity: "info",
            rule: "Production-Cleanliness: Remnants",
            message: "L'utilisation de console.log() doit être évitée en production. Utilisez un logger adapté.",
            line: lineNum
          });
        }

        // Check for non-strict equality (==)
        if (lineText.includes(" == ")) {
          issues.push({
            severity: "warning",
            rule: "Type-Safety: Loose Equality",
            message: "Utilisez la comparaison stricte (===) au lieu de (==) pour éviter les conversions de type implicites.",
            line: lineNum
          });
        }
      });

      // Simple score calc
      const deduction = issues.reduce((acc, issue) => {
        if (issue.severity === "critical") return acc + 25;
        if (issue.severity === "warning") return acc + 10;
        return acc + 3;
      }, 0);
      
      const finalScore = Math.max(0, 100 - deduction);
      setAnalysisResults({
        score: finalScore,
        issues,
        status: "completed"
      });
      addTerminalLog(`Analyse de code terminée. Score de qualité global: ${finalScore}% (${issues.length} anomalies identifiées).`);
    }, 1500);
  };

  // ==========================================
  // TAB 3: INTERACTIVE DATABASE CLIENT
  // ==========================================
  const [sqlQuery, setSqlQuery] = useState("SELECT id, username, email, role, quotaLimit FROM users;");
  const [queryResults, setQueryResults] = useState<{
    columns: string[];
    rows: any[];
    executionTimeMs: number;
    error: string | null;
  } | null>(null);

  const executeMockSql = () => {
    addTerminalLog(`Exécution de la requête SQL: "${sqlQuery}"`);
    const cleanQuery = sqlQuery.trim().toLowerCase().replace(/;$/, "");
    
    setTimeout(() => {
      try {
        if (cleanQuery.startsWith("select") && cleanQuery.includes("from users")) {
          const rows = users.map(u => ({
            id: u.id,
            username: u.username,
            email: u.email,
            role: u.role,
            quotaLimit: u.quotaLimit
          }));
          setQueryResults({
            columns: ["id", "username", "email", "role", "quotaLimit"],
            rows,
            executionTimeMs: 12,
            error: null
          });
          addTerminalLog(`Requête SQL exécutée avec succès (${rows.length} lignes retournées).`);
        } else if (cleanQuery.startsWith("select") && cleanQuery.includes("from logs")) {
          const rows = logs.slice(0, 10).map(l => ({
            id: l.id,
            timestamp: l.timestamp.split("T")[1]?.substring(0, 8) || l.timestamp,
            type: l.type,
            message: l.message.substring(0, 40) + (l.message.length > 40 ? "..." : ""),
            source: l.source
          }));
          setQueryResults({
            columns: ["id", "timestamp", "type", "message", "source"],
            rows,
            executionTimeMs: 8,
            error: null
          });
          addTerminalLog(`Requête SQL exécutée avec succès (${rows.length} lignes de logs retournées).`);
        } else if (cleanQuery.startsWith("select") && cleanQuery.includes("from chats")) {
          const rows = chats.slice(0, 10).map(c => ({
            id: c.id,
            title: c.title,
            messages_count: c.messages.length,
            created_at: safeFormatDate(c.createdAt)
          }));
          setQueryResults({
            columns: ["id", "title", "messages_count", "created_at"],
            rows,
            executionTimeMs: 15,
            error: null
          });
          addTerminalLog(`Requête SQL exécutée avec succès (${rows.length} conversations retournées).`);
        } else {
          // Fallback simple query
          setQueryResults({
            columns: [],
            rows: [],
            executionTimeMs: 0,
            error: "Erreur de syntaxe SQL ou table introuvable. Tables disponibles: 'users', 'logs', 'chats'"
          });
          addTerminalLog("SQL Erreur: Table introuvable.");
        }
      } catch (err: any) {
        setQueryResults({
          columns: [],
          rows: [],
          executionTimeMs: 0,
          error: err?.message || "Erreur d'exécution de la requête."
        });
      }
    }, 500);
  };

  // ==========================================
  // TAB 4: DEPENDENCY MANAGER
  // ==========================================
  const [packageSearch, setPackageSearch] = useState("");
  const [installedPackages, setInstalledPackages] = useState([
    { name: "express", version: "4.19.2", type: "npm", desc: "Fast, unopinionated, minimalist web framework for node." },
    { name: "@google/genai", version: "0.1.1", type: "npm", desc: "The official Google Gen AI SDK for Node.js and Browser." },
    { name: "motion", version: "11.11.11", type: "npm", desc: "Production-ready animation library for React." },
    { name: "lucide-react", version: "0.395.0", type: "npm", desc: "Beautiful & consistent icon toolkit for React." }
  ]);
  const [installingPkgName, setInstallingPkgName] = useState<string | null>(null);

  const handleInstallPackage = (name: string) => {
    if (installedPackages.some(p => p.name === name)) {
      addTerminalLog(`Le package ${name} est déjà présent.`);
      return;
    }
    setInstallingPkgName(name);
    addTerminalLog(`NPM: Résolution des dépendances pour '${name}'...`);
    
    setTimeout(() => {
      addTerminalLog(`NPM: Téléchargement des packages requis pour ${name}...`);
      setTimeout(() => {
        addTerminalLog(`NPM: Extraction des fichiers et mise en cache...`);
        setTimeout(() => {
          setInstalledPackages(prev => [
            ...prev,
            { name, version: "latest", type: "npm", desc: `Package tiers ${name} importé via le terminal de dépendance Agora.` }
          ]);
          setInstallingPkgName(null);
          addTerminalLog(`NPM: Le package '${name}' a été correctement enregistré.`);
        }, 1200);
      }, 1000);
    }, 800);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="devops-console-workspace">
      {/* Left panel: Workstation Main View */}
      <div className="lg:col-span-8 flex flex-col space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl font-display font-medium text-white tracking-tight flex items-center space-x-2.5">
              <Server className="w-6 h-6 text-indigo-400" />
              <span>Tableau de Bord Système (Agora Tools)</span>
            </h2>
            <p className="text-xs text-gray-400">
              Pilotez l'infrastructure virtuelle, inspectez la sécurité et automatisez le cycle de développement.
            </p>
          </div>

          {/* Liquid sub-tabs selector */}
          <div className="flex p-1 rounded-xl bg-white/5 border border-white/10 shrink-0 self-start">
            <button
              onClick={() => setActiveTab("containers")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer flex items-center space-x-1.5 ${
                activeTab === "containers" ? "bg-indigo-600/35 border border-indigo-500/50 text-white shadow-md shadow-indigo-600/10" : "text-gray-400 hover:text-white"
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Containers</span>
            </button>
            <button
              onClick={() => setActiveTab("analysis")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer flex items-center space-x-1.5 ${
                activeTab === "analysis" ? "bg-indigo-600/35 border border-indigo-500/50 text-white shadow-md shadow-indigo-600/10" : "text-gray-400 hover:text-white"
              }`}
            >
              <ListChecks className="w-3.5 h-3.5" />
              <span>Analyse statique</span>
            </button>
            <button
              onClick={() => setActiveTab("database")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer flex items-center space-x-1.5 ${
                activeTab === "database" ? "bg-indigo-600/35 border border-indigo-500/50 text-white shadow-md shadow-indigo-600/10" : "text-gray-400 hover:text-white"
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Console SQL</span>
            </button>
            <button
              onClick={() => setActiveTab("dependencies")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer flex items-center space-x-1.5 ${
                activeTab === "dependencies" ? "bg-indigo-600/35 border border-indigo-500/50 text-white shadow-md shadow-indigo-600/10" : "text-gray-400 hover:text-white"
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>Dépendances</span>
            </button>
          </div>
        </div>

        {/* Dynamic Inner Tab Display with smooth fade */}
        <div className="liquid-glass rounded-2xl border border-white/5 p-5 md:p-6 min-h-[420px] flex flex-col justify-between">
          <AnimatePresence mode="wait">
            
            {/* CONTAINER ORCHESTRATOR TAB */}
            {activeTab === "containers" && (
              <motion.div
                key="tab-containers"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="space-y-6 flex-1 flex flex-col"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-medium text-white text-sm flex items-center space-x-2">
                    <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
                    <span>Orchestration de Conteneurs Virtuels (Docker / Kubernetes Mock)</span>
                  </h3>
                  <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded font-mono">
                    3/3 Actifs
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {containers.map(c => (
                    <div key={c.id} className="bg-black/35 border border-white/5 rounded-xl p-4 flex flex-col justify-between space-y-4 hover:border-indigo-500/20 transition-all">
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-mono font-bold text-gray-300 truncate block max-w-[150px]">
                            {c.name}
                          </span>
                          <span className={`w-2 h-2 rounded-full ${
                            c.status === "running" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" :
                            c.status === "restarting" ? "bg-yellow-500 animate-pulse" : "bg-red-500"
                          }`} />
                        </div>
                        
                        <div className="space-y-1 text-[11px] text-gray-400 font-mono">
                          <p className="flex justify-between">
                            <span>Status:</span>
                            <span className="text-gray-300 capitalize font-semibold">{c.status}</span>
                          </p>
                          <p className="flex justify-between">
                            <span>Uptime:</span>
                            <span className="text-gray-300">{c.uptime}</span>
                          </p>
                          <p className="flex justify-between">
                            <span>Réseau (Port):</span>
                            <span className="text-indigo-400 font-semibold">{c.port}</span>
                          </p>
                        </div>
                      </div>

                      {/* Performance metrics micro-graphs */}
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-gray-500 font-mono">
                            <span>CPU</span>
                            <span>{c.cpu.toFixed(1)}%</span>
                          </div>
                          <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
                            <div className="bg-indigo-500 h-full transition-all duration-500" style={{ width: `${Math.max(2, (c.cpu / 15) * 100)}%` }} />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-gray-500 font-mono">
                            <span>RAM</span>
                            <span>{c.mem}</span>
                          </div>
                          <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
                            <div className="bg-pink-500 h-full transition-all" style={{ width: c.status === "running" ? "65%" : "0%" }} />
                          </div>
                        </div>
                      </div>

                      {/* Restart/Stop actions */}
                      <div className="flex gap-2 pt-2 border-t border-white/5">
                        <button
                          type="button"
                          onClick={() => handleRestartContainer(c.id, c.name)}
                          disabled={c.status !== "running"}
                          className="flex-1 flex items-center justify-center space-x-1 px-2 py-1.5 rounded bg-white/5 hover:bg-white/10 text-[10px] font-semibold text-gray-300 transition-all cursor-pointer disabled:opacity-40"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Restart</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStopContainer(c.id, c.name)}
                          disabled={c.status === "restarting"}
                          className={`flex-1 flex items-center justify-center space-x-1 px-2 py-1.5 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                            c.status === "running" 
                              ? "bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/15" 
                              : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/15"
                          }`}
                        >
                          {c.status === "running" ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                          <span>{c.status === "running" ? "Stop" : "Start"}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-black/30 border border-white/5 p-4 rounded-xl space-y-2 flex-1">
                  <span className="text-[11px] font-mono font-bold text-gray-400 uppercase tracking-wider block">Logs de conteneurs fusionnés</span>
                  <div className="font-mono text-[11px] text-gray-300 space-y-1 max-h-[140px] overflow-y-auto custom-scrollbar">
                    {containers.filter(c => c.status === "running").flatMap(c => 
                      c.logs.map(log => (
                        <div key={log} className="flex space-x-2">
                          <span className="text-indigo-400">[{c.name}]</span>
                          <span className="text-gray-400">{log}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* STATIC & DYNAMIC ANALYSIS TAB */}
            {activeTab === "analysis" && (
              <motion.div
                key="tab-analysis"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="space-y-4 flex-1 flex flex-col"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-medium text-white text-sm flex items-center space-x-2">
                    <ListChecks className="w-4 h-4 text-indigo-400" />
                    <span>Linter Interactif & Analyseur de Vulnérabilités de Sécurité</span>
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
                  {/* Left: Input */}
                  <div className="flex flex-col space-y-2">
                    <span className="text-[11px] font-mono font-bold text-gray-400 uppercase">Éditeur de code source</span>
                    <textarea
                      value={codeToAnalyze}
                      onChange={(e) => setCodeToAnalyze(e.target.value)}
                      className="flex-1 min-h-[180px] p-3 font-mono text-xs bg-black/40 border border-white/5 rounded-xl text-indigo-300 focus:outline-none focus:border-indigo-500/50 resize-none"
                    />
                    <button
                      type="button"
                      onClick={handleRunAnalysis}
                      disabled={analysisResults.status === "running"}
                      className="w-full flex items-center justify-center space-x-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white rounded-xl shadow-md cursor-pointer disabled:opacity-50 transition-all font-display"
                    >
                      {analysisResults.status === "running" ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Analyse en cours...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          <span>Lancer l'analyse du code</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Right: Diagnostic report card */}
                  <div className="bg-black/30 border border-white/5 rounded-xl p-4 flex flex-col justify-between space-y-4">
                    {analysisResults.status === "idle" ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-3">
                        <Code2 className="w-10 h-10 text-gray-600" />
                        <p className="text-xs text-gray-400">Collez votre code dans l'éditeur et cliquez sur lancer l'analyse pour identifier d'éventuels bugs ou failles.</p>
                      </div>
                    ) : analysisResults.status === "running" ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-3">
                        <RefreshCw className="w-10 h-10 text-indigo-400 animate-spin" />
                        <p className="text-xs text-indigo-300 animate-pulse">Scanning AST parser engine trees...</p>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col justify-between space-y-4">
                        {/* Summary Score bar */}
                        <div className="flex items-center justify-between border-b border-white/5 pb-3">
                          <div>
                            <span className="text-xs text-gray-400 block font-semibold">Score de Qualité</span>
                            <span className="text-2xl font-bold font-display text-white">{analysisResults.score}%</span>
                          </div>
                          
                          <div className="flex space-x-3 text-center">
                            <div className="px-2 py-1 bg-red-500/10 border border-red-500/25 rounded">
                              <span className="block text-[11px] font-bold text-red-400 font-mono">
                                {analysisResults.issues.filter(i => i.severity === "critical").length}
                              </span>
                              <span className="text-[9px] text-gray-500 font-bold uppercase">Critiques</span>
                            </div>
                            <div className="px-2 py-1 bg-yellow-500/10 border border-yellow-500/25 rounded">
                              <span className="block text-[11px] font-bold text-yellow-400 font-mono">
                                {analysisResults.issues.filter(i => i.severity === "warning").length}
                              </span>
                              <span className="text-[9px] text-gray-500 font-bold uppercase">Warnings</span>
                            </div>
                            <div className="px-2 py-1 bg-blue-500/10 border border-blue-500/25 rounded">
                              <span className="block text-[11px] font-bold text-blue-400 font-mono">
                                {analysisResults.issues.filter(i => i.severity === "info").length}
                              </span>
                              <span className="text-[9px] text-gray-500 font-bold uppercase">Infos</span>
                            </div>
                          </div>
                        </div>

                        {/* List of alerts */}
                        <div className="flex-1 overflow-y-auto max-h-[140px] custom-scrollbar space-y-2">
                          {analysisResults.issues.length === 0 ? (
                            <div className="text-center p-4">
                              <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-1" />
                              <span className="text-xs text-emerald-400 font-medium">Félicitations! Aucun problème détecté.</span>
                            </div>
                          ) : (
                            analysisResults.issues.map((issue, idx) => (
                              <div key={idx} className={`p-2.5 rounded-lg border text-xs flex items-start space-x-2.5 ${
                                issue.severity === "critical" ? "bg-red-500/5 border-red-500/10 text-red-200" :
                                issue.severity === "warning" ? "bg-yellow-500/5 border-yellow-500/10 text-yellow-200" :
                                "bg-indigo-500/5 border-indigo-500/10 text-indigo-200"
                              }`}>
                                {issue.severity === "critical" ? <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" /> :
                                 issue.severity === "warning" ? <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" /> :
                                 <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />}
                                <div>
                                  <div className="flex items-center space-x-1.5">
                                    <span className="font-mono font-bold uppercase text-[9px] bg-white/5 px-1.5 py-0.5 rounded text-gray-300">
                                      {issue.rule}
                                    </span>
                                    <span className="text-[10px] text-gray-400 font-mono">Ligne {issue.line}</span>
                                  </div>
                                  <p className="mt-0.5 text-gray-300 leading-relaxed text-[11px]">{issue.message}</p>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* INTERACTIVE SQL CLIENT TAB */}
            {activeTab === "database" && (
              <motion.div
                key="tab-database"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="space-y-4 flex-1 flex flex-col"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-medium text-white text-sm flex items-center space-x-2">
                    <Database className="w-4 h-4 text-indigo-400" />
                    <span>Client Interactif SQL (PostgreSQL Virtual Engine)</span>
                  </h3>
                </div>

                {/* Templates shortcut */}
                <div className="flex items-center space-x-2 flex-wrap gap-y-2">
                  <span className="text-[10px] text-gray-500 font-mono font-bold uppercase mr-1">Raccourcis:</span>
                  <button
                    onClick={() => setSqlQuery("SELECT id, username, email, role, quotaLimit FROM users;")}
                    className="px-2 py-1 rounded bg-white/5 border border-white/5 hover:border-indigo-500/30 text-[10px] text-indigo-300 hover:text-white transition-all cursor-pointer font-mono"
                  >
                    SELECT FROM users
                  </button>
                  <button
                    onClick={() => setSqlQuery("SELECT id, timestamp, type, message, source FROM logs;")}
                    className="px-2 py-1 rounded bg-white/5 border border-white/5 hover:border-indigo-500/30 text-[10px] text-indigo-300 hover:text-white transition-all cursor-pointer font-mono"
                  >
                    SELECT FROM logs
                  </button>
                  <button
                    onClick={() => setSqlQuery("SELECT id, title, created_at FROM chats;")}
                    className="px-2 py-1 rounded bg-white/5 border border-white/5 hover:border-indigo-500/30 text-[10px] text-indigo-300 hover:text-white transition-all cursor-pointer font-mono"
                  >
                    SELECT FROM chats
                  </button>
                </div>

                <div className="flex gap-2 items-end">
                  <div className="flex-1 relative">
                    <textarea
                      value={sqlQuery}
                      onChange={(e) => setSqlQuery(e.target.value)}
                      className="w-full h-16 p-3 pl-8 font-mono text-xs bg-black/40 border border-white/5 rounded-xl text-emerald-400 focus:outline-none focus:border-emerald-500/40 resize-none"
                    />
                    <Terminal className="w-4 h-4 text-emerald-500/40 absolute top-3.5 left-2.5 pointer-events-none" />
                  </div>
                  <button
                    type="button"
                    onClick={executeMockSql}
                    className="px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white rounded-xl shadow-md shadow-emerald-950/20 flex items-center space-x-1.5 transition-all cursor-pointer self-stretch mb-0.5"
                  >
                    <Play className="w-4 h-4" />
                    <span>Run Query</span>
                  </button>
                </div>

                {/* SQL Result view */}
                <div className="flex-1 bg-black/35 border border-white/5 rounded-xl p-4 overflow-hidden flex flex-col justify-between min-h-[160px]">
                  {queryResults === null ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center py-6 text-gray-500 space-y-1.5">
                      <Terminal className="w-8 h-8 opacity-40 text-emerald-500" />
                      <p className="text-xs">Saisissez une commande SQL valide et cliquez sur Run Query.</p>
                    </div>
                  ) : queryResults.error ? (
                    <div className="flex-1 flex items-center space-x-2 p-3 bg-red-950/20 border border-red-500/10 rounded-lg text-red-400 text-xs font-mono">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{queryResults.error}</span>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col justify-between overflow-hidden">
                      <div className="flex justify-between items-center pb-2 border-b border-white/5 text-[10px] text-gray-500 font-mono">
                        <span>Résultat de la console d'administration</span>
                        <span>{queryResults.rows.length} lignes en {queryResults.executionTimeMs}ms</span>
                      </div>

                      {/* Result table */}
                      <div className="flex-1 overflow-x-auto overflow-y-auto max-h-[130px] custom-scrollbar mt-2">
                        <table className="w-full text-left border-collapse text-[11px] font-mono">
                          <thead>
                            <tr className="border-b border-white/5 text-gray-400 bg-white/2">
                              {queryResults.columns.map(col => (
                                <th key={col} className="px-3 py-1.5 font-bold uppercase tracking-wider">{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/2 text-gray-300">
                            {queryResults.rows.map((row, rIdx) => (
                              <tr key={rIdx} className="hover:bg-white/2">
                                {queryResults.columns.map(col => (
                                  <td key={col} className="px-3 py-1.5 truncate max-w-[200px]">{String(row[col])}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* DEPENDENCY MANAGER TAB */}
            {activeTab === "dependencies" && (
              <motion.div
                key="tab-dependencies"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="space-y-4 flex-1 flex flex-col"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-medium text-white text-sm flex items-center space-x-2">
                    <Package className="w-4 h-4 text-indigo-400" />
                    <span>Gestionnaire Interactif des Dépendances (Pip / NPM Registry)</span>
                  </h3>
                </div>

                {/* Install quick bar */}
                <div className="flex items-center space-x-2 bg-black/40 border border-white/5 p-1 rounded-xl">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="Rechercher ou ajouter un package npm (ex: lodash, axios, react-router...)"
                      value={packageSearch}
                      onChange={(e) => setPackageSearch(e.target.value)}
                      className="w-full bg-transparent border-none outline-none py-2.5 pl-9 text-xs text-indigo-200 placeholder-gray-500"
                    />
                    <Search className="w-4 h-4 text-gray-500 absolute top-3 left-3" />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (packageSearch.trim()) {
                        handleInstallPackage(packageSearch.trim().toLowerCase());
                        setPackageSearch("");
                      }
                    }}
                    disabled={installingPkgName !== null || !packageSearch.trim()}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white rounded-lg shadow cursor-pointer transition-all disabled:opacity-40"
                  >
                    Installer
                  </button>
                </div>

                {/* Registry grid list */}
                <div className="flex-1 flex flex-col justify-between space-y-4">
                  <span className="text-[11px] font-mono font-bold text-gray-400 uppercase tracking-wide block">Packages installés dans le runtime</span>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[160px] overflow-y-auto custom-scrollbar">
                    {installedPackages.map(pkg => (
                      <div key={pkg.name} className="p-3 rounded-lg border border-white/5 bg-black/20 flex items-start justify-between space-x-3 hover:border-indigo-500/20 transition-all">
                        <div className="min-w-0">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="font-mono font-bold text-white text-xs truncate block">{pkg.name}</span>
                            <span className="text-[9px] font-mono text-indigo-400 font-bold bg-indigo-500/10 px-1.5 py-0.2 rounded">v{pkg.version}</span>
                          </div>
                          <p className="text-[11px] text-gray-400 line-clamp-1">{pkg.desc}</p>
                        </div>
                        <span className="text-[9px] font-mono font-bold text-gray-500 uppercase bg-white/5 px-2 py-0.5 rounded shrink-0">
                          {pkg.type}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Install loading overlay */}
                {installingPkgName && (
                  <div className="p-3 bg-indigo-950/25 border border-indigo-500/15 rounded-xl flex items-center space-x-3 text-xs text-indigo-200 font-mono animate-pulse">
                    <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin" />
                    <span>NPM en cours d'installation : npm install {installingPkgName}...</span>
                  </div>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>

      {/* Right panel: Static Diagnostic Console & Live logs */}
      <div className="lg:col-span-4 flex flex-col space-y-6">
        <div className="liquid-glass rounded-2xl border border-white/5 p-5 flex flex-col justify-between h-full min-h-[420px]">
          <div className="space-y-4 flex-1 flex flex-col">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <span className="font-display font-medium text-white text-sm flex items-center space-x-2">
                <Terminal className="w-4 h-4 text-indigo-400" />
                <span>Console Système Agora AI</span>
              </span>
              <button
                type="button"
                onClick={() => setTerminalLogs([])}
                className="p-1 rounded hover:bg-white/5 text-gray-500 hover:text-white transition-all cursor-pointer"
                title="Vider la console"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Terminal display */}
            <div className="flex-1 bg-black/50 rounded-xl p-4 font-mono text-[10px] text-indigo-300 space-y-1.5 overflow-y-auto max-h-[300px] custom-scrollbar">
              {terminalLogs.length === 0 ? (
                <div className="text-gray-600 italic">Console vide. Les commandes exécutées s'afficheront ici.</div>
              ) : (
                terminalLogs.map((log, idx) => (
                  <div key={idx} className="leading-relaxed whitespace-pre-wrap select-text">
                    {log.startsWith("[System]") ? (
                      <span className="text-indigo-400 font-bold">{log}</span>
                    ) : log.includes("NPM") ? (
                      <span className="text-pink-400">{log}</span>
                    ) : log.includes("SQL") ? (
                      <span className="text-emerald-400">{log}</span>
                    ) : (
                      <span className="text-gray-300">{log}</span>
                    )}
                  </div>
                ))
              )}
              <div ref={terminalBottomRef} />
            </div>
          </div>

          <div className="pt-4 border-t border-white/5 space-y-2 text-[11px] text-gray-400">
            <div className="flex justify-between">
              <span>Hôte Système:</span>
              <span className="font-mono text-gray-300">workspace.agora.local</span>
            </div>
            <div className="flex justify-between">
              <span>Version de l'API:</span>
              <span className="font-mono text-gray-300">v1.2.5-prod</span>
            </div>
            <div className="flex justify-between">
              <span>Environnement:</span>
              <span className="font-mono text-emerald-400 font-semibold uppercase">Cloud Sandbox</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
