import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Key, Plus, Trash, CheckCircle2, ShieldAlert, Cpu, Layers, ToggleLeft, ToggleRight, HelpCircle, Brain, Sparkles, Check, Save } from "lucide-react";
import { User } from "../types";

interface ModelKeysManagerProps {
  currentUser: User;
  onAddApiKey: (name: string, provider: string, key: string, model: string) => void;
  onDeleteApiKey: (keyId: string) => void;
  onUpdatePreferences: (memory: string, preferences?: any) => void;
  isLoading: boolean;
}

export default function ModelKeysManager({
  currentUser,
  onAddApiKey,
  onDeleteApiKey,
  onUpdatePreferences,
  isLoading
}: ModelKeysManagerProps) {
  const [memoryText, setMemoryText] = useState(currentUser.memory || "");
  const [isSavingMemory, setIsSavingMemory] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  React.useEffect(() => {
    setMemoryText(currentUser.memory || "");
  }, [currentUser.memory]);

  const handleSaveMemory = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingMemory(true);
    onUpdatePreferences(memoryText);
    setTimeout(() => {
      setIsSavingMemory(false);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    }, 800);
  };
  const [showAddForm, setShowAddForm] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [provider, setProvider] = useState("openrouter");
  const [keyValue, setKeyValue] = useState("");
  const [model, setModel] = useState("gemini-2.5-flash");

  const [formError, setFormError] = useState("");

  const providers = [
    { id: "openrouter", label: "OpenRouter AI Hub" },
    { id: "google", label: "Google Gemini API" },
    { id: "openai", label: "OpenAI API" },
    { id: "anthropic", label: "Anthropic Claude API" },
    { id: "groq", label: "Groq API" },
    { id: "cerebras", label: "Cerebras API" },
    { id: "together", label: "Together AI" },
    { id: "mistral", label: "Mistral AI" },
    { id: "ai21", label: "AI21 Studio" },
    { id: "cohere", label: "Cohere API" },
    { id: "xai", label: "xAI Grok API" },
    { id: "perplexity", label: "Perplexity API" },
    { id: "deepseek", label: "DeepSeek API" },
    { id: "openai-compatible", label: "OpenAI Compatible (URL custom)" }
  ];

  const modelOptions: Record<string, { value: string; label: string }[]> = {
    openrouter: [
      { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash (Recommandé)" },
      { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro (Haute Précision)" },
      { value: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B Instruct" },
      { value: "anthropic/claude-3-5-sonnet", label: "Claude 3.5 Sonnet" },
      { value: "openai/gpt-4o-mini", label: "GPT-4o Mini" },
      { value: "deepseek/deepseek-chat", label: "DeepSeek V3" },
      { value: "xai/grok-2", label: "Grok 2" },
      { value: "perplexity/sonar", label: "Perplexity Sonar" }
    ],
    google: [
      { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" }
    ],
    openai: [
      { value: "gpt-4o", label: "GPT-4o" },
      { value: "gpt-4o-mini", label: "GPT-4o Mini" },
      { value: "gpt-4-turbo", label: "GPT-4 Turbo" }
    ],
    anthropic: [
      { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
      { value: "claude-3-opus-20240229", label: "Claude 3 Opus" },
      { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku" }
    ],
    groq: [
      { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B Versatile" },
      { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant" },
      { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B" }
    ],
    cerebras: [
      { value: "llama-3.1-8b", label: "Llama 3.1 8B" },
      { value: "llama-3.3-70b", label: "Llama 3.3 70B" }
    ],
    together: [
      { value: "meta-llama/Llama-3.3-70B-Instruct-Turbo", label: "Llama 3.3 70B Instruct Turbo" },
      { value: "mistralai/Mixtral-8x7B-Instruct-v0.1", label: "Mixtral 8x7B" },
      { value: "Qwen/Qwen2.5-72B-Instruct", label: "Qwen 2.5 72B" }
    ],
    mistral: [
      { value: "mistral-large-latest", label: "Mistral Large" },
      { value: "mistral-medium-latest", label: "Mistral Medium" },
      { value: "pixtral-large-latest", label: "Pixtral Large" }
    ],
    ai21: [
      { value: "jamba-1.5-large", label: "Jamba 1.5 Large" },
      { value: "jamba-1.5-mini", label: "Jamba 1.5 Mini" }
    ],
    cohere: [
      { value: "command-r-plus", label: "Command R+" },
      { value: "command-r", label: "Command R" }
    ],
    xai: [
      { value: "grok-2-latest", label: "Grok 2" },
      { value: "grok-2-mini", label: "Grok 2 Mini" }
    ],
    perplexity: [
      { value: "sonar", label: "Sonar" },
      { value: "sonar-pro", label: "Sonar Pro" },
      { value: "sonar-reasoning", label: "Sonar Reasoning" }
    ],
    deepseek: [
      { value: "deepseek-chat", label: "DeepSeek V3" },
      { value: "deepseek-reasoner", label: "DeepSeek R1" }
    ],
    "openai-compatible": [
      { value: "custom-model", label: "Modèle custom (URL custom côté backend)" }
    ]
  };

  const currentModels = modelOptions[provider] || modelOptions.openrouter;

  React.useEffect(() => {
    // Reset model to first option of new provider when provider changes
    const opts = modelOptions[provider];
    if (opts && opts.length > 0 && !opts.some(o => o.value === model)) {
      setModel(opts[0].value);
    }
  }, [provider]);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!keyName.trim() || !keyValue.trim()) {
      setFormError("Veuillez remplir tous les champs obligatoires.");
      return;
    }

    if (keyValue.length < 15) {
      setFormError("La clé API semble invalide ou trop courte.");
      return;
    }

    onAddApiKey(keyName.trim(), provider, keyValue.trim(), model);
    
    // Clear form
    setKeyName("");
    setKeyValue("");
    setShowAddForm(false);
  };

  const getModelLabel = (modelId: string) => {
    switch (modelId) {
      case "gemini-2.5-flash": return "Gemini 2.5 Flash (Rapide)";
      case "gemini-2.5-pro": return "Gemini 2.5 Pro (Avancé)";
      case "meta-llama/llama-3.3-70b-instruct": return "Llama 3.3 70B (Instruct)";
      case "anthropic/claude-3-5-sonnet": return "Claude 3.5 Sonnet (Premium)";
      default: return modelId;
    }
  };

  const quotaPercent = Math.min((currentUser.quotaUsed / currentUser.quotaLimit) * 100, 100);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="api-keys-manager">
      {/* Left Column: API keys listing */}
      <div className="lg:col-span-8 flex flex-col space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-display font-medium text-white">Gestion de vos Clés API & Modèles</h3>
            <p className="text-xs text-gray-400">Configurez plusieurs clés API pour modifier à la volée le modèle d'exécution.</p>
          </div>
          
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/25 border border-indigo-500/50 hover:bg-indigo-600/40 text-white text-xs font-semibold cursor-pointer transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Ajouter une clé</span>
          </button>
        </div>

        {/* Add Key Form */}
        <AnimatePresence>
          {showAddForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <form onSubmit={handleAddSubmit} className="liquid-glass rounded-2xl p-5 space-y-4 border border-indigo-500/20">
                <h4 className="text-sm font-semibold text-white">Nouvelle clé API</h4>
                
                {formError && (
                  <div className="p-2.5 rounded-lg bg-pink-950/20 border border-pink-500/20 text-pink-400 text-xs flex items-center space-x-2">
                    <ShieldAlert className="w-4 h-4" />
                    <span>{formError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col space-y-1">
                    <label className="text-[11px] text-gray-400">Nom de la clé *</label>
                    <input
                      type="text"
                      placeholder="Ex: Ma clé OpenRouter"
                      value={keyName}
                      onChange={(e) => setKeyName(e.target.value)}
                      className="text-base md:text-xs px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-indigo-500/50 backdrop-blur-sm"
                      required
                    />
                  </div>

                  <div className="flex flex-col space-y-1">
                    <label className="text-[11px] text-gray-400">Fournisseur *</label>
                    <select
                      value={provider}
                      onChange={(e) => setProvider(e.target.value)}
                      className="text-base md:text-xs px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-indigo-500/50 backdrop-blur-sm"
                    >
                      {providers.map(p => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col space-y-1">
                    <label className="text-[11px] text-gray-400">Valeur de la clé API (sk-...) *</label>
                    <input
                      type="password"
                      placeholder="Collez votre clé API secrète"
                      value={keyValue}
                      onChange={(e) => setKeyValue(e.target.value)}
                      className="text-base md:text-xs px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-indigo-500/50 backdrop-blur-sm"
                      required
                    />
                  </div>

                  <div className="flex flex-col space-y-1">
                    <label className="text-[11px] text-gray-400">Modèle associé</label>
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="text-base md:text-xs px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-indigo-500/50 backdrop-blur-sm"
                    >
                      {currentModels.map(m => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-gray-300 hover:text-white transition-all cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-lg bg-indigo-600/25 border border-indigo-500/50 hover:bg-indigo-600/40 text-xs text-white font-medium transition-all cursor-pointer"
                  >
                    Enregistrer la clé
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Keys List */}
        <div className="flex flex-col space-y-3">
          {currentUser.apiKeys && currentUser.apiKeys.length > 0 ? (
            currentUser.apiKeys.map((k) => (
              <div
                key={k.id}
                className="liquid-glass rounded-xl p-4 flex items-center justify-between border border-white/5 hover:border-white/10 transition-all"
              >
                <div className="flex items-center space-x-3.5">
                  <div className="p-2.5 rounded-lg bg-white/5 border border-white/10">
                    <Key className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h4 className="text-xs font-semibold text-white">{k.name}</h4>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 uppercase font-mono">
                        {k.provider}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400 mt-0.5 block">
                      Modèle : <strong className="text-gray-300">{getModelLabel(k.model)}</strong>
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <span className="text-[10px] text-gray-500 font-mono">
                    {k.key.substring(0, 6)}...{k.key.substring(k.key.length - 4)}
                  </span>
                  
                  {k.active ? (
                    <span className="text-xs text-emerald-400 flex items-center space-x-1 font-medium bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Active</span>
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500 bg-white/5 border border-white/5 px-2 py-0.5 rounded">
                      Désactivée
                    </span>
                  )}

                  <button
                    onClick={() => onDeleteApiKey(k.id)}
                    className="p-1.5 rounded bg-pink-900/10 hover:bg-pink-950 text-pink-400 hover:text-pink-300 transition-all cursor-pointer"
                    title="Supprimer cette clé"
                  >
                    <Trash className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="liquid-glass rounded-xl p-6 text-center text-gray-500 text-xs italic">
              Vous n'avez pas encore configuré de clés API personnelles. Agora Ai utilisera le quota de secours par défaut de la plateforme.
            </div>
          )}
        </div>

        {/* AI Memory & Profile Preferences Card */}
        <div className="liquid-glass rounded-2xl p-5 border border-white/5 space-y-4 mt-6" id="ai-memory-card">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Mémoire de l'IA & Préférences</h3>
              <p className="text-[11px] text-gray-400">Consultez et modifiez les faits et préférences retenus par l'orchestrateur.</p>
            </div>
          </div>

          <form onSubmit={handleSaveMemory} className="space-y-3">
            <div className="relative">
              <textarea
                value={memoryText}
                onChange={(e) => setMemoryText(e.target.value)}
                placeholder="Ex : Vous préférez coder en LUA. Vous travaillez sur un dashboard d'administration de serveurs de jeux. Vous aimez les explications directes sans longs blablas..."
                className="w-full h-32 text-xs text-gray-200 placeholder-gray-500 bg-white/5 border border-white/10 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500/50 transition-all resize-none backdrop-blur-sm"
              />
              <div className="absolute bottom-2.5 right-2.5 flex items-center space-x-1 text-[9px] text-gray-500 font-medium">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                <span>Mise à jour automatique en cours de chat</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-[10px] text-gray-400 max-w-[65%] leading-snug">
                Astuce : Parlez de vous ou dites par exemple <span className="font-mono text-indigo-300">"Retiens que..."</span> dans le chat pour mettre à jour cette fiche automatiquement !
              </div>

              <button
                type="submit"
                disabled={isSavingMemory}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                  savedSuccess
                    ? "bg-emerald-600/25 border border-emerald-500/50 hover:bg-emerald-600/40 text-white shadow-lg shadow-emerald-600/10"
                    : "bg-indigo-600/25 border border-indigo-500/50 hover:bg-indigo-600/40 text-white shadow-lg shadow-indigo-600/10"
                }`}
              >
                {savedSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Sauvegardé !</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSavingMemory ? "Enregistrement..." : "Enregistrer"}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Right Column: Quota meter ring */}
      <div className="lg:col-span-4 flex flex-col justify-between liquid-glass rounded-2xl p-5 border border-white/5">
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">Votre Quota de Requêtes</h4>
          <p className="text-[11px] text-gray-400 leading-normal mb-5">
            Chaque message envoyé à l'arbre collaboratif consomme 1 requête. L'administrateur peut rehausser ou réinitialiser votre quota à tout moment.
          </p>

          {/* Quota Gauge visualization */}
          <div className="flex flex-col items-center justify-center py-4">
            <div className="relative w-32 h-32 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="64"
                  cy="64"
                  r="52"
                  className="stroke-white/5 fill-none"
                  strokeWidth="8"
                />
                <circle
                  cx="64"
                  cy="64"
                  r="52"
                  className="stroke-indigo-500 fill-none transition-all duration-1000"
                  strokeWidth="8"
                  strokeDasharray={326.7}
                  strokeDashoffset={326.7 - (326.7 * quotaPercent) / 100}
                />
              </svg>
              <div className="absolute text-center">
                <span className="text-2xl font-bold text-white tracking-tight">{currentUser.quotaUsed}</span>
                <span className="text-[10px] text-gray-400 block border-t border-white/10 pt-0.5">sur {currentUser.quotaLimit}</span>
              </div>
            </div>
            
            <span className="text-[10px] uppercase font-mono tracking-wider text-indigo-400 mt-4 block">
              {Math.round(quotaPercent)}% Consommé
            </span>
          </div>
        </div>

        <div className="pt-4 border-t border-white/5 space-y-2.5">
          <div className="flex items-start space-x-2 text-[10px] text-gray-400">
            <HelpCircle className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <span className="leading-snug">
              Astuce : Pour économiser votre quota, privilégiez les questions ciblées et configurez votre clé API OpenRouter personnelle.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
