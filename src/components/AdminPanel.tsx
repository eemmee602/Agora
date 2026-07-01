import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Users, Shield, History, Key, Trash2, Edit3, Settings, AlertTriangle, Terminal, RefreshCw, Eye, MessageSquare, Clock } from "lucide-react";
import { User, Chat, SystemLog, safeFormatTime, safeFormatDate } from "../types";

interface AdminPanelProps {
  users: User[];
  chats: Chat[];
  logs: SystemLog[];
  onUpdateQuota: (userId: string, newQuota: number) => void;
  onDeleteUser: (userId: string) => void;
  onResetAgents: () => void;
  isLoading: boolean;
}

type AdminSubTab = "members" | "chats" | "logs";

export default function AdminPanel({
  users,
  chats,
  logs,
  onUpdateQuota,
  onDeleteUser,
  onResetAgents,
  isLoading
}: AdminPanelProps) {
  const [activeSubTab, setActiveSubTab] = useState<AdminSubTab>("members");
  
  // Quota editing state
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingQuotaValue, setEditingQuotaValue] = useState<number>(0);

  // Chat auditing state
  const [selectedAuditChat, setSelectedAuditChat] = useState<Chat | null>(null);

  // Initialize selected chat audit if available
  useEffect(() => {
    if (chats.length > 0 && !selectedAuditChat) {
      setSelectedAuditChat(chats[0]);
    }
  }, [chats]);

  const handleStartEditQuota = (user: User) => {
    setEditingUserId(user.id);
    setEditingQuotaValue(user.quotaLimit);
  };

  const handleSaveQuota = (userId: string) => {
    onUpdateQuota(userId, editingQuotaValue);
    setEditingUserId(null);
  };

  return (
    <div className="flex flex-col space-y-6" id="admin-panel-module">
      {/* Header and Subtabs navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-medium text-white tracking-tight flex items-center space-x-2">
            <Shield className="w-6 h-6 text-indigo-400" />
            <span>Console d'Administration Globale</span>
          </h2>
          <p className="text-xs text-gray-400">Gérez les membres, auditez l'historique et surveillez la sécurité du réseau.</p>
        </div>

        {/* Subtabs selector - Liquid Glass styling */}
        <div className="flex p-1 rounded-xl bg-white/5 border border-white/10 self-start backdrop-blur-md">
          <button
            onClick={() => setActiveSubTab("members")}
            className={`px-4 py-2 rounded-lg text-xs font-medium tracking-wide transition-all cursor-pointer flex items-center space-x-2 ${
              activeSubTab === "members" ? "bg-indigo-600/35 border border-indigo-500/50 text-white shadow-md shadow-indigo-600/15 backdrop-blur-sm" : "text-gray-400 hover:text-white"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Membres & Quotas</span>
          </button>
          <button
            onClick={() => setActiveSubTab("chats")}
            className={`px-4 py-2 rounded-lg text-xs font-medium tracking-wide transition-all cursor-pointer flex items-center space-x-2 ${
              activeSubTab === "chats" ? "bg-indigo-600/35 border border-indigo-500/50 text-white shadow-md shadow-indigo-600/15 backdrop-blur-sm" : "text-gray-400 hover:text-white"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Auditer l'Historique</span>
          </button>
          <button
            onClick={() => setActiveSubTab("logs")}
            className={`px-4 py-2 rounded-lg text-xs font-medium tracking-wide transition-all cursor-pointer flex items-center space-x-2 ${
              activeSubTab === "logs" ? "bg-indigo-600/35 border border-indigo-500/50 text-white shadow-md shadow-indigo-600/15 backdrop-blur-sm" : "text-gray-400 hover:text-white"
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Journaux & Sécurité</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <AnimatePresence mode="wait">
        {/* SUBTAB 1: MEMBERS */}
        {activeSubTab === "members" && (
          <motion.div
            key="members"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="liquid-glass rounded-2xl overflow-hidden border border-white/5"
          >
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
              <h3 className="font-display font-medium text-white text-sm">Liste des membres enregistrés</h3>
              <span className="text-xs text-gray-400">{users.length} comptes actifs</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5 bg-white/2">
                    <th className="px-6 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Utilisateur</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Rôle</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Quota Consommé</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Clés Config</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-white/2 transition-all">
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-400 capitalize">
                            {user.username.substring(0, 2)}
                          </div>
                          <div>
                            <span className="text-sm font-medium text-white block">{user.username}</span>
                            <span className="text-[10px] text-gray-400">Inscrit {safeFormatDate(user.createdAt)}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-300">{user.email}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium tracking-wide uppercase ${
                          user.role === "admin" ? "bg-pink-500/15 text-pink-400 border border-pink-500/25" : "bg-blue-500/15 text-blue-400 border border-blue-500/25"
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {editingUserId === user.id ? (
                          <div className="flex items-center space-x-2">
                            <input
                              type="number"
                              value={editingQuotaValue}
                              onChange={(e) => setEditingQuotaValue(Number(e.target.value))}
                              className="w-20 px-2 py-1 rounded bg-black border border-white/20 text-base md:text-xs text-white"
                            />
                            <button
                              onClick={() => handleSaveQuota(user.id)}
                              className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-[10px] text-white cursor-pointer"
                            >
                              Sauver
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col space-y-1">
                            <div className="flex justify-between text-[11px] text-gray-300">
                              <span>{user.quotaUsed} / {user.quotaLimit} req.</span>
                              <span className="text-gray-500">{Math.round((user.quotaUsed / user.quotaLimit) * 100)}%</span>
                            </div>
                            <div className="w-28 bg-white/5 h-1.5 rounded-full overflow-hidden">
                              <div
                                className="bg-indigo-500 h-full"
                                style={{ width: `${Math.min((user.quotaUsed / user.quotaLimit) * 100, 100)}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-1">
                          <Key className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-xs text-gray-300">{user.apiKeys?.length || 0} clé(s)</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => handleStartEditQuota(user)}
                            className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all cursor-pointer"
                            title="Modifier quota"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onDeleteUser(user.id)}
                            disabled={user.role === "admin" && user.username === "Emerick"}
                            className="p-1.5 rounded bg-pink-900/20 hover:bg-pink-950 text-pink-400 hover:text-pink-300 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                            title="Supprimer définitivement"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {/* SUBTAB 2: CHATS AUDITING */}
        {activeSubTab === "chats" && (
          <motion.div
            key="chats"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
          >
            {/* Chats selector sidebar */}
            <div className="lg:col-span-4 liquid-glass rounded-2xl p-4 flex flex-col space-y-3">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block border-b border-white/5 pb-2">Chats membres en cours</span>
              <div className="flex flex-col space-y-2 max-h-[400px] overflow-y-auto pr-1">
                {chats.length > 0 ? (
                  chats.map((chat) => {
                    const isSelected = selectedAuditChat?.id === chat.id;
                    return (
                      <button
                        key={chat.id}
                        onClick={() => setSelectedAuditChat(chat)}
                        className={`p-3 rounded-xl text-left border cursor-pointer transition-all ${
                          isSelected ? "bg-indigo-950/40 border-indigo-500 shadow-sm" : "bg-white/2 border-transparent hover:bg-white/5"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-indigo-400 truncate max-w-[120px]">{chat.userName}</span>
                          <span className="text-[9px] text-gray-500 flex items-center space-x-1">
                            <Clock className="w-2.5 h-2.5" />
                            <span>{safeFormatDate(chat.createdAt)}</span>
                          </span>
                        </div>
                        <h4 className="text-xs font-medium text-white mt-1 truncate">{chat.title}</h4>
                        <span className="text-[10px] text-gray-400 block mt-0.5">{chat.messages.length} messages échangés</span>
                      </button>
                    );
                  })
                ) : (
                  <span className="text-xs text-gray-500 italic text-center py-6">Aucun chat à surveiller</span>
                )}
              </div>
            </div>

            {/* Live Chat Auditor screen */}
            <div className="lg:col-span-8 liquid-glass rounded-2xl p-5 flex flex-col min-h-[450px]">
              {selectedAuditChat ? (
                <div className="flex flex-col flex-1">
                  {/* Top Header of selected audit */}
                  <div className="border-b border-white/5 pb-3 mb-4 flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-white">Audit de : {selectedAuditChat.title}</h4>
                      <p className="text-[10px] text-gray-400 mt-0.5">Propriétaire : {selectedAuditChat.userName} ({selectedAuditChat.activeModel})</p>
                    </div>
                    <span className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-indigo-500/10 text-[10px] text-indigo-400 border border-indigo-500/20">
                      <MessageSquare className="w-3 h-3" />
                      <span>{selectedAuditChat.messages.length} messages</span>
                    </span>
                  </div>

                  {/* Messages container */}
                  <div className="flex-1 overflow-y-auto max-h-[300px] space-y-4 pr-1 mb-4">
                    {selectedAuditChat.messages.map((msg, i) => (
                      <div key={msg.id || i} className={`p-3 rounded-xl border ${
                        msg.senderRole === "user" ? "bg-black/20 border-white/5" : "bg-indigo-950/20 border-indigo-500/10"
                      }`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${
                            msg.senderRole === "user" ? "text-gray-400" : "text-indigo-400"
                          }`}>
                            {msg.senderName} ({msg.senderRole})
                          </span>
                          <span className="text-[9px] text-gray-500">{safeFormatTime(msg.timestamp)}</span>
                        </div>
                        <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-line">{msg.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col justify-center items-center flex-1 text-gray-400 italic text-xs">
                  <Eye className="w-8 h-8 text-white/20 mb-2" />
                  <span>Sélectionnez un historique de chat membre pour l'examiner</span>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* SUBTAB 3: LOGS & SECURITY */}
        {activeSubTab === "logs" && (
          <motion.div
            key="logs"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
          >
            {/* Realtime Terminal display */}
            <div className="lg:col-span-8 flex flex-col space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Auditeur d'événements réseau en direct</span>
                <span className="text-[10px] text-emerald-400 animate-pulse flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Écoute active</span>
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-black/80 font-mono text-[11px] text-gray-300 border border-white/5 shadow-2xl h-[400px] overflow-y-auto pr-2 flex flex-col space-y-2.5">
                {logs.length > 0 ? (
                  logs.map((log) => {
                    let color = "text-gray-400";
                    if (log.type === "success") color = "text-emerald-400";
                    if (log.type === "warning") color = "text-yellow-400";
                    if (log.type === "error") color = "text-pink-400";

                    return (
                      <div key={log.id} className="flex items-start space-x-2 border-b border-white/2 pb-1.5">
                        <span className="text-gray-500 shrink-0">[{safeFormatTime(log.timestamp)}]</span>
                        <span className={`font-semibold shrink-0 ${color}`}>[{log.source.toUpperCase()}]</span>
                        <span className="text-gray-200">{log.message}</span>
                      </div>
                    );
                  })
                ) : (
                  <span className="text-gray-500 italic">Aucun log disponible</span>
                )}
              </div>
            </div>

            {/* Security system overrides */}
            <div className="lg:col-span-4 liquid-glass rounded-2xl p-5 flex flex-col justify-between">
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-white flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-pink-400" />
                  <span>Contrôles Système</span>
                </h4>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Utilisez ces interrupteurs de bas niveau pour réinitialiser les agents Agora, révoquer les permissions temporaires, ou vider les pipelines encombrés en cas d'erreur API.
                </p>

                <div className="p-3.5 rounded-xl bg-pink-950/20 border border-pink-900/30">
                  <span className="text-xs font-semibold text-pink-400 block mb-1">Attention</span>
                  <p className="text-[10px] text-pink-200/80 leading-normal">
                    La réinitialisation générale force tous les agents spécialisés à abandonner leurs flux de travail en cours et réinitialise leur statut d'apprentissage.
                  </p>
                </div>
              </div>

              <div className="space-y-2.5 mt-6">
                <button
                  onClick={onResetAgents}
                  className="w-full py-2.5 px-4 rounded-xl bg-indigo-600/25 border border-indigo-500/50 hover:bg-indigo-600/40 text-white text-xs font-semibold shadow-md cursor-pointer transition-all flex items-center justify-center space-x-2"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Réinitialiser les agents</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
