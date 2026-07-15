import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Shield, Cpu, MessageSquare, Key, LogOut, Layers, 
  Terminal, Globe, Sparkles, CheckCircle, RefreshCw, Server
} from "lucide-react";

import { User, Agent, Chat, Message, SystemLog, safeFormatTime } from "./types";
import AuthScreen from "./components/AuthScreen";
import ChatInterface from "./components/ChatInterface";
import AgentTree from "./components/AgentTree";
import ModelKeysManager from "./components/ModelKeysManager";
import AdminPanel from "./components/AdminPanel";
import DevOpsConsole from "./components/DevOpsConsole";

type ActiveTab = "chat" | "tree" | "keys" | "tools" | "admin";

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("chat");

  // Abort controller for agent orchestration interruption
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastSentContentRef = useRef<string>("");

  // Core Data State
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [users, setUsers] = useState<User[]>([]); // Admin only
  const [logs, setLogs] = useState<SystemLog[]>([]); // Admin only

  // UI state
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [modelError, setModelError] = useState<string | undefined>(undefined);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [serverLogs, setServerLogs] = useState<Array<{ type: string; message: string; source: string; timestamp: string }>>([]);

  // Auto load user from session storage for convenience on reload
  useEffect(() => {
    const cachedUser = sessionStorage.getItem("agora_user");
    if (cachedUser) {
      try {
        const parsed = JSON.parse(cachedUser);
        setCurrentUser(parsed);
      } catch (err) {
        console.error("Error parsing cached session user", err);
      }
    }
  }, []);

  // Sync core loops when currentUser is set
  useEffect(() => {
    if (currentUser) {
      // Fetch initial data
      fetchUserData();
      fetchAgents();
      
      // Setup periodic sync for "Real-time collaborative simulation"
      const interval = setInterval(() => {
        fetchAgents();
        if (currentUser.role === "admin") {
          fetchAdminLogs();
          fetchUsersList();
          fetchAdminChats();
        } else {
          fetchUserChats();
        }
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [currentUser]);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Global Keyboard Shortcuts for PC Power Users
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid intercepting shortcuts when user is typing inside an input or textarea
      const activeEl = document.activeElement;
      const isTyping = activeEl && (
        activeEl.tagName === "INPUT" || 
        activeEl.tagName === "TEXTAREA" || 
        activeEl.getAttribute("contenteditable") === "true"
      );

      // Alt/Option + 1 to 5 for fast tab shifting
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.key === "1") {
          e.preventDefault();
          setActiveTab("chat");
          showToast("Workspace actif");
        } else if (e.key === "2") {
          e.preventDefault();
          setActiveTab("tree");
          showToast("Arbre d'orchestration actif");
        } else if (e.key === "3") {
          e.preventDefault();
          setActiveTab("keys");
          showToast("Gestion des Clés API actif");
        } else if (e.key === "4") {
          e.preventDefault();
          setActiveTab("tools");
          showToast("Tableau de bord DevOps actif");
        } else if (e.key === "5" && currentUser?.role === "admin") {
          e.preventDefault();
          setActiveTab("admin");
          showToast("Console d'Administration active");
        }
      }

      // Ctrl+N (or Cmd+N) for creating a new chat when not typing
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        if (!isTyping) {
          e.preventDefault();
          handleCreateChat();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentUser, chats]);

  const fetchUserData = async () => {
    if (!currentUser) return;
    setIsLoadingData(true);
    try {
      // Load appropriate chats list
      await fetchUserChats();
    } catch (err) {
      console.error("Error loading user initial data", err);
    } finally {
      setIsLoadingData(false);
    }
  };

  const fetchUserChats = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch(`/api/chats?userId=${currentUser.id}`);
      if (res.ok) {
        const data = await res.json();
        setChats(data);
        if (data.length > 0 && !activeChat) {
          setActiveChat(data[0]);
        }
      }
    } catch (err: any) {
      console.error("Error fetching chats", err?.stack || err);
    }
  };

  const fetchAgents = async () => {
    try {
      const res = await fetch("/api/agents");
      if (res.ok) {
        const data = await res.json();
        setAgents(data);
      }
    } catch (err: any) {
      console.error("Error fetching agents", err?.stack || err);
    }
  };

  // Admin: Fetch logs
  const fetchAdminLogs = async () => {
    try {
      const res = await fetch("/api/logs");
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (err: any) {
      console.error("Error fetching logs", err?.stack || err);
    }
  };

  // Admin: Fetch all users
  const fetchUsersList = async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
        // Keep current user updated with dynamic quota changes
        const currentUpdated = data.find((u: User) => u.id === currentUser?.id);
        if (currentUpdated) {
          setCurrentUser(currentUpdated);
          sessionStorage.setItem("agora_user", JSON.stringify(currentUpdated));
        }
      }
    } catch (err: any) {
      console.error("Error fetching users list", err?.stack || err);
    }
  };

  // Admin: Fetch all chats histories
  const fetchAdminChats = async () => {
    try {
      const res = await fetch("/api/admin/chats");
      if (res.ok) {
        const data = await res.json();
        // Set all chats if admin wants to audit globally
        if (activeTab === "admin") {
          setChats(data);
        }
      }
    } catch (err: any) {
      console.error("Error fetching admin chats histories", err?.stack || err);
    }
  };

  // Chat Actions
  const handleSelectChat = (chatId: string) => {
    const selected = chats.find(c => c.id === chatId);
    if (selected) {
      setActiveChat(selected);
    }
  };

  const handleCreateChat = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUser.id,
          userName: currentUser.username,
          title: `Chat ${safeFormatTime(new Date(), { hour: '2-digit', minute: '2-digit' })}`
        })
      });
      if (res.ok) {
        const newChat = await res.json();
        setChats(prev => [newChat, ...prev]);
        setActiveChat(newChat);
        showToast("Nouveau chat collaboratif démarré !");
      }
    } catch (err) {
      console.error("Error creating chat", err);
    }
  };

  const handleDeleteChat = async (chatId: string) => {
    try {
      const res = await fetch(`/api/chats/${chatId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        setChats(prev => prev.filter(c => c.id !== chatId));
        if (activeChat?.id === chatId) {
          setActiveChat(null);
        }
        showToast("Chat supprimé de l'historique.");
      }
    } catch (err) {
      console.error("Error deleting chat", err);
    }
  };

  const handleUpdateChat = async (chatId: string, updates: Partial<Chat>) => {
    try {
      const res = await fetch(`/api/chats/${chatId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        const updatedChat = await res.json();
        setChats(prev => prev.map(c => c.id === chatId ? updatedChat : c));
        if (activeChat?.id === chatId) {
          setActiveChat(updatedChat);
        }
      }
    } catch (err) {
      console.error("Error updating chat", err);
    }
  };

  const handleSendMessage = async (content: string, attachments?: any[]) => {
    if (!currentUser || !activeChat) return;

    // Keep track of the text we are trying to send in case we need to retry later
    lastSentContentRef.current = content;

    const tempUserMsg: Message = {
      id: `temp-usr-${Date.now()}`,
      senderId: currentUser.id,
      senderName: currentUser.username,
      senderRole: "user",
      content,
      timestamp: new Date().toISOString(),
      attachments
    };

    const updatedActiveChat = {
      ...activeChat,
      messages: [...activeChat.messages, tempUserMsg]
    };

    setActiveChat(updatedActiveChat);
    setChats(prev => prev.map(c => c.id === activeChat.id ? updatedActiveChat : c));

    setIsProcessing(true);
    setModelError(undefined);
    setServerLogs([]);

    // Setup AbortController
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch(`/api/chats/${activeChat.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderId: currentUser.id,
          senderName: currentUser.username,
          content,
          attachments
        }),
        signal: controller.signal
      });

      if (res.ok) {
        // Read the NDJSON response stream!
        const reader = res.body?.getReader();
        const decoder = new TextDecoder("utf-8");
        
        if (!reader) {
          throw new Error("Le flux de réponse n'est pas supporté par votre navigateur.");
        }

        // Initialize a temporary AI message in the active chat so it types in real-time
        const aiMessageId = `msg-${Date.now()}-ai-streaming`;
        const tempAiMsg: Message = {
          id: aiMessageId,
          senderId: "agent-architect",
          senderName: "Agora Agents A∀",
          senderRole: "agent",
          content: "",
          timestamp: new Date().toISOString(),
          steps: [],
          actualModelUsed: "Orchestrateur Agora"
        };

        // Append this streaming message to the active chat initially
        let currentChatWithStreaming = {
          ...updatedActiveChat,
          messages: [...updatedActiveChat.messages, tempAiMsg]
        };
        setActiveChat(currentChatWithStreaming);
        setChats(prev => prev.map(c => c.id === activeChat.id ? currentChatWithStreaming : c));

        let buffer = "";
        let finalData: any = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          
          // Split by newlines (NDJSON format)
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // keep the last partial line in buffer

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            try {
              const parsed = JSON.parse(trimmed);
              if (parsed.type === "step") {
                // An agent step completed! Update steps in our streaming message
                tempAiMsg.steps = [...tempAiMsg.steps, parsed.step];
                if (parsed.step.codeBlock) {
                  // If it's a code generation step, we can also link codeFiles
                  if (!tempAiMsg.codeFiles) tempAiMsg.codeFiles = [];
                  // check if already added
                  if (!tempAiMsg.codeFiles.some((f: any) => f.fileName === parsed.step.codeBlock.fileName)) {
                    tempAiMsg.codeFiles.push(parsed.step.codeBlock);
                  }
                }
                
                currentChatWithStreaming = {
                  ...updatedActiveChat,
                  messages: [...updatedActiveChat.messages, { ...tempAiMsg }]
                };
                setActiveChat(currentChatWithStreaming);
                setChats(prev => prev.map(c => c.id === activeChat.id ? currentChatWithStreaming : c));
              } else if (parsed.type === "log") {
                // Server log — display in real-time
                setServerLogs(prev => [...prev, parsed.log]);
              } else if (parsed.type === "chunk") {
                // A text chunk generated! Append to content
                tempAiMsg.content += parsed.text;
                
                currentChatWithStreaming = {
                  ...updatedActiveChat,
                  messages: [...updatedActiveChat.messages, { ...tempAiMsg }]
                };
                setActiveChat(currentChatWithStreaming);
                setChats(prev => prev.map(c => c.id === activeChat.id ? currentChatWithStreaming : c));
              } else if (parsed.type === "done") {
                // Final full chat object and quota details
                finalData = parsed;
              }
            } catch (err) {
              console.warn("Error parsing stream line:", err, trimmed);
            }
          }
        }

        // Processing finished! If we got the final done message, apply the final complete state
        if (finalData && finalData.chat) {
          setActiveChat(finalData.chat);
          setChats(prev => prev.map(c => c.id === finalData.chat.id ? finalData.chat : c));
          
          const updatedUser = { ...currentUser, quotaUsed: finalData.quotaUsed };
          setCurrentUser(updatedUser);
          sessionStorage.setItem("agora_user", JSON.stringify(updatedUser));
        } else {
          // Fallback: reload chats if final complete state wasn't successfully decoded
          await fetchUserChats();
        }
      } else {
        const errorData = await res.json();
        // Keep the user message so they can see and retry it
        setModelError(errorData.error || "Une erreur s'est produite lors de l'orchestration des agents.");
      }
    } catch (err: any) {
      if (err.name === "AbortError" || err.message === "The user aborted a request.") {
        console.log("Request was explicitly aborted by user.");
        // Try reloading the chat messages to see if any partial response was stored
        await fetchUserChats();
      } else {
        console.error("Error sending message", err);
        setModelError("Connexion perdue avec la passerelle d'agents Agora AI.");
      }
    } finally {
      abortControllerRef.current = null;
      setIsProcessing(false);
      // Refresh agents to show they completed their tasks
      fetchAgents();
    }
  };

  const handleInterruptResponse = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsProcessing(false);
      showToast("Génération interrompue par l'utilisateur.");
    }
  };

  const handleRetryLastMessage = () => {
    const textToRetry = lastSentContentRef.current;
    if (textToRetry) {
      // Clear error and trigger sending again
      setModelError(undefined);
      handleSendMessage(textToRetry);
    } else if (activeChat && activeChat.messages.length > 0) {
      // Fallback: search for last user message in active chat
      const userMsgs = activeChat.messages.filter(m => m.senderRole === "user");
      if (userMsgs.length > 0) {
        const lastMsg = userMsgs[userMsgs.length - 1];
        setModelError(undefined);
        handleSendMessage(lastMsg.content);
      }
    }
  };

  // Profile API Keys Actions
  const handleAddApiKey = async (name: string, provider: string, key: string, model: string) => {
    if (!currentUser) return;
    try {
      const res = await fetch(`/api/users/${currentUser.id}/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, provider, key, model })
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user);
        sessionStorage.setItem("agora_user", JSON.stringify(data.user));
        showToast(`Clé API ${provider.toUpperCase()} activée avec succès !`);
      }
    } catch (err) {
      console.error("Error adding api key", err);
    }
  };

  const handleDeleteApiKey = async (keyId: string) => {
    if (!currentUser) return;
    try {
      const res = await fetch(`/api/users/${currentUser.id}/keys/${keyId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user);
        sessionStorage.setItem("agora_user", JSON.stringify(data.user));
        showToast("Clé API retirée.");
      }
    } catch (err) {
      console.error("Error deleting api key", err);
    }
  };

  // Update AI Memory & preferences
  const handleUpdatePreferences = async (memory: string, preferences?: any) => {
    if (!currentUser) return;
    try {
      const res = await fetch(`/api/users/${currentUser.id}/preferences`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memory, preferences })
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user);
        sessionStorage.setItem("agora_user", JSON.stringify(data.user));
        showToast("Mémoire et préférences de l'IA synchronisées !");
      }
    } catch (err) {
      console.error("Error updating AI memory preferences", err);
    }
  };

  // Agent self-improvement skill action
  const handleLearnSkill = async (agentId: string, skill: string) => {
    try {
      const res = await fetch(`/api/agents/${agentId}/skill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill })
      });
      if (res.ok) {
        showToast("L'agent a assimilé la nouvelle compétence avec succès !");
        fetchAgents();
      }
    } catch (err) {
      console.error("Error teaching agent", err);
    }
  };

  // Admin overrides
  const handleUpdateQuota = async (userId: string, newQuota: number) => {
    try {
      const res = await fetch("/api/admin/users/quota", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, quotaLimit: newQuota })
      });
      if (res.ok) {
        showToast("Quota rehaussé avec succès.");
        fetchUsersList();
      }
    } catch (err) {
      console.error("Error updating quota", err);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (confirm("Voulez-vous vraiment supprimer ce membre définitivement de la base Agora ?")) {
      try {
        const res = await fetch(`/api/admin/users/${userId}`, {
          method: "DELETE"
        });
        if (res.ok) {
          showToast("Compte membre supprimé définitivement.");
          fetchUsersList();
        }
      } catch (err) {
        console.error("Error deleting user", err);
      }
    }
  };

  const handleResetAgents = async () => {
    try {
      const res = await fetch("/api/admin/agents/reset", {
        method: "POST"
      });
      if (res.ok) {
        showToast("Tous les pipelines d'agents ont été réinitialisés.");
        fetchAgents();
      }
    } catch (err) {
      console.error("Error resetting agents", err);
    }
  };

  // Logout
  const handleLogout = () => {
    setCurrentUser(null);
    sessionStorage.removeItem("agora_user");
    setChats([]);
    setActiveChat(null);
  };

  if (!currentUser) {
    return <AuthScreen onLoginSuccess={(u) => {
      setCurrentUser(u);
      sessionStorage.setItem("agora_user", JSON.stringify(u));
    }} isLoading={isLoadingData} />;
  }

  return (
    <div className={`bg-[#070b13] text-gray-200 relative w-full max-w-full flex flex-col ${
      activeTab === "chat" 
        ? "h-[100dvh] max-h-[100dvh] overflow-hidden p-2 md:p-4" 
        : "min-h-screen p-4 md:p-6 overflow-x-hidden"
    }`} id="main-app">
      
      {/* Background radial blurs */}
      <div className="absolute top-0 right-1/4 w-[500px] h-[500px] rounded-full bg-indigo-600/5 blur-[150px] pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-[500px] h-[500px] rounded-full bg-pink-600/5 blur-[150px] pointer-events-none" />

      {/* Main Top Navigation Bar */}
      <header className={`w-full max-w-7xl mx-auto liquid-glass rounded-2xl border border-white/5 shadow-xl relative z-10 transition-all ${
        activeTab === "chat" 
          ? "px-3 py-2 md:px-4 md:py-3 mb-3 gap-2 flex flex-row items-center justify-between" 
          : "px-6 py-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      }`}>
        
        {/* Branding */}
        <div className="flex items-center space-x-2 md:space-x-3 shrink-0">
          <div className={`${activeTab === "chat" ? "w-8 h-8 rounded-lg text-sm" : "w-10 h-10 rounded-xl text-lg"} bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center font-bold text-white shadow-md shadow-indigo-600/10 shrink-0`}>
            A∀
          </div>
          <div className={activeTab === "chat" ? "hidden xs:block" : ""}>
            <h1 className={`${activeTab === "chat" ? "text-sm md:text-lg" : "text-xl"} font-display font-bold text-white tracking-tight leading-tight`}>Agora Ai</h1>
            <p className={`text-[9px] text-gray-400 font-medium ${activeTab === "chat" ? "hidden md:block" : ""}`}>Multi-Agent Collaboration Engine</p>
          </div>
        </div>

        {/* Tab Links Selector */}
        <nav className="flex p-0.5 md:p-1 rounded-xl bg-white/5 border border-white/10 shrink-0 max-w-full overflow-x-auto backdrop-blur-md">
          <button
            onClick={() => setActiveTab("chat")}
            className={`px-2.5 py-1.5 md:px-4 md:py-2 rounded-lg text-[11px] md:text-xs font-semibold tracking-wide transition-all cursor-pointer flex items-center space-x-1.5 ${
              activeTab === "chat" ? "bg-indigo-600/35 border border-indigo-500/50 text-white shadow-md shadow-indigo-600/15 backdrop-blur-sm" : "text-gray-400 hover:text-white"
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span className={activeTab === "chat" ? "inline" : "hidden sm:inline"}>Workspace</span>
          </button>
          
          <button
            onClick={() => setActiveTab("tree")}
            className={`px-2.5 py-1.5 md:px-4 md:py-2 rounded-lg text-[11px] md:text-xs font-semibold tracking-wide transition-all cursor-pointer flex items-center space-x-1.5 ${
              activeTab === "tree" ? "bg-indigo-600/35 border border-indigo-500/50 text-white shadow-md shadow-indigo-600/15 backdrop-blur-sm" : "text-gray-400 hover:text-white"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className={activeTab === "tree" ? "inline" : "hidden sm:inline"}>Arbre</span>
          </button>

          <button
            onClick={() => setActiveTab("keys")}
            className={`px-2.5 py-1.5 md:px-4 md:py-2 rounded-lg text-[11px] md:text-xs font-semibold tracking-wide transition-all cursor-pointer flex items-center space-x-1.5 ${
              activeTab === "keys" ? "bg-indigo-600/35 border border-indigo-500/50 text-white shadow-md shadow-indigo-600/15 backdrop-blur-sm" : "text-gray-400 hover:text-white"
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span className={activeTab === "keys" ? "inline" : "hidden sm:inline"}>Clés</span>
          </button>

          <button
            onClick={() => setActiveTab("tools")}
            className={`px-2.5 py-1.5 md:px-4 md:py-2 rounded-lg text-[11px] md:text-xs font-semibold tracking-wide transition-all cursor-pointer flex items-center space-x-1.5 ${
              activeTab === "tools" ? "bg-indigo-600/35 border border-indigo-500/50 text-white shadow-md shadow-indigo-600/15 backdrop-blur-sm" : "text-gray-400 hover:text-white"
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span className={activeTab === "tools" ? "inline" : "hidden sm:inline"}>DevOps</span>
          </button>

          {currentUser.role === "admin" && (
            <button
              onClick={() => setActiveTab("admin")}
              className={`px-2.5 py-1.5 md:px-4 md:py-2 rounded-lg text-[11px] md:text-xs font-semibold tracking-wide transition-all cursor-pointer flex items-center space-x-1.5 ${
                activeTab === "admin" ? "bg-pink-600/35 border border-pink-500/50 text-white shadow-md shadow-pink-600/15 backdrop-blur-sm" : "text-gray-400 hover:text-white"
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span className={activeTab === "admin" ? "inline" : "hidden sm:inline"}>Admin</span>
            </button>
          )}
        </nav>

        {/* Session info + Logout */}
        <div className="flex items-center space-x-2 md:space-x-4 shrink-0">
          <div className={`text-right ${activeTab === "chat" ? "hidden md:block" : ""}`}>
            <div className="flex items-center space-x-1.5 justify-end">
              <span className="text-xs font-semibold text-white">{currentUser.username}</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono uppercase font-semibold ${
                currentUser.role === "admin" ? "bg-pink-500/15 text-pink-400 border border-pink-500/20" : "bg-blue-500/15 text-blue-400 border border-blue-500/20"
              }`}>
                {currentUser.role}
              </span>
            </div>
            <span className="text-[10px] text-gray-400 block mt-0.5">
              Quota : {currentUser.quotaUsed}/{currentUser.quotaLimit} req.
            </span>
          </div>

          <button
            onClick={handleLogout}
            className={`${activeTab === "chat" ? "p-2 rounded-lg" : "p-2.5 rounded-xl"} bg-white/5 border border-white/10 hover:border-pink-500/30 hover:text-pink-400 transition-all cursor-pointer`}
            title="Se déconnecter de la session"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

      </header>

      {/* Dynamic Toast feedback */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -50, scale: 0.95 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-indigo-950/90 border border-indigo-500/40 text-indigo-200 text-xs font-semibold shadow-[0_0_20px_rgba(99,102,241,0.3)] flex items-center space-x-2"
          >
            <CheckCircle className="w-4 h-4 text-indigo-400 animate-pulse" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Workspace Frame container */}
      <main className={`w-full max-w-7xl mx-auto flex-1 relative z-10 min-h-0 ${
        activeTab === "chat" ? "h-full overflow-hidden flex flex-col" : ""
      }`}>
        <AnimatePresence mode="wait">
          
          {activeTab === "chat" && (
            <motion.div
              key="chat-tab"
              initial={{ opacity: 0, scale: 0.99 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.99 }}
              className="h-full flex-1 flex flex-col min-h-0 overflow-hidden"
            >
              <ChatInterface
                chats={chats}
                activeChat={activeChat}
                currentUser={currentUser}
                onSelectChat={handleSelectChat}
                onCreateChat={handleCreateChat}
                onDeleteChat={handleDeleteChat}
                onSendMessage={handleSendMessage}
                onUpdateChat={handleUpdateChat}
                isProcessing={isProcessing}
                modelError={modelError}
                onInterrupt={handleInterruptResponse}
                onRetry={handleRetryLastMessage}
                serverLogs={serverLogs}
              />
            </motion.div>
          )}

          {activeTab === "tree" && (
            <motion.div
              key="tree-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="liquid-glass rounded-3xl p-6 border border-white/5 shadow-2xl"
            >
              <AgentTree
                agents={agents}
                onLearnSkill={handleLearnSkill}
                isLoading={isLoadingData}
                onRefresh={fetchAgents}
              />
            </motion.div>
          )}

          {activeTab === "keys" && (
            <motion.div
              key="keys-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="liquid-glass rounded-3xl p-6 border border-white/5 shadow-2xl"
            >
              <ModelKeysManager
                currentUser={currentUser}
                onAddApiKey={handleAddApiKey}
                onDeleteApiKey={handleDeleteApiKey}
                onUpdatePreferences={handleUpdatePreferences}
                isLoading={isLoadingData}
              />
            </motion.div>
          )}

          {activeTab === "tools" && (
            <motion.div
              key="tools-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="liquid-glass rounded-3xl p-6 border border-white/5 shadow-2xl"
            >
              <DevOpsConsole
                users={users}
                logs={logs}
                chats={chats}
              />
            </motion.div>
          )}

          {activeTab === "admin" && currentUser.role === "admin" && (
            <motion.div
              key="admin-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="liquid-glass rounded-3xl p-6 border border-white/5 shadow-2xl"
            >
              <AdminPanel
                users={users}
                chats={chats}
                logs={logs}
                onUpdateQuota={handleUpdateQuota}
                onDeleteUser={handleDeleteUser}
                onResetAgents={handleResetAgents}
                isLoading={isLoadingData}
              />
            </motion.div>
          )}

        </AnimatePresence>
      </main>

    </div>
  );
}
