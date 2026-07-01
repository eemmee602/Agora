import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Cpu, Award, Zap, RefreshCw, Layers, ShieldCheck, Search, Code, CheckCircle, ChevronRight } from "lucide-react";
import { Agent } from "../types";

interface AgentTreeProps {
  agents: Agent[];
  onLearnSkill: (agentId: string, skill: string) => void;
  isLoading: boolean;
  onRefresh: () => void;
}

export default function AgentTree({ agents, onLearnSkill, isLoading, onRefresh }: AgentTreeProps) {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [newSkillText, setNewSkillText] = useState("");

  useEffect(() => {
    if (agents.length > 0 && !selectedAgent) {
      setSelectedAgent(agents[0]);
    } else if (selectedAgent) {
      // Keep selected agent synced with parent updates
      const updated = agents.find(a => a.id === selectedAgent.id);
      if (updated) setSelectedAgent(updated);
    }
  }, [agents, selectedAgent]);

  const handleImproveAgent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgent || !newSkillText.trim()) return;
    onLearnSkill(selectedAgent.id, newSkillText.trim());
    setNewSkillText("");
  };

  const getAgentIcon = (id: string) => {
    switch (id) {
      case "agent-architect": return <Layers className="w-5 h-5 text-indigo-400" />;
      case "agent-coder": return <Code className="w-5 h-5 text-emerald-400" />;
      case "agent-security": return <ShieldCheck className="w-5 h-5 text-pink-400" />;
      case "agent-searcher": return <Search className="w-5 h-5 text-cyan-400" />;
      default: return <Cpu className="w-5 h-5 text-gray-400" />;
    }
  };

  const getAgentColor = (id: string) => {
    switch (id) {
      case "agent-architect": return "border-indigo-500/30 text-indigo-400 bg-indigo-500/10";
      case "agent-coder": return "border-emerald-500/30 text-emerald-400 bg-emerald-500/10";
      case "agent-security": return "border-pink-500/30 text-pink-400 bg-pink-500/10";
      case "agent-searcher": return "border-cyan-500/30 text-cyan-400 bg-cyan-500/10";
      default: return "border-gray-500/30 text-gray-400 bg-gray-500/10";
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="agent-tree-module">
      {/* Left Column: Flow Tree Visualizer */}
      <div className="lg:col-span-8 flex flex-col space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-display font-medium text-white tracking-tight">Arbre d'Orchestration Collaborative</h3>
            <p className="text-xs text-gray-400">Réseau hiérarchique en temps réel d'agents spécialisés.</p>
          </div>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg liquid-glass-light text-xs text-gray-300 hover:text-white transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Actualiser</span>
          </button>
        </div>

        {/* Tree flow visualization */}
        <div className="liquid-glass rounded-2xl p-6 flex flex-col min-h-[350px] relative overflow-x-auto overflow-y-hidden custom-scrollbar">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.04),transparent)] pointer-events-none" />

          <div className="min-w-[620px] lg:min-w-0 w-full flex flex-col items-center justify-center my-auto">
            {/* Root Node: Core Hub */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="z-10 flex flex-col items-center mb-10"
            >
              <div className="px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-600/20 to-purple-600/20 border border-indigo-500/40 shadow-lg flex items-center space-x-2">
                <div className="relative">
                  <Cpu className="w-5 h-5 text-indigo-400 animate-pulse" />
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-indigo-400" />
                </div>
                <span className="text-xs font-display font-bold text-white tracking-wider">AGORA CORE NETWORK HUB</span>
              </div>
              <div className="w-px h-10 bg-indigo-500/30 relative">
                <span className="absolute bottom-0 -left-1 w-2.5 h-2.5 rounded-full bg-indigo-500/30 animate-ping" />
              </div>
            </motion.div>

            {/* Connective Line Grid */}
            <div className="w-full max-w-2xl grid grid-cols-4 relative">
              <div className="absolute -top-10 left-[12.5%] right-[12.5%] h-px bg-indigo-500/30" />
              
              {/* Branches to each Agent */}
              {agents.map((agent, idx) => {
                const isSelected = selectedAgent?.id === agent.id;
                const colorClass = getAgentColor(agent.id);

                return (
                  <div key={agent.id} className="flex flex-col items-center">
                    {/* Vertical branch line */}
                    <div className="w-px h-10 bg-indigo-500/30 relative">
                      <span className="absolute top-0 -left-1 w-2 h-2 rounded-full bg-indigo-500/30" />
                    </div>

                    {/* Agent Node Button */}
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedAgent(agent)}
                      className={`w-11/12 max-w-[170px] p-3 rounded-xl liquid-glass text-left transition-all relative group cursor-pointer ${
                        isSelected ? "border-indigo-500 bg-indigo-950/40 ring-1 ring-indigo-500/30 shadow-[0_0_20px_rgba(99,102,241,0.15)]" : "hover:border-gray-500/40"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="p-1.5 rounded-lg bg-white/5 border border-white/10 group-hover:border-indigo-500/20">
                          {getAgentIcon(agent.id)}
                        </div>
                        <span className={`flex h-2 w-2 rounded-full ${
                          agent.status === "working" ? "bg-emerald-400 animate-pulse" : agent.status === "sleeping" ? "bg-cyan-400" : "bg-gray-400"
                        }`} />
                      </div>

                      <h4 className="text-xs font-medium text-white truncate">{agent.name.split(" ")[0]}</h4>
                      <p className="text-[10px] text-gray-400 truncate mt-0.5">{agent.role}</p>

                      {/* Progress slider if working */}
                      {agent.status === "working" && (
                        <div className="w-full bg-white/5 h-1 rounded-full mt-2 overflow-hidden">
                          <div className="bg-emerald-400 h-full animate-pulse" style={{ width: "70%" }} />
                        </div>
                      )}
                    </motion.button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Inspector Panel */}
      <div className="lg:col-span-4 flex flex-col">
        <h3 className="text-lg font-display font-medium text-white tracking-tight mb-4">Inspecteur d'Agent</h3>
        
        <AnimatePresence mode="wait">
          {selectedAgent ? (
            <motion.div
              key={selectedAgent.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="liquid-glass rounded-2xl p-5 flex flex-col flex-1"
            >
              <div className="flex items-center space-x-3 mb-4">
                <img
                  src={selectedAgent.avatar}
                  alt={selectedAgent.name}
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 rounded-xl object-cover border border-white/10"
                />
                <div>
                  <h4 className="font-display font-semibold text-white">{selectedAgent.name}</h4>
                  <span className="text-[11px] text-indigo-400 font-mono tracking-wider uppercase">{selectedAgent.role}</span>
                </div>
              </div>

              {/* Description */}
              <p className="text-xs text-gray-300 leading-relaxed mb-4">{selectedAgent.description}</p>

              {/* Status card */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-center">
                  <span className="text-[10px] text-gray-400 uppercase tracking-wider block">Statut Actuel</span>
                  <div className="flex items-center justify-center space-x-1.5 mt-1">
                    <span className={`w-2 h-2 rounded-full ${
                      selectedAgent.status === "working" ? "bg-emerald-400 animate-pulse" : selectedAgent.status === "sleeping" ? "bg-cyan-400" : "bg-gray-400"
                    }`} />
                    <span className="text-xs font-semibold text-white capitalize">{selectedAgent.status}</span>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-center">
                  <span className="text-[10px] text-gray-400 uppercase tracking-wider block">Activité</span>
                  <span className="text-xs font-semibold text-white block mt-1">
                    {selectedAgent.status === "working" ? "Flux Occupé" : "Disponible"}
                  </span>
                </div>
              </div>

              {/* Skills section */}
              <div className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-300">Compétences Auto-Apprises</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    {selectedAgent.skills.length} skills
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                  {selectedAgent.skills.map((skill, i) => (
                    <span
                      key={i}
                      className="text-[10px] px-2 py-1 rounded-md bg-white/5 border border-white/10 text-gray-300 flex items-center space-x-1 hover:border-indigo-500/30 hover:text-white transition-all cursor-default"
                    >
                      <Award className="w-2.5 h-2.5 text-indigo-400" />
                      <span>{skill}</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Dynamic Learn Action */}
              <div className="mt-auto pt-4 border-t border-white/5">
                <form onSubmit={handleImproveAgent} className="flex flex-col space-y-2">
                  <label className="text-[11px] text-gray-400">Éduquer l'agent (Nouvel apprentissage de skill)</label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      placeholder="Ex: Optimisation de code Rust..."
                      value={newSkillText}
                      onChange={(e) => setNewSkillText(e.target.value)}
                      className="flex-1 text-base md:text-xs px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-all"
                    />
                    <button
                      type="submit"
                      disabled={!newSkillText.trim()}
                      className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium transition-all cursor-pointer flex items-center space-x-1"
                    >
                      <Zap className="w-3 h-3" />
                      <span>Ajouter</span>
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          ) : (
            <div className="liquid-glass rounded-2xl p-6 text-center text-gray-400 flex flex-col justify-center items-center flex-1">
              <Cpu className="w-8 h-8 text-white/20 mb-2" />
              <span>Sélectionnez un agent pour inspecter ses caractéristiques</span>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
