// Agora AI — Error Code Dictionary
// Users see "Error: 2XX" with a red triangle. Admins see the full description.

export const ERROR_CODES: Record<number, { label: string; description: string; severity: "warning" | "error" | "critical" }> = {
  // 2xx — API/Provider errors
  201: { label: "API_QUOTA_EXCEEDED", description: "La clé API a atteint son quota gratuit quotidien. Rechargement automatique la prochaine fenêtre.", severity: "warning" },
  202: { label: "API_KEY_INVALID", description: "La clé API fournie est invalide ou expirée. Ajoutez une nouvelle clé dans l'onglet Clés.", severity: "error" },
  203: { label: "API_TIMEOUT", description: "Le fournisseur IA a mis trop de temps à répondre (>8s). Réessayez.", severity: "warning" },
  204: { label: "API_ALL_KEYS_FAILED", description: "Toutes les clés API (utilisateur + serveur) ont échoué. Réponse de secours générée.", severity: "error" },
  205: { label: "API_MODEL_UNAVAILABLE", description: "Le modèle demandé n'est pas disponible chez ce fournisseur. Repli sur un autre modèle.", severity: "warning" },
  206: { label: "API_RATE_LIMIT", description: "Trop de requêtes envoyées trop vite. Attendez quelques secondes.", severity: "warning" },

  // 3xx — Connection/Network errors
  301: { label: "CONN_LOST", description: "Connexion perdue avec le serveur. Vérifiez votre réseau.", severity: "error" },
  302: { label: "CONN_STREAM_BROKEN", description: "Le flux de réponse a été interrompu en cours de route.", severity: "warning" },
  303: { label: "CONN_ABORTED", description: "La requête a été annulée (par l'utilisateur ou le serveur).", severity: "warning" },

  // 4xx — Auth/Session errors
  401: { label: "AUTH_INVALID", description: "Identifiants invalides.", severity: "error" },
  402: { label: "AUTH_EXPIRED", description: "Session expirée. Reconnectez-vous.", severity: "warning" },
  403: { label: "AUTH_REQUIRED", description: "Champs requis manquants pour l'authentification.", severity: "warning" },

  // 5xx — Server/Internal errors
  501: { label: "SERVER_DB_SYNC", description: "Erreur de synchronisation avec la base de données Supabase.", severity: "error" },
  502: { label: "SERVER_CHAT_NOT_FOUND", description: "Chat introuvable — possiblement supprimé ou non synchronisé.", severity: "error" },
  503: { label: "SERVER_INTERNAL", description: "Erreur interne du serveur. Essayez à nouveau.", severity: "critical" },
  504: { label: "SERVER_TIMEOUT", description: "Le serveur a dépassé sa limite de temps (Vercel 504). Réessayez.", severity: "error" },
};

export function getErrorDisplay(code: number): { display: string; description: string; severity: string } {
  const entry = ERROR_CODES[code];
  if (!entry) {
    return { display: `Error: ${code}`, description: "Erreur inconnue non répertoriée.", severity: "error" };
  }
  return { display: `Error: ${code}`, description: entry.description, severity: entry.severity };
}