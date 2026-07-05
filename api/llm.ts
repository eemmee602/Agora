import { GoogleGenAI } from "@google/genai";

async function callGoogleLLM(prompt: string, model: string = "gemini-1.5-flash"): Promise<string> {
  try {
    const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY || "" });
    const result = await genAI.models.generateContent({ model, contents: prompt });
    const text = result.text;
    if (!text) throw new Error("Empty response from Gemini");
    return text;
  } catch (err: any) {
    console.error("[Agora] Gemini error", err);
    throw new Error(`Google API error: ${err.message || "unknown"}`);
  }
}

async function callOpenAILLM(prompt: string): Promise<string> {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      }),
    });
    if (!response.ok) throw new Error(`OpenAI error: ${response.status}`);
    const data = await response.json();
    if (!data.choices?.[0]?.message?.content) throw new Error("Empty response from OpenAI");
    return data.choices[0].message.content;
  } catch (err: any) {
    console.error("[Agora] OpenAI failed:", err.message);
    throw new Error(`OpenAI API error: ${err.message || "unknown"}`);
  }
}

function routeModel(modelName: string): { provider: string; model: string } {
  if (modelName.startsWith("gemini")) return { provider: "google", model: modelName };
  if (modelName.startsWith("claude")) return { provider: "anthropic", model: modelName };
  if (modelName.startsWith("gpt")) return { provider: "openai", model: modelName };
  if (modelName.startsWith("deepseek")) return { provider: "deepseek", model: modelName };
  return { provider: "google", model: "gemini-1.5-flash" };
}

function parseTags(content: string): string[] {
  const tags: string[] = [];
  const regex = /#\w+/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    tags.push(match[0].toLowerCase());
  }
  return tags;
}

let lastError: Error | null = null;

async function callLLMWithFallback(prompt: string): Promise<string> {
  // Try Google
  if (process.env.GOOGLE_API_KEY) {
    try {
      return await callGoogleLLM(prompt);
    } catch (err: any) {
      console.error("[Agora] Google failed:", err.message);
      lastError = err;
    }
  }
  // Try OpenAI
  if (process.env.OPENAI_API_KEY) {
    try {
      return await callOpenAILLM(prompt);
    } catch (err: any) {
      console.error("[Agora] OpenAI failed:", err.message);
      lastError = err;
    }
  }
  // Try OpenRouter
  if (process.env.OPENROUTER_API_KEY) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "mistralai/mistral-7b-instruct:free",
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!response.ok) throw new Error(`OpenRouter error: ${response.status}`);
      const data = await response.json();
      if (!data.choices?.[0]?.message?.content) throw new Error("Empty response from OpenRouter");
      return data.choices[0].message.content;
    } catch (err: any) {
      console.error("[Agora] OpenRouter failed:", err.message);
      lastError = err;
    }
  }
  // Try Mistral
  if (process.env.MISTRAL_API_KEY) {
    try {
      const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "mistral-tiny",
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!response.ok) throw new Error(`Mistral error: ${response.status}`);
      const data = await response.json();
      if (!data.choices?.[0]?.message?.content) throw new Error("Empty response from Mistral");
      return data.choices[0].message.content;
    } catch (err: any) {
      console.error("[Agora] Mistral failed:", err.message);
      lastError = err;
    }
  }
  // Try Cohere
  if (process.env.COHERE_API_KEY) {
    try {
      const response = await fetch("https://api.cohere.ai/v1/chat", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.COHERE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "command",
          message: prompt,
        }),
      });
      if (!response.ok) throw new Error(`Cohere error: ${response.status}`);
      const data = await response.json();
      if (!data.text) throw new Error("Empty response from Cohere");
      return data.text;
    } catch (err: any) {
      console.error("[Agora] Cohere failed:", err.message);
      lastError = err;
    }
  }

  throw lastError || new Error("No API LLM key available");
}

export { callLLMWithFallback };