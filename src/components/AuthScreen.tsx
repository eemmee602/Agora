import React, { useState } from "react";
import { motion } from "motion/react";
import { Shield, Lock, User, Mail, Globe, AlertCircle, ArrowRight } from "lucide-react";

interface AuthScreenProps {
  onLoginSuccess: (user: any) => void;
  isLoading: boolean;
}

export default function AuthScreen({ onLoginSuccess, isLoading }: AuthScreenProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  
  const [authError, setAuthError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setIsSubmitting(true);

    if (!username.trim() || !password.trim()) {
      setAuthError("Veuillez remplir tous les champs requis.");
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();
      if (data.success) {
        onLoginSuccess(data.user);
      } else {
        setAuthError(data.error || "Identifiants invalides.");
      }
    } catch (err) {
      setAuthError("Erreur lors de la connexion au serveur Agora.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSSO = async () => {
    setAuthError("");
    setIsSubmitting(true);
    try {
      // Simulate OAuth login with the sponsor email specified in the prompt
      const response = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "egirouxlafontaine@gmail.com",
          name: "Egiroux Lafontaine"
        })
      });
      const data = await response.json();
      if (data.success) {
        onLoginSuccess(data.user);
      } else {
        setAuthError("Échec du SSO Google.");
      }
    } catch (err) {
      setAuthError("Erreur de communication SSO.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b13] flex flex-col justify-center items-center p-4 relative overflow-hidden" id="auth-screen">
      
      {/* Background radial glowing effects */}
      <div className="absolute top-1/4 left-1/4 w-[450px] h-[450px] rounded-full bg-indigo-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[450px] h-[450px] rounded-full bg-pink-600/5 blur-[120px] pointer-events-none" />

      {/* Main Container */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md liquid-glass p-8 rounded-3xl relative z-10 border border-white/5 shadow-2xl"
      >
        {/* Branding Logo */}
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

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col space-y-1">
            <label className="text-[11px] text-gray-400 font-medium">Nom d'utilisateur ou Email</label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder={isRegister ? "Votre identifiant" : "Emerick ou votre email"}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full text-base md:text-xs pl-9 pr-4 py-2.5 rounded-xl liquid-glass-input text-white focus:outline-none placeholder-gray-500"
                required
              />
            </div>
          </div>

          {isRegister && (
            <div className="flex flex-col space-y-1">
              <label className="text-[11px] text-gray-400 font-medium">Email de contact</label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                <input
                  type="email"
                  placeholder="nom@exemple.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full text-base md:text-xs pl-9 pr-4 py-2.5 rounded-xl liquid-glass-input text-white focus:outline-none placeholder-gray-500"
                />
              </div>
            </div>
          )}

          <div className="flex flex-col space-y-1">
            <label className="text-[11px] text-gray-400 font-medium">Mot de passe</label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
              <input
                type="password"
                placeholder="Aaxxppm14 ou de votre choix"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full text-base md:text-xs pl-9 pr-4 py-2.5 rounded-xl liquid-glass-input text-white focus:outline-none placeholder-gray-500"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center space-x-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/15 cursor-pointer transition-all"
          >
            <span>{isSubmitting ? "Chargement..." : isRegister ? "S'inscrire et se connecter" : "Se connecter"}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Divider */}
        <div className="relative my-6 flex items-center justify-center">
          <div className="w-full border-t border-white/5" />
          <span className="absolute px-3 bg-[#111726] text-[10px] text-gray-500 font-mono tracking-wider">OU</span>
        </div>

        {/* Google SSO simulated */}
        <button
          onClick={handleGoogleSSO}
          disabled={isSubmitting}
          className="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/10 text-white text-xs font-medium flex items-center justify-center space-x-2 transition-all cursor-pointer"
        >
          <Globe className="w-4 h-4 text-indigo-400 animate-pulse" />
          <span>Continuer avec Google SSO</span>
        </button>

        {/* Mode Toggle */}
        <div className="text-center mt-6">
          <button
            onClick={() => {
              setIsRegister(!isRegister);
              setAuthError("");
            }}
            className="text-[11px] text-gray-400 hover:text-indigo-400 transition-all cursor-pointer"
          >
            {isRegister ? "Déjà membre ? Se connecter par identifiants" : "Nouveau ? Créer un compte instantané"}
          </button>
        </div>

      </motion.div>
    </div>
  );
}
