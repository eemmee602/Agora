export interface User {
  id: string;
  username: string;
  email: string;
  role: "admin" | "user";
  quotaLimit: number;
  quotaUsed: number;
  apiKeys: { id: string; name: string; provider: string; key: string; model: string; active: boolean }[];
  createdAt: string;
  memory?: string;
  preferences?: {
    theme?: string;
    language?: string;
    [key: string]: any;
  };
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  avatar: string;
  description: string;
  skills: string[];
  status: "idle" | "working" | "sleeping";
  taskProgress: number;
  lastActive: string;
}

export interface MessageStep {
  id: string;
  agentId: string;
  agentName: string;
  action: string;
  status: "pending" | "running" | "completed" | "failed";
  details?: string;
  codeBlock?: {
    fileName: string;
    language: string;
    code: string;
  };
  searchQuery?: string;
  searchLinks?: { title: string; url: string }[];
}

export interface MessageAttachment {
  name: string;
  type: "file" | "image";
  base64?: string;
}

export interface Message {
  id: string;
  sender?: "user" | "ai";
  senderId: string;
  senderName: string;
  senderRole: "user" | "agent" | "system";
  content: string;
  timestamp: string;
  steps?: MessageStep[];
  codeFiles?: { fileName: string; language: string; content: string }[];
  sources?: { title: string; url: string }[];
  attachments?: MessageAttachment[];
  generationTimeMs?: number;
  actualModelUsed?: string;
}

export interface Chat {
  id: string;
  userId: string;
  userName: string;
  title: string;
  createdAt: string;
  messages: Message[];
  activeModel: string;
}

export interface SystemLog {
  id: string;
  timestamp: string;
  type: "info" | "success" | "warning" | "error";
  message: string;
  source: string;
}

export function safeFormatTime(dateInput: any, options?: Intl.DateTimeFormatOptions): string {
  try {
    if (!dateInput) return "--:--";
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) {
      return "--:--";
    }
    return d.toLocaleTimeString("fr-FR", options || { hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    return "--:--";
  }
}

export function safeFormatDate(dateInput: any, options?: Intl.DateTimeFormatOptions): string {
  try {
    if (!dateInput) return "--/--/----";
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) {
      return "--/--/----";
    }
    return d.toLocaleDateString("fr-FR", options);
  } catch (e) {
    return "--/--/----";
  }
}
