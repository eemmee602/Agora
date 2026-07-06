import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  MessageSquare, Plus, Trash2, Send, Cpu, Layers, Code, 
  ShieldCheck, Search, Copy, Check, ExternalLink, Globe, 
  Terminal, Sparkles, ChevronDown, User, Bot, AlertCircle,
  X, Menu, Paperclip, Camera, Image as ImageIcon, RefreshCw,
  ArrowDown, Pencil, Download
} from "lucide-react";
import { Chat, Message, MessageStep, User as UserType, safeFormatTime } from "../types";
import CodeExecutor from "./CodeExecutor";

interface ChatInterfaceProps {
  chats: Chat[];
  activeChat: Chat | null;
  currentUser: UserType;
  onSelectChat: (chatId: string) => void;
  onCreateChat: () => void;
  onDeleteChat: (chatId: string) => void;
  onSendMessage: (content: string, attachments?: any[]) => void;
  onUpdateChat?: (chatId: string, updates: Partial<Chat>) => void;
  isProcessing: boolean;
  modelError?: string;
  onInterrupt?: () => void;
  onRetry?: () => void;
}

const AVAILABLE_MODELS = [
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash (Défaut)" },
  { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
  { value: "gemini-1.5-flash-8b", label: "Gemini 1.5 Flash 8B" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro (Haute Qualité)" },
  { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
  { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { value: "gemini-3.1-flash-lite", label: "Gemini 3.1-lite" }
];

const welcomeGlowStyle = {
  background: "radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%)"
};

const RANDOM_GREETINGS = [
  "À vous la parole, {user} !",
  "Bienvenue sur Agora Ai, {user} !",
  "Comment les agents d'Agora peuvent-ils collaborer avec vous aujourd'hui, {user} ?",
  "Réseau d'agents en ligne. Prêt à exécuter vos instructions, {user}.",
  "Explorons le code et le savoir ensemble, {user} !"
];

export default function ChatInterface({
  chats,
  activeChat,
  currentUser,
  onSelectChat,
  onCreateChat,
  onDeleteChat,
  onSendMessage,
  onUpdateChat,
  isProcessing,
  modelError,
  onInterrupt,
  onRetry
}: ChatInterfaceProps) {
  const [inputText, setInputText] = useState("");
  const [copiedFileId, setCopiedFileId] = useState<string | null>(null);
  const [randomGreeting, setRandomGreeting] = useState("");
  const [showSidebarMobile, setShowSidebarMobile] = useState(false);
  
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const [confirmDeleteActive, setConfirmDeleteActive] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const downloadCodeFile = (filename: string, code: string) => {
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || "script.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  const filteredChats = chats.filter(chat => 
    chat.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    chat.messages.some(m => m.content.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  useEffect(() => {
    if (activeChat) {
      setEditedTitle(activeChat.title);
      setIsEditingTitle(false);
      setConfirmDeleteActive(false);
    }
  }, [activeChat?.id, activeChat?.title]);
  
  const [attachedFiles, setAttachedFiles] = useState<Array<{ name: string; type: "file" | "image"; url?: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [animatedMessageIds, setAnimatedMessageIds] = useState<Set<string>>(new Set());
  const [liveOrchestrationLogs, setLiveOrchestrationLogs] = useState<Array<{ text: string; color: string }>>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const isScrolledUp = target.scrollHeight - target.scrollTop - target.clientHeight > 300;
    setShowScrollBottomBtn(isScrolledUp);
  };

  // Initialize and mark existing messages as already animated
  useEffect(() => {
    if (activeChat) {
      const ids = new Set(activeChat.messages.map(m => m.id));
      setAnimatedMessageIds(ids);
    }
  }, [activeChat?.id]);

  // Generate live logs step-by-step during API orchestration waiting phase
  useEffect(() => {
    if (isProcessing) {
      setLiveOrchestrationLogs([
        { text: `[Architecte A∀-01] Analyse sémantique de la requête de ${currentUser.username}...`, color: "text-indigo-400" }
      ]);

      const lastUserMsg = activeChat?.messages && activeChat.messages.length > 0
        ? activeChat.messages[activeChat.messages.length - 1]
        : null;

      const lowerText = lastUserMsg?.content.toLowerCase() || "";
      const hasImage = lastUserMsg?.attachments?.some(a => a.type === "image") ||
                       lowerText.includes("image") ||
                       lowerText.includes("photo") ||
                       lowerText.includes("visuel") ||
                       lowerText.includes("dessin");

      const hasSearch = lowerText.includes("cherche") ||
                        lowerText.includes("recherche") ||
                        lowerText.includes("web") ||
                        lowerText.includes("meteo") ||
                        lowerText.includes("qui est") ||
                        lowerText.includes("actualité") ||
                        lowerText.includes("nouvelle");

      const hasCode = lowerText.includes("code") ||
                      lowerText.includes("écris") ||
                      lowerText.includes("génère") ||
                      lowerText.includes("script") ||
                      lowerText.includes("lua") ||
                      lowerText.includes("python") ||
                      lowerText.includes("html") ||
                      lowerText.includes("css") ||
                      lowerText.includes("js") ||
                      lowerText.includes("programme");

      let logSteps = [
        { text: `[Architecte A∀-01] Traitement du contexte conversationnel direct...`, color: "text-indigo-400", delay: 1100 },
        { text: `[Architecte A∀-01] Analyse de la mémoire d'Emerick pour adapter le ton...`, color: "text-purple-400", delay: 2400 },
        { text: `[Architecte A∀-01] Formulation de la réponse finale en cours...`, color: "text-emerald-400", delay: 3800 }
      ];

      if (hasImage) {
        logSteps = [
          { text: `[Vision A∀-05] Capture de flux visuel et décompression sémantique...`, color: "text-indigo-400", delay: 1100 },
          { text: `[Vision A∀-05] Analyse multi-modale en cours : Évaluation de la résolution et filtrage des contrastes...`, color: "text-cyan-400", delay: 2200 },
          { text: `[Vision A∀-05] Exécution OCR et repérage d'objets dans la scène visuelle...`, color: "text-emerald-400", delay: 3300 },
          { text: `[Architecte A∀-01] Synthèse sémantique de l'image et préparation de la description textuelle...`, color: "text-purple-400", delay: 4500 }
        ];
      } else if (hasSearch) {
        logSteps = [
          { text: `[Chercheur A∀-04] Connexion au protocole MCP et services de recherche...`, color: "text-cyan-400", delay: 1100 },
          { text: `[Chercheur A∀-04] Interrogation des moteurs d'indexation web...`, color: "text-cyan-400", delay: 2200 },
          { text: `[Chercheur A∀-04] Extraction et évaluation de la pertinence des articles trouvés...`, color: "text-emerald-400", delay: 3300 },
          { text: `[Architecte A∀-01] Compilation des résultats de recherche pour la synthèse...`, color: "text-indigo-400", delay: 4500 }
        ];
      } else if (hasCode) {
        logSteps = [
          { text: `[Architecte A∀-01] Attribution : Routage sémantique vers l'agent Codeur A∀-02...`, color: "text-indigo-400", delay: 1100 },
          { text: `[Codeur A∀-02] Synthèse contextuelle et élaboration de la structure algorithmique...`, color: "text-emerald-400", delay: 2200 },
          { text: `[Codeur A∀-02] Génération du script et formatage de la syntaxe...`, color: "text-emerald-400", delay: 3300 },
          { text: `[Sécurité A∀-03] Validation des règles logiques et confinement en sandbox...`, color: "text-pink-400", delay: 4500 }
        ];
      }

      const timers = logSteps.map(step => {
        return setTimeout(() => {
          setLiveOrchestrationLogs(prev => [...prev, { text: step.text, color: step.color }]);
        }, step.delay);
      });

      return () => {
        timers.forEach(clearTimeout);
      };
    } else {
      setLiveOrchestrationLogs([]);
    }
  }, [isProcessing, currentUser, activeChat?.messages]);

  // Smart Auto Scroll handler
  const prevIsProcessing = useRef(isProcessing);
  useEffect(() => {
    if (prevIsProcessing.current && !isProcessing) {
      // Transitioned from processing to finished: scroll to the top of the newly added agent message
      const agentMessages = activeChat?.messages.filter(m => m.senderRole === "agent") || [];
      if (agentMessages.length > 0) {
        const lastAgentMsg = agentMessages[agentMessages.length - 1];
        setTimeout(() => {
          const element = document.getElementById(`msg-container-${lastAgentMsg.id}`);
          if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "start" });
          } else {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
          }
        }, 120);
      }
    } else {
      // While typing, processing, or shifting chats, scroll to the bottom
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevIsProcessing.current = isProcessing;
  }, [activeChat?.messages, isProcessing]);

  // Set random greeting on mount/user change
  useEffect(() => {
    if (currentUser) {
      const idx = Math.floor(Math.random() * RANDOM_GREETINGS.length);
      setRandomGreeting(RANDOM_GREETINGS[idx].replace("{user}", currentUser.username));
    }
  }, [currentUser, activeChat?.id]);

  // Auto-resize textarea height
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
    }
  }, [inputText]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: "file" | "image") => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files) as File[];
    
    files.forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        let url: string | undefined = undefined;
        if (type === "image") {
          url = URL.createObjectURL(file);
        }
        
        setAttachedFiles(prev => [
          ...prev,
          {
            name: file.name,
            type,
            url,
            base64
          }
        ]);
      };
      reader.readAsDataURL(file);
    });
    
    e.target.value = "";
  };

  const removeAttachment = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanText = inputText.trim();
    if (!cleanText && attachedFiles.length === 0) return;
    if (isProcessing) return;

    let finalPayloadText = cleanText;
    if (attachedFiles.length > 0) {
      const attachmentList = attachedFiles.map(f => `📎 [Pièce Jointe (${f.type === "image" ? "Image" : "Fichier"}): ${f.name}]`).join("\n");
      finalPayloadText = cleanText ? `${cleanText}\n\n${attachmentList}` : attachmentList;
    }

    onSendMessage(finalPayloadText, attachedFiles);
    setInputText("");
    setAttachedFiles([]);
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "48px";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter without Shift key (only if we have content or attachments)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleSelectChatLocal = (chatId: string) => {
    onSelectChat(chatId);
    setShowSidebarMobile(false);
  };

  const handleCreateChatLocal = () => {
    onCreateChat();
    setShowSidebarMobile(false);
  };

  const copyToClipboard = (text: string, fileId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedFileId(fileId);
    setTimeout(() => setCopiedFileId(null), 2000);
  };

  const getAgentStepIcon = (agentId: string) => {
    switch (agentId) {
      case "agent-architect": return <Layers className="w-4.5 h-4.5 text-indigo-400" />;
      case "agent-coder": return <Code className="w-4.5 h-4.5 text-emerald-400" />;
      case "agent-security": return <ShieldCheck className="w-4.5 h-4.5 text-pink-400" />;
      case "agent-searcher": return <Search className="w-4.5 h-4.5 text-cyan-400" />;
      default: return <Cpu className="w-4.5 h-4.5 text-gray-400" />;
    }
  };

  return (
    <div className="w-full flex-1 min-h-0 flex flex-col md:grid md:grid-cols-12 gap-4 md:gap-6 h-full relative overflow-x-hidden" id="chat-workspace">
      
      {/* Backdrop overlay for mobile */}
      <AnimatePresence>
        {showSidebarMobile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowSidebarMobile(false)}
            className="fixed inset-0 bg-black/75 z-40 md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar - list of conversations */}
      <div className={`${
        showSidebarMobile 
          ? "fixed inset-y-0 left-0 w-[280px] z-50 bg-[#070b13] border-r border-white/10 flex animate-in slide-in-from-left duration-200" 
          : "hidden"
      } md:flex md:relative md:col-span-4 lg:col-span-3 min-w-0 liquid-glass rounded-2xl p-4 flex-col justify-between overflow-hidden h-full`}>
        <div className="flex flex-col space-y-4 overflow-hidden h-full">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={handleCreateChatLocal}
              className="flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer transition-all shadow-md shadow-indigo-600/10 hover:shadow-indigo-600/20"
            >
              <Plus className="w-4 h-4" />
              <span>Nouveau Chat</span>
            </button>

            {/* Mobile Close Button */}
            <button
              onClick={() => setShowSidebarMobile(false)}
              className="md:hidden p-3 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-all cursor-pointer flex items-center justify-center shrink-0"
              title="Fermer le menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="relative mt-2">
            <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Rechercher un chat..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-8 py-1.5 text-xs text-white placeholder-gray-500 outline-none focus:border-indigo-500/50 focus:bg-white/10 transition-all font-medium"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-2.5 text-gray-400 hover:text-white transition-all cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between border-b border-white/5 pb-2 mt-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Historique de chat</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-300 font-mono">
              {searchTerm ? filteredChats.length : chats.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {filteredChats.length > 0 ? (
              filteredChats.map((chat) => {
                const isSelected = activeChat?.id === chat.id;
                return (
                  <div
                    key={chat.id}
                    className={`group relative flex items-center justify-between p-3 rounded-xl transition-all border ${
                      isSelected ? "bg-indigo-950/40 border-indigo-500/40" : "bg-white/2 border-transparent hover:bg-white/5"
                    }`}
                  >
                    <button
                      onClick={() => handleSelectChatLocal(chat.id)}
                      className="flex-1 text-left flex items-start space-x-2.5 overflow-hidden cursor-pointer"
                    >
                      <MessageSquare className={`w-4 h-4 mt-0.5 shrink-0 ${isSelected ? "text-indigo-400" : "text-gray-400"}`} />
                      <div className="overflow-hidden">
                        <span className="text-xs font-medium text-white block truncate">{chat.title}</span>
                        <span className="text-[10px] text-gray-400 block truncate mt-0.5">
                          {chat.messages.length > 0 ? chat.messages[chat.messages.length - 1].content : "Aucun message"}
                        </span>
                      </div>
                    </button>
                    
                    {/* Delete Button with confirmation */}
                    {deletingChatId === chat.id ? (
                      <div className="flex items-center space-x-1 shrink-0 bg-pink-950/40 border border-pink-500/20 rounded-lg p-0.5 animate-in fade-in zoom-in-95 duration-150 relative z-10">
                        <span className="text-[9px] text-pink-400 font-semibold px-1 select-none">Supprimer ?</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteChat(chat.id);
                            setDeletingChatId(null);
                          }}
                          className="p-1 rounded bg-pink-600/30 hover:bg-pink-600 hover:text-white text-pink-200 transition-all cursor-pointer flex items-center justify-center shrink-0"
                          title="Confirmer la suppression"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingChatId(null);
                          }}
                          className="p-1 rounded bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all cursor-pointer flex items-center justify-center shrink-0"
                          title="Annuler"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingChatId(chat.id);
                        }}
                        className="p-1 rounded text-gray-400 hover:text-pink-400 hover:bg-pink-500/10 transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                        title="Supprimer chat"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-center py-8 text-gray-500 text-xs italic">
                Aucune conversation trouvée
              </div>
            )}
          </div>
        </div>

        {/* Small branding footnote */}
        <div className="border-t border-white/5 pt-3 mt-4 text-center shrink-0">
          <span className="text-[10px] font-mono text-gray-500">Agora AI v1.0.4 • Liquid Glass UI</span>
        </div>
      </div>

      {/* Main chat window */}
      <div className="md:col-span-8 lg:col-span-9 min-w-0 flex flex-col justify-between liquid-glass rounded-2xl overflow-hidden relative border border-white/5 h-full min-h-0">
        
        {/* Model error notice */}
        {modelError && (
          <div className="bg-pink-950/40 border-b border-pink-500/20 px-5 py-2.5 flex items-center justify-between text-pink-400 text-xs animate-in fade-in slide-in-from-top duration-200">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{modelError}</span>
            </div>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="shrink-0 px-2.5 py-1 rounded-lg bg-pink-500/20 border border-pink-500/45 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-pink-500/35 transition-all flex items-center space-x-1 cursor-pointer shadow-sm"
              >
                <RefreshCw className="w-3 h-3 text-pink-300" />
                <span>Réessayer</span>
              </button>
            )}
          </div>
        )}

        {/* Top Header */}
        <div className="px-4 py-3 md:px-6 md:py-4 border-b border-white/5 flex items-center justify-between z-10 bg-black/20 shrink-0">
          <div className="flex items-center space-x-3 min-w-0">
            {/* Mobile Sidebar Toggle */}
            <button
              onClick={() => setShowSidebarMobile(true)}
              className="md:hidden p-2 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-all cursor-pointer flex items-center justify-center shrink-0"
              title="Historique des conversations"
            >
              <Menu className="w-4 h-4" />
            </button>

            <div className="min-w-0 flex flex-col justify-center">
              {activeChat ? (
                isEditingTitle ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (editedTitle.trim() && onUpdateChat) {
                        onUpdateChat(activeChat.id, { title: editedTitle.trim() });
                      }
                      setIsEditingTitle(false);
                    }}
                    className="flex items-center space-x-1.5 min-w-0"
                  >
                    <input
                      type="text"
                      value={editedTitle}
                      onChange={(e) => setEditedTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setEditedTitle(activeChat.title);
                          setIsEditingTitle(false);
                        }
                      }}
                      className="bg-white/5 border border-white/20 text-white text-xs md:text-sm rounded-lg px-2.5 py-1 outline-none focus:border-indigo-500/70 font-medium w-36 xs:w-48 sm:w-64"
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={!editedTitle.trim()}
                      className="p-1 rounded-lg bg-indigo-600/30 border border-indigo-500/50 hover:bg-indigo-600/50 text-indigo-200 transition-all cursor-pointer flex items-center justify-center shrink-0"
                      title="Enregistrer"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditedTitle(activeChat.title);
                        setIsEditingTitle(false);
                      }}
                      className="p-1 rounded-lg bg-white/5 border border-white/10 hover:bg-white/15 text-gray-400 hover:text-white transition-all cursor-pointer flex items-center justify-center shrink-0"
                      title="Annuler"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center space-x-2 group min-w-0">
                    <h3 className="font-display font-medium text-white text-xs md:text-sm truncate">
                      {activeChat.title}
                    </h3>
                    <button
                      onClick={() => setIsEditingTitle(true)}
                      className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/5 transition-all opacity-100 md:opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer shrink-0"
                      title="Renommer la conversation"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  </div>
                )
              ) : (
                <h3 className="font-display font-medium text-white text-sm truncate">
                  Workspace d'agents
                </h3>
              )}
              {activeChat && (
                <div className="flex items-center space-x-1.5 mt-0.5 text-[10px] text-gray-400">
                  <span>Modèle : </span>
                  <select
                    value={activeChat.activeModel || "gemini-2.5-flash"}
                    onChange={(e) => {
                      if (onUpdateChat) {
                        onUpdateChat(activeChat.id, { activeModel: e.target.value });
                      }
                    }}
                    className="bg-[#0a0a0f] border border-white/10 hover:border-white/20 text-indigo-300 font-semibold rounded px-1.5 py-0.5 outline-none focus:border-indigo-500/70 hover:text-indigo-200 transition-all cursor-pointer text-[10px]"
                  >
                    {AVAILABLE_MODELS.map((m) => (
                      <option key={m.value} value={m.value} className="bg-slate-950 text-gray-300">
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Header Actions (Right side) */}
          <div className="flex items-center space-x-3 shrink-0">
            {activeChat && (
              confirmDeleteActive ? (
                <div className="flex items-center space-x-1 bg-pink-950/40 border border-pink-500/20 rounded-xl p-1 animate-in fade-in zoom-in-95 duration-150">
                  <span className="text-[10px] text-pink-400 font-medium px-1.5 hidden sm:inline select-none">Supprimer ce chat ?</span>
                  <button
                    onClick={() => {
                      if (onDeleteChat) {
                        onDeleteChat(activeChat.id);
                      }
                      setConfirmDeleteActive(false);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-pink-600/30 hover:bg-pink-600 hover:text-white text-pink-200 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center space-x-1"
                    title="Confirmer la suppression"
                  >
                    <Check className="w-3 h-3" />
                    <span>Oui</span>
                  </button>
                  <button
                    onClick={() => setConfirmDeleteActive(false)}
                    className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all cursor-pointer flex items-center justify-center"
                    title="Annuler"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDeleteActive(true)}
                  className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-pink-400 hover:bg-pink-500/10 transition-all cursor-pointer flex items-center justify-center shrink-0"
                  title="Supprimer la conversation"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )
            )}

            {isProcessing && (
              <div className="flex items-center space-x-2 shrink-0">
                <span className="text-xs text-indigo-400 font-medium hidden xs:inline">Orchestration en cours...</span>
                <div className="relative flex items-center justify-center">
                  {/* Spin the colored logo (A∀) */}
                  <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-[10px] font-bold text-white logo-spinning shadow-[0_0_15px_rgba(99,102,241,0.4)]">
                    A∀
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Messages list or Empty state welcome */}
        <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto overflow-x-hidden p-3 xs:p-4 md:p-6 space-y-6 relative">
          
          {activeChat && activeChat.messages.length > 1 ? (
            <div className="space-y-6">
              {activeChat.messages.filter(m => m.senderRole !== "system").map((msg) => {
                const isUser = msg.senderRole === "user";
                return (
                  <motion.div
                    key={msg.id}
                    id={`msg-container-${msg.id}`}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex space-x-2.5 sm:space-x-4 w-full ${
                      isUser 
                        ? "ml-auto flex-row-reverse space-x-reverse max-w-[92%] sm:max-w-[80%]" 
                        : "mr-auto w-full max-w-full"
                    }`}
                  >
                    {/* Avatar - hidden on mobile for maximum space, visible on desktop for premium look */}
                    <div className={`hidden sm:flex w-8 h-8 rounded-lg items-center justify-center border shrink-0 ${
                      isUser ? "bg-white/5 border-white/10 text-gray-300" : "bg-indigo-600/10 border-indigo-500/20 text-indigo-400"
                    }`}>
                      {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>

                    {/* Message Card */}
                    <div className={`flex flex-col space-y-1 min-w-0 ${isUser ? "max-w-full" : "flex-1 w-full"}`}>
                      
                      {/* Sender metadata bar */}
                      <div className={`flex items-center space-x-2 text-[10px] select-none pb-0.5 px-1 ${isUser ? "justify-end flex-row-reverse space-x-reverse" : "justify-start"}`}>
                        <span className={`font-bold tracking-wide uppercase ${isUser ? "text-indigo-400" : "text-indigo-300"}`}>
                          {isUser ? "Vous" : "Agora AI"}
                        </span>
                        {!isUser && msg.generationTimeMs !== undefined && (
                          <span className="text-[9px] text-indigo-400/80 font-mono flex items-center space-x-1 shrink-0 bg-indigo-500/5 px-1.5 py-0.5 rounded-full border border-indigo-500/10">
                            <span>pensé en {(msg.generationTimeMs / 1000).toFixed(1)}s</span>
                            {msg.actualModelUsed && (
                              <>
                                <span className="text-gray-600">•</span>
                                <span className="text-gray-400">{msg.actualModelUsed}</span>
                              </>
                            )}
                          </span>
                        )}
                        <span className="text-[9px] text-gray-500 font-mono">
                          {safeFormatTime(msg.timestamp || Date.now(), { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>

                      <div className={`px-4 py-3 rounded-2xl border text-sm leading-relaxed break-words overflow-x-auto w-full ${
                        isUser ? "bg-indigo-600/15 border-indigo-500/20 text-white rounded-tr-none" : "bg-black/30 border-white/5 text-gray-200 rounded-tl-none"
                      }`}>
                        {isUser ? (
                          <div className="space-y-2">{parseMarkdown(msg.content)}</div>
                        ) : (
                          <AgentMessageContent text={msg.content} msgId={msg.id} />
                        )}

                        {/* Search links / grounding references */}
                        {msg.sources && msg.sources.length > 0 && (
                          <div className="mt-4 pt-3 border-t border-white/5">
                            <span className="text-[10px] font-semibold text-gray-400 flex items-center space-x-1 mb-1.5">
                              <Globe className="w-3 h-3 text-cyan-400" />
                              <span>Sources web extraites :</span>
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {msg.sources.map((src, i) => (
                                <a
                                  key={i}
                                  href={src.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] px-2 py-1 rounded bg-cyan-950/20 hover:bg-cyan-950/40 text-cyan-400 border border-cyan-500/15 flex items-center space-x-1 transition-all"
                                >
                                  <span>{src.title}</span>
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Display steps of the multi-agent pipeline */}
                      {msg.steps && msg.steps.length > 0 && (
                        <div className="pl-2 border-l-2 border-indigo-500/25 space-y-3 mt-1">
                          <span className="text-[10px] font-mono text-gray-500 tracking-wider uppercase">Pipeline d'exécution des agents :</span>
                          
                          {msg.steps.map((step) => (
                            <div key={step.id} className="p-2.5 rounded-xl bg-white/2 border border-white/5 space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  {getAgentStepIcon(step.agentId)}
                                  <span className="text-xs font-semibold text-white">{step.agentName}</span>
                                </div>
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center space-x-1">
                                  <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                                  <span>terminé</span>
                                </span>
                              </div>
                              
                              <p className="text-[11px] text-gray-400 leading-normal">{step.action}</p>
                              {step.details && <p className="text-[11px] text-gray-300 leading-normal pl-2 border-l border-white/10 italic">{step.details}</p>}

                              {/* Special Code Generator Block with Copy and Download Buttons */}
                              {step.codeBlock && (
                                <div className="rounded-lg bg-black border border-white/10 overflow-hidden font-mono text-xs mt-2 shadow-inner">
                                  <div className="px-3.5 py-2 bg-white/5 border-b border-white/10 flex items-center justify-between text-[11px] text-gray-400">
                                    <span>{step.codeBlock.fileName} ({step.codeBlock.language})</span>
                                    <div className="flex items-center space-x-3">
                                      <button
                                        onClick={() => downloadCodeFile(step.codeBlock!.fileName, step.codeBlock!.code)}
                                        className="flex items-center space-x-1.5 text-gray-400 hover:text-white transition-all cursor-pointer"
                                        title="Télécharger le fichier"
                                      >
                                        <Download className="w-3.5 h-3.5" />
                                        <span className="text-[10px]">Télécharger</span>
                                      </button>
                                      <button
                                        onClick={() => copyToClipboard(step.codeBlock!.code, step.id)}
                                        className="flex items-center space-x-1 text-gray-400 hover:text-white transition-all cursor-pointer"
                                      >
                                        {copiedFileId === step.id ? (
                                          <>
                                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                                            <span className="text-[10px] text-emerald-400">Copié !</span>
                                          </>
                                        ) : (
                                          <>
                                            <Copy className="w-3.5 h-3.5" />
                                            <span className="text-[10px]">Copier</span>
                                          </>
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                  <pre className="p-3.5 text-gray-300 overflow-x-auto text-[11px] leading-relaxed max-h-56">
                                    <code>{step.codeBlock.code}</code>
                                  </pre>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}

              {/* Active Orchestration Live Log Console Terminal */}
              {isProcessing && liveOrchestrationLogs.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex space-x-2.5 sm:space-x-4 w-full mr-auto"
                >
                  {/* Avatar - hidden on mobile for maximum terminal width */}
                  <div className="hidden sm:flex w-8 h-8 rounded-lg items-center justify-center border shrink-0 bg-indigo-600/10 border-indigo-500/20 text-indigo-400">
                    <Bot className="w-4 h-4 animate-pulse" />
                  </div>

                  {/* Terminal Log Console */}
                  <div className="flex flex-col space-y-2 min-w-0 flex-1 w-full">
                    <div className="px-4 py-3.5 rounded-2xl border bg-black/60 border-indigo-500/30 text-xs text-gray-200 rounded-tl-none space-y-3 shadow-[0_0_20px_rgba(99,102,241,0.1)] w-full">
                      
                      {/* Terminal header bar */}
                      <div className="flex items-center justify-between border-b border-white/5 pb-2 select-none">
                        <div className="flex items-center space-x-2">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                          </span>
                          <span className="font-mono text-[10px] uppercase tracking-wider text-indigo-300 font-bold">Orchestrateur Agora A∀-01</span>
                        </div>
                        <span className="text-[9px] font-mono text-gray-500">Actif (Gateway MCP)</span>
                      </div>

                      {/* Log output rows */}
                      <div className="font-mono text-[10px] space-y-1.5 text-gray-400 select-none">
                        {liveOrchestrationLogs.map((log, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -5 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex items-start space-x-1.5"
                          >
                            <span className="text-gray-600 font-semibold shrink-0">❯</span>
                            <span className={log.color}>{log.text}</span>
                          </motion.div>
                        ))}
                        
                        <div className="flex items-center space-x-1.5 text-indigo-400 animate-pulse text-[10px] pt-1">
                          <span className="w-1.5 h-3 bg-indigo-400 inline-block animate-pulse shrink-0" />
                          <span className="italic">Génération du flux final de l'orchestrateur...</span>
                        </div>
                      </div>

                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          ) : (
            /* Starting a chat Welcome screen */
            <div className="absolute inset-0 flex flex-col justify-start md:justify-center items-center p-4 md:p-6 text-center z-0 overflow-y-auto overflow-x-hidden custom-scrollbar">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full blur-3xl opacity-20 pointer-events-none" style={welcomeGlowStyle} />
              
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="liquid-glass p-6 md:p-8 rounded-2xl max-w-lg shadow-2xl relative z-10 my-auto"
              >
                <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-2xl font-bold text-white shadow-[0_0_30px_rgba(99,102,241,0.3)] mb-5 mx-auto">
                  A∀
                </div>

                <h2 className="text-xl md:text-2xl font-display font-medium text-white tracking-tight mb-2">
                  {randomGreeting}
                </h2>
                <p className="text-xs text-gray-300 leading-relaxed mb-6">
                  Saisissez un message ci-dessous. Les agents d'Agora Ai vont concevoir, programmer et auditer votre code ou effectuer des recherches sur le web pour vous.
                </p>

                {/* Example pills */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
                  <button
                    onClick={() => setInputText("Écris un script lua pour étendre mes compétences")}
                    className="p-2.5 rounded-lg bg-white/5 border border-white/5 hover:border-indigo-500/30 text-[10px] text-gray-400 hover:text-white transition-all text-left cursor-pointer truncate"
                  >
                    🤖 Écris un script lua
                  </button>
                  <button
                    onClick={() => setInputText("Cherche sur le web les dernières techniques d'orchestration d'agents")}
                    className="p-2.5 rounded-lg bg-white/5 border border-white/5 hover:border-indigo-500/30 text-[10px] text-gray-400 hover:text-white transition-all text-left cursor-pointer truncate"
                  >
                    🌐 Cherche les techniques d'agents
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Floating Scroll to Bottom Button */}
        <AnimatePresence>
          {showScrollBottomBtn && (
            <motion.button
              type="button"
              initial={{ opacity: 0, scale: 0.8, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 10 }}
              onClick={() => {
                messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
              }}
              className="absolute bottom-28 right-6 z-30 p-2.5 rounded-full bg-indigo-600/90 hover:bg-indigo-500 text-white shadow-xl border border-indigo-400/30 backdrop-blur-md transition-all cursor-pointer hover:scale-110 flex items-center justify-center group"
              title="Retourner en bas"
            >
              <ArrowDown className="w-5 h-5 group-hover:translate-y-0.5 transition-transform" />
            </motion.button>
          )}
        </AnimatePresence>

        {/* Dynamic expanding bottom input form with glassmorphism and attachments */}
        <div className="px-4 py-3 md:px-6 md:py-4 border-t border-white/10 bg-[#070b13]/65 backdrop-blur-md z-10 shrink-0">
          
          {/* File input helpers */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => handleFileChange(e, "file")}
          />
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFileChange(e, "image")}
          />

          {/* Attachments preview tray */}
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 p-2 bg-white/5 border border-white/10 rounded-xl mb-3 animate-in fade-in slide-in-from-bottom-1 duration-150">
              {attachedFiles.map((file, index) => (
                <div key={index} className="flex items-center space-x-2 bg-indigo-950/45 border border-indigo-500/20 rounded-lg p-1.5 text-xs text-white">
                  {file.type === "image" && file.url ? (
                    <img src={file.url} alt="attached" className="w-8 h-8 rounded object-cover border border-white/10" referrerPolicy="no-referrer" />
                  ) : (
                    <Paperclip className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  )}
                  <span className="truncate max-w-[120px] font-mono text-[10px] text-gray-200">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(index)}
                    className="p-1 rounded-full text-gray-400 hover:text-pink-400 hover:bg-pink-500/10 cursor-pointer transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex items-end space-x-3">
            <div className="flex-1 relative rounded-xl border border-white/10 bg-black/80 shadow-inner overflow-hidden flex flex-col md:flex-row md:items-center">
              
              {/* Accessory buttons inside text box */}
              <div className="flex items-center space-x-1 p-2 border-b md:border-b-0 md:border-r border-white/5 bg-black/40">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 rounded-lg text-gray-400 hover:text-indigo-400 hover:bg-white/5 transition-all cursor-pointer"
                  title="Attacher un fichier"
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="p-2 rounded-lg text-gray-400 hover:text-indigo-400 hover:bg-white/5 transition-all cursor-pointer"
                  title="Uploader une image"
                >
                  <ImageIcon className="w-4 h-4" />
                </button>
              </div>

              <textarea
                ref={textareaRef}
                rows={1}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Discutez avec les agents Agora AI..."
                className="w-full text-base md:text-sm px-4 py-3 bg-black/60 border-0 text-white placeholder-gray-500 focus:outline-none focus:ring-0 expanding-textarea"
                disabled={isProcessing}
              />
            </div>

            {isProcessing ? (
              <button
                type="button"
                onClick={onInterrupt}
                className="p-3.5 rounded-xl bg-pink-500/20 border border-pink-500/50 hover:bg-pink-500/35 text-white shadow-lg shadow-pink-500/10 transition-all flex items-center justify-center shrink-0 cursor-pointer"
                title="Interrompre la génération"
              >
                <div className="flex items-center justify-center relative">
                  {/* Outer spinning cube container */}
                  <div className="w-4.5 h-4.5 bg-gradient-to-tr from-pink-500 via-purple-500 to-indigo-500 rounded shadow-[0_0_12px_rgba(236,72,153,0.3)] cube-3d-spinning flex items-center justify-center">
                    {/* Inner stop sign inside the cube */}
                    <div className="w-1.5 h-1.5 bg-white rounded-sm" />
                  </div>
                </div>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!inputText.trim() && attachedFiles.length === 0}
                className="p-3.5 rounded-xl bg-indigo-600/25 border border-indigo-500/40 hover:bg-indigo-600/40 text-white disabled:opacity-20 disabled:pointer-events-none shadow-lg shadow-indigo-600/5 transition-all flex items-center justify-center shrink-0 cursor-pointer"
                title="Envoyer le message"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </form>
          <div className="flex flex-col sm:flex-row sm:justify-between gap-1 text-[9px] md:text-[10px] text-gray-500 mt-2">
            <span>Quota restant : {currentUser.quotaLimit - currentUser.quotaUsed} requêtes</span>
            <span>Utilisez Shift + Entrée pour un saut de ligne</span>
          </div>
        </div>

      </div>
    </div>
  );

  // Sub-component defined inline to have access to animatedMessageIds and its setter
  function AgentMessageContent({ text, msgId }: { text: string; msgId: string }) {
    const isAlreadyAnimated = animatedMessageIds.has(msgId);
    const parsedBlocks = parseMarkdown(text);
    const [visibleCount, setVisibleCount] = useState(isAlreadyAnimated ? parsedBlocks.length : 0);

    useEffect(() => {
      if (isAlreadyAnimated) {
        setVisibleCount(parsedBlocks.length);
        return;
      }

      setVisibleCount(0);
      let index = 0;
      const interval = setInterval(() => {
        index += 1;
        if (index >= parsedBlocks.length) {
          clearInterval(interval);
          setAnimatedMessageIds(prev => {
            const next = new Set(prev);
            next.add(msgId);
            return next;
          });
        }
        setVisibleCount(index);
      }, 220); // Revealing each paragraph/line fluidly every 220ms

      return () => clearInterval(interval);
    }, [text, msgId, isAlreadyAnimated, parsedBlocks.length]);

    return (
      <div className="space-y-3">
        {parsedBlocks.slice(0, visibleCount).map((block, idx) => (
          <motion.div
            key={idx}
            initial={isAlreadyAnimated ? { opacity: 1, y: 0 } : { opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
            {block}
          </motion.div>
        ))}
      </div>
    );
  }
}

// Global Parser Utilities for Markdown styles, code blocks, highlights, lists and bold formatting
function parseInlineFormatting(text: string): React.ReactNode[] {
  let tokens: { type: "text" | "bold" | "highlight" | "code" | "italic", content: string }[] = [{ type: "text", content: text }];

  // Parse inline code: `code`
  tokens = tokens.flatMap(t => {
    if (t.type !== "text") return t;
    const parts = t.content.split(/(`[^`\n]+`)/g);
    return parts.map(p => {
      if (p.startsWith("`") && p.endsWith("`")) {
        return { type: "code", content: p.slice(1, -1) };
      }
      return { type: "text", content: p };
    });
  });

  // Parse highlights: ==text==
  tokens = tokens.flatMap(t => {
    if (t.type !== "text") return t;
    const parts = t.content.split(/(==[^=\n]+==)/g);
    return parts.map(p => {
      if (p.startsWith("==") && p.endsWith("==")) {
        return { type: "highlight", content: p.slice(2, -2) };
      }
      return { type: "text", content: p };
    });
  });

  // Parse bold: **text**
  tokens = tokens.flatMap(t => {
    if (t.type !== "text") return t;
    const parts = t.content.split(/(\*\*[^*]+?\*\*)/g);
    return parts.map(p => {
      if (p.startsWith("**") && p.endsWith("**")) {
        return { type: "bold", content: p.slice(2, -2) };
      }
      return { type: "text", content: p };
    });
  });

  // Parse italic: *text*
  tokens = tokens.flatMap(t => {
    if (t.type !== "text") return t;
    const parts = t.content.split(/(\*[^*]+?\*)/g);
    return parts.map(p => {
      if (p.startsWith("*") && p.endsWith("*")) {
        return { type: "italic", content: p.slice(1, -1) };
      }
      return { type: "text", content: p };
    });
  });

  return tokens.map((token, idx) => {
    switch (token.type) {
      case "bold":
        return <strong key={idx} className="font-bold text-white tracking-tight">{token.content}</strong>;
      case "highlight":
        return (
          <span key={idx} className="bg-indigo-500/25 text-indigo-200 px-1.5 py-0.5 rounded border border-indigo-500/20 font-medium select-all">
            {token.content}
          </span>
        );
      case "code":
        return (
          <code key={idx} className="bg-black/40 border border-white/5 px-1.5 py-0.5 rounded font-mono text-xs text-indigo-300">
            {token.content}
          </code>
        );
      case "italic":
        return <em key={idx} className="italic text-gray-300">{token.content}</em>;
      default:
        return <span key={idx}>{token.content}</span>;
    }
  });
}

function parseMarkdown(text: string): React.ReactNode[] {
  if (!text) return [];

  const parts = text.split(/(```[\s\S]*?```)/g);

  return parts.map((part, index) => {
    if (part.startsWith("```") && part.endsWith("```")) {
      const match = part.match(/```(\w*)\n([\s\S]*?)```/);
      const language = match ? match[1] : "code";
      const code = match ? match[2] : part.slice(3, -3);

      return (
        <CodeExecutor key={index} code={code} language={language} />
      );
    }

    return (
      <div key={index} className="space-y-2">
        {part.split("\n").map((line, lIdx) => {
          // Bullet point check
          if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
            return (
              <div key={lIdx} className="flex items-start space-x-2 pl-2 my-1">
                <span className="text-indigo-400 mt-2 shrink-0 w-1.5 h-1.5 rounded-full bg-indigo-500" />
                <span className="text-sm leading-relaxed">{parseInlineFormatting(line.trim().substring(2))}</span>
              </div>
            );
          }
          // Numbered list check
          const numMatch = line.trim().match(/^(\d+)\.\s(.*)/);
          if (numMatch) {
            return (
              <div key={lIdx} className="flex items-start space-x-2 pl-2 my-1">
                <span className="text-indigo-400 font-mono text-xs shrink-0 font-bold">{numMatch[1]}.</span>
                <span className="text-sm leading-relaxed">{parseInlineFormatting(numMatch[2])}</span>
              </div>
            );
          }
          // Standard line
          return (
            <p key={lIdx} className="min-h-[1.25rem] leading-relaxed">
              {parseInlineFormatting(line)}
            </p>
          );
        })}
      </div>
    );
  });
}
