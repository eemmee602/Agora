import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Key, Plus, Trash, CheckCircle2, ShieldAlert, ShieldCheck, Cpu, Layers, ToggleLeft, ToggleRight, HelpCircle, Brain, Sparkles, Check, Save } from "lucide-react";
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
  const [keyValue, setKeyValue] = useState("");

  const [formError, setFormError] = useState("");

  const detectProvider = (key: string): { provider: string; model: string } => {
    const lower = key.toLowerCase();
    if (key.startsWith("AIza")) {
      return { provider: "google", model: "gemini-2.5-flash" };
    }
    if (lower.startsWith("sk-or-") || lower.includes("openrouter")) {
      return { provider: "openrouter", model: "google/gemini-2.5-flash" };
    }
    if (lower.startsWith("sk-ant-")) {
      return { provider: "anthropic", model: "claude-3-5-sonnet-20241022" };
    }
    if (lower.startsWith("gsk_")) {
      return { provider: "groq", model: "llama-3.3-70b-versatile" };
    }
    if (lower.startsWith("sk-")) {
      if (lower.includes("cerebras")) return { provider: "cerebras", model: "llama-3.3-70b" };
      if (lower.includes("together")) return { provider: "together", model: "meta-llama/Llama-3.3-70B-Instruct-Turbo" };
      if (lower.includes("mistral")) return { provider: "mistral", model: "mistral-large-latest" };
      if (lower.includes("cohere")) return { provider: "cohere", model: "command-r-plus" };
      if (lower.includes("xai")) return { provider: "xai", model: "grok-2-latest" };
      if (lower.includes("perplexity")) return { provider: "perplexity", model: "sonar" };
      if (lower.includes("deepseek")) return { provider: "deepseek", model: "deepseek-chat" };
      if (lower.includes("ai21")) return { provider: "ai21", model: "jamba-1.5-large" };
    }
    return { provider: "openrouter", model: "google/gemini-2.5-flash" };
  };

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

    const { provider, model } = detectProvider(keyValue.trim());

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
                    <label className="text-[11px] text-gray-400">Fournisseur détecté</label>
                    <div className="flex items-center space-x-2 text-base md:text-xs px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white">
                      {keyValue.trim() ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 uppercase font-mono text-[10px]">
                          {detectProvider(keyValue.trim()).provider}
                        </span>
                      ) : (
                        <span className="text-gray-500 italic">Entrez une clé pour voir le fournisseur</span>
                      )}
                    </div>
                  </div>
                </div>

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
                    <Trash className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-gray-500 text-sm bg-white/[0.02] rounded-2xl border border-white/5">
              Aucune clé API enregistrée.
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Usage Quota + Memory + Quick Actions */}
      <div className="lg:col-span-4 space-y-4">
        {/* Usage Card */}
        <div className="liquid-glass rounded-2xl p-5 space-y-3 border border-indigo-500/20">
          <div className="flex items-center space-x-2 text-white">
            <Cpu className="w-4 h-4 text-indigo-400" />
            <h4 className="text-sm font-semibold">Quota d'utilisation</h4>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] text-gray-400 font-mono">
              <span>{currentUser.quotaUsed} / {currentUser.quotaLimit}</span>
              <span>{quotaPercent.toFixed(1)}%</span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/10">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${quotaPercent}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className={`h-full rounded-full ${
                  quotaPercent > 90 ? "bg-pink-500" : quotaPercent > 70 ? "bg-amber-500" : "bg-emerald-500"
                }`}
              />
            </div>
            <p className="text-[10px] text-gray-500">
              Votre consommation quotidienne de requêtes API. Réinitialisée chaque jour.
            </p>
          </div>
        </div>

        {/* Memory Card */}
        <form onSubmit={handleSaveMemory} className="liquid-glass rounded-2xl p-5 space-y-3 border border-white/10">
          <div className="flex items-center space-x-2 text-white">
            <Brain className="w-4 h-4 text-purple-400" />
            <h4 className="text-sm font-semibold">Mémoire d'Emerick</h4>
          </div>
          <p className="text-[10px] text-gray-400 leading-relaxed">
            Décrivez ici comment Emerick doit se comporter avec vous (ton, domaines d'expertise, préférences, etc.). Cette mémoire est injectée dans chaque conversation.
          </p>
          <textarea
            value={memoryText}
            onChange={(e) => setMemoryText(e.target.value)}
            placeholder="Ex: Je suis un développeur senior spécialisé en TypeScript et React. Réponds de manière concise et technique."
            className="w-full h-32 text-base md:text-xs px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-indigo-500/50 backdrop-blur-sm resize-none"
          />
          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] text-gray-500">{memoryText.length} caractères</span>
            <button
              type="submit"
              disabled={isSavingMemory}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-purple-600/25 border border-purple-500/50 hover:bg-purple-600/40 text-white text-xs font-medium transition-all cursor-pointer disabled:opacity-50"
            >
              {isSavingMemory ? (
                <>
                  <Sparkles className="w-3.5 h-3.5 animate-spin" />
                  <span>Enregistrement...</span>
                </>
              ) : savedSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Sauvegardé</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Sauvegarder</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Quick Help Card */}
        <div className="liquid-glass rounded-2xl p-5 space-y-3 border border-white/10">
          <div className="flex items-center space-x-2 text-white">
            <HelpCircle className="w-4 h-4 text-emerald-400" />
            <h4 className="text-sm font-semibold">Comment ça marche ?</h4>
          </div>
          <ul className="space-y-2 text-[10px] text-gray-400">
            <li className="flex items-start space-x-2">
              <Layers className="w-3.5 h-3.5 text-indigo-400 mt-0.5 shrink-0" />
              <span>Ajoutez plusieurs clés API. Le fournisseur et le modèle sont détectés automatiquement depuis le préfixe de la clé.</span>
            </li>
            <li className="flex items-start space-x-2">
              <ToggleRight className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
              <span>La première clé active est utilisée pour exécuter vos requêtes. Désactivez-en une pour passer à la suivante.</span>
            </li>
            <li className="flex items-start space-x-2">
              <ShieldCheck className="w-3.5 h-3.5 text-pink-400 mt-0.5 shrink-0" />
              <span>Vos clés restent stockées localement (serveur). Ne les partagez jamais.</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
