import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Shield, Lock, User, Mail, Globe, AlertCircle, ArrowRight, Sparkles, KeyRound } from "lucide-react";

interface AuthScreenProps {
  onLoginSuccess: (user: any) => void;
  isLoading: boolean;
}

type AuthMode = "login" | "register" | "magic";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

export default function AuthScreen({ onLoginSuccess, isLoading }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");

  const [authError, setAuthError] = useState("");
  const [infoMsg, setInfoMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const saved = sessionStorage.getItem("agora_user");
    if (saved) {
      try {
        const user = JSON.parse(saved);
        if (user?.id) onLoginSuccess(user);
      } catch {}
    }
  }, []);

  const persistUser = (user: any) => {
    sessionStorage.setItem("agora_user", JSON.stringify(user));
    onLoginSuccess(user);
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setInfoMsg("");
    setIsSubmitting(true);

    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAuthError("Veuillez saisir un email valide.");
      setIsSubmitting(false);
      return;
    }

    try {
      if (mode === "magic") {
        const res = await fetch(`${API_BASE}/auth/magic`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim().toLowerCase() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erreur lien magique.");
        setInfoMsg("Lien magique envoyé. Vérifie tes emails (et le spam).");
        setIsSubmitting(false);
        return;
      }

      if (mode === "register") {
        if (!username.trim() || !password.trim()) {
          setAuthError("Nom d'utilisateur + mot de passe requis.");
          setIsSubmitting(false);
          return;
        }
        if (password.length < 6) {
          setAuthError("Mot de passe trop court (6 caractères min).");
          setIsSubmitting(false);
          return;
        }
        const res = await fetch(`${API_BASE}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: username.trim(),
            email: email.trim().toLowerCase(),
            password,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erreur inscription.");
        persistUser(data.user);
      } else {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            password,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Identifiants invalides.");
        persistUser(data.user);
      }
    } catch (err: any) {
      setAuthError(err.message || "Erreur d'authentification.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOAuth = async (provider: "google") => {
    setAuthError("Connexion Google temporairement d\u00e9sactiv\u00e9e.");
  };

  const isMagic = mode === "magic";
  const showPassword = mode !== "magic";
  const showUsername = mode === "register" || mode === "magic";
  const submitLabel =
    mode === "login" ? "Se connecter" :
    mode === "register" ? "Créer un compte" :
    "Recevoir le lien magique";

  return (
    <div className="min-h-screen bg-[#070b13] flex flex-col justify-center items-center p-4 relative overflow-hidden" id="auth-screen">
      <div className="absolute top-1/4 left-1/4 w-[450px] h-[450px] rounded-full bg-indigo-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[450px] h-[450px] rounded-full bg-pink-600/5 blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md liquid-glass p-8 rounded-3xl relative z-10 border border-white/5 shadow-2xl"
      >
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-xl font-bold text-white shadow-lg shadow-indigo-600/20 mx-auto mb-4">
            A∀
          </div>
          <h1 className="text-2xl font-display font-bold text-white tracking-tight">Agora Ai</h1>
          <p className="text-xs text-gray-400 mt-1.5 leading-normal">
            Hub collaboratif d'agents d'intelligence artificielle spécialisés.
          </p>
        </div>

        {authError && (
          <div className="p-3 rounded-xl bg-pink-950/20 border border-pink-500/20 text-pink-400 text-xs flex items-center space-x-2.5 mb-5">
            <AlertCircle className="w-4.5 h-4.5 shrink-0" />
            <span>{authError}</span>
          </div>
        )}

        {infoMsg && (
          <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/20 text-emerald-400 text-xs flex items-center space-x-2.5 mb-5">
            <Sparkles className="w-4.5 h-4.5 shrink-0" />
            <span>{infoMsg}</span>
          </div>
        )}

        <form onSubmit={handleEmailAuth} className="space-y-4">
          {showUsername && (
            <div className="flex flex-col space-y-1">
              <label className="text-[11px] text-gray-400 font-medium">
                {isMagic ? "Nom d'utilisateur (optionnel)" : "Nom d'utilisateur"}
              </label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="Votre identifiant"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full text-base md:text-xs pl-9 pr-4 py-2.5 rounded-xl liquid-glass-input text-white focus:outline-none placeholder-gray-500"
                  required={mode === "register"}
                />
              </div>
            </div>
          )}

          <div className="flex flex-col space-y-1">
            <label className="text-[11px] text-gray-400 font-medium">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
              <input
                type="email"
                placeholder="votre@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full text-base md:text-xs pl-9 pr-4 py-2.5 rounded-xl liquid-glass-input text-white focus:outline-none placeholder-gray-500"
                required
              />
            </div>
          </div>

          {showPassword && (
            <div className="flex flex-col space-y-1">
              <label className="text-[11px] text-gray-400 font-medium">Mot de passe</label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full text-base md:text-xs pl-9 pr-4 py-2.5 rounded-xl liquid-glass-input text-white focus:outline-none placeholder-gray-500"
                  required={mode !== "magic"}
                  minLength={mode === "register" ? 6 : undefined}
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || isLoading}
            className="w-full flex items-center justify-center space-x-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/15 cursor-pointer transition-all disabled:opacity-60"
          >
            <span>{isSubmitting ? "Chargement..." : submitLabel}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="relative my-6 flex items-center justify-center">
          <div className="w-full border-t border-white/5" />
          <span className="absolute px-3 bg-[#111726] text-[10px] text-gray-500 font-mono tracking-wider">OU</span>
        </div>

        <button
          type="button"
          onClick={() => handleOAuth("google")}
          disabled={isSubmitting || isLoading}
          className="w-full py-2.5 rounded-xl bg-white text-gray-900 text-xs font-medium flex items-center justify-center space-x-2 hover:bg-gray-100 transition-all disabled:opacity-60"
        >
          <Globe className="w-4 h-4" />
          <span>Continuer avec Google</span>
        </button>

        <div className="mt-6 flex flex-col space-y-3 text-center">
          <div className="flex items-center justify-center space-x-3 text-[11px]">
            <button
              onClick={() => { setMode("login"); setAuthError(""); setInfoMsg(""); }}
              className={`${mode === "login" ? "text-indigo-400 font-medium" : "text-gray-400 hover:text-indigo-400"} transition-all cursor-pointer`}
            >
              Connexion
            </button>
            <span className="text-gray-600">•</span>
            <button
              onClick={() => { setMode("register"); setAuthError(""); setInfoMsg(""); }}
              className={`${mode === "register" ? "text-indigo-400 font-medium" : "text-gray-400 hover:text-indigo-400"} transition-all cursor-pointer`}
            >
              Inscription
            </button>
            <span className="text-gray-600">•</span>
            <button
              onClick={() => { setMode("magic"); setAuthError(""); setInfoMsg(""); }}
              className={`${mode === "magic" ? "text-indigo-400 font-medium" : "text-gray-400 hover:text-indigo-400"} transition-all cursor-pointer flex items-center space-x-1`}
            >
              <KeyRound className="w-3 h-3" />
              <span>Magic link</span>
            </button>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-center space-x-2 text-[10px] text-gray-500">
          <Shield className="w-3 h-3" />
          <span>Authentification sécurisée via Supabase</span>
        </div>
      </motion.div>
    </div>
  );
}
