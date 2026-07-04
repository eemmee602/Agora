import { GoogleGenAI } from "@google/genai";
import { OpenAI } from "openai";

interface ProviderConfig {
  name: string;
  key: string | undefined;
  model: string;
  call: (prompt: string) => Promise<string>;
}

function getGoogleClient(): GoogleGenAI | null {
  const key = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!key || key.length < 30) return null;
  return new GoogleGenAI({ apiKey: key });
}

function getOpenAIClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

async function callGoogle(prompt: string): Promise<string> {
  const client = getGoogleClient();
  if (!client) throw new Error("Google key missing");
  const result = await client.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });
  const text = result.text;
  if (!text) throw new Error("Réponse vide de Gemini");
  return text;
}

async function callOpenAI(prompt: string): Promise<string> {
  const client = getOpenAIClient();
  if (!client) throw new Error("OpenAI key missing");
  const resp = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    max_tokens: 1024,
  });
  const text = resp.choices[0]?.message?.content;
  if (!text) throw new Error("Réponse vide d'OpenAI");
  return text;
}

async function callOpenRouter(prompt: string): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OpenRouter key missing");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": process.env.VERCEL_URL || "https://agora-ai-clean.vercel.app",
      "X-Title": "Agora AI Clean",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-preview:thinking",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 1024,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const message = data?.choices?.[0]?.message?.content;
  if (!message) throw new Error("Réponse vide d'OpenRouter");
  return message;
}

async function callMistral(prompt: string): Promise<string> {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) throw new Error("Mistral key missing");
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "mistral-small-latest",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 1024,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mistral ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const message = data?.choices?.[0]?.message?.content;
  if (!message) throw new Error("Réponse vide de Mistral");
  return message;
}

async function callCohere(prompt: string): Promise<string> {
  const key = process.env.COHERE_API_KEY;
  if (!key) throw new Error("Cohere key missing");
  const res = await fetch("https://api.cohere.ai/v2/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "command-r7b-12-2024",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cohere ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const message = data?.message?.content?.[0]?.text || data?.text;
  if (!message) throw new Error("Réponse vide de Cohere");
  return message;
}

export async function callLLMWithFallback(prompt: string): Promise<{ text: string; provider: string }> {
  const providers: ProviderConfig[] = [
    { name: "google", key: process.env.GOOGLE_API_KEY, model: "gemini-2.5-flash", call: callGoogle },
    { name: "openai", key: process.env.OPENAI_API_KEY, model: "gpt-4o-mini", call: callOpenAI },
    { name: "openrouter", key: process.env.OPENROUTER_API_KEY, model: "google/gemini-2.5-flash-preview:thinking", call: callOpenRouter },
    { name: "mistral", key: process.env.MISTRAL_API_KEY, model: "mistral-small-latest", call: callMistral },
    { name: "cohere", key: process.env.COHERE_API_KEY, model: "command-r7b-12-2024", call: callCohere },
  ];

  let lastError: Error | null = null;
  for (const provider of providers) {
    if (!provider.key) continue;
    try {
      const text = await provider.call(prompt);
      return { text, provider: provider.name };
    } catch (err: any) {
      console.error(`[Agora] ${provider.name} failed:`, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error("Aucune clé API LLM disponible.");
}