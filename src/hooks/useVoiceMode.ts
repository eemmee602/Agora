import { useState, useEffect, useRef, useCallback } from "react";

/**
 * useVoiceMode — Mode vocal bidirectionnel pour Agora AI
 *
 * 1. Active la reconnaissance vocale continue (fr-FR)
 * 2. Quand l'utilisateur parle → transcrit → onTranscript callback
 * 3. speak() utilise speechSynthesis pour lire la réponse de l'IA
 * 4. Quand l'IA parle, l'écoute se met en pause automatiquement
 * 5. Quand l'IA finit de parler, l'écoute reprend
 * 6. Mode off → tout s'arrête proprement, la conversation écrite continue
 */

interface VoiceModeState {
  isActive: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  interimText: string;
  error: string | null;
}

interface VoiceModeCallbacks {
  onTranscript: (text: string) => void;
  onAISpeakingChange?: (speaking: boolean) => void;
}

export function useVoiceMode(callbacks: VoiceModeCallbacks) {
  const [isActive, setIsActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const isPausedRef = useRef(false);
  const shouldRestartRef = useRef(false);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  // Stable transcript ref to avoid stale closures
  const onTranscriptRef = useRef(callbacks.onTranscript);
  onTranscriptRef.current = callbacks.onTranscript;

  // Track whether we're currently speaking (to pause listening)
  const speakingRef = useRef(false);

  // Track the active audio element for TTS (Groq TTS or fallback)
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const maxSpeechTimeoutRef = useRef<number | null>(null);

  // Check browser support
  const isSupported =
    typeof window !== "undefined" &&
    (("webkitSpeechRecognition" in window) || ("SpeechRecognition" in window));

  // Preload voices (Chrome loads them async — retry until loaded)
  const voicesReadyRef = useRef(false);
  useEffect(() => {
    if (!isSupported) return;
    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length > 0) {
        voicesReadyRef.current = true;
      }
    };
    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    // Retry every 250ms for up to 3s (Chrome sometimes loads very late)
    let retries = 0;
    const retryInt = setInterval(() => {
      if (voicesReadyRef.current || retries >= 12) {
        clearInterval(retryInt);
        return;
      }
      loadVoices();
      retries++;
    }, 250);
    return () => clearInterval(retryInt);
  }, [isSupported]);

  // Build recognition instance
  const buildRecognition = useCallback(() => {
    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return null;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "fr-FR";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      let interim = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      if (interim) {
        setInterimText(interim);
      }

      if (finalTranscript.trim()) {
        setInterimText("");
        const cleaned = finalTranscript.trim();
        // Avoid duplicates within 1.5s
        if (cleaned.length > 1) {
          onTranscriptRef.current(cleaned);
        }
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === "no-speech") {
        // Normal — just means silence, recognition will restart
        return;
      }
      if (event.error === "aborted") {
        // Normal — we stopped it intentionally
        return;
      }
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Microphone bloqué. Autorisez l'accès au micro dans votre navigateur.");
        setIsActive(false);
        return;
      }
      console.warn("Speech recognition error:", event.error);
    };

    recognition.onend = () => {
      setIsListening(false);
      // Auto-restart if voice mode is still active and we weren't paused by TTS
      if (shouldRestartRef.current && !isPausedRef.current) {
        try {
          recognition.start();
          setIsListening(true);
        } catch (e) {
          // start() can throw if already started — ignore
        }
      }
    };

    return recognition;
  }, []);

  // Toggle voice mode on/off
  const toggleVoiceMode = useCallback(() => {
    if (!isSupported) {
      setError("Mode vocal non supporté par ce navigateur. Utilisez Chrome ou Edge.");
      return;
    }

    if (isActive) {
      // Turn OFF
      shouldRestartRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // ignore
        }
      }
      window.speechSynthesis.cancel();
      setIsActive(false);
      setIsListening(false);
      setIsSpeaking(false);
      setInterimText("");
      speakingRef.current = false;
    } else {
      // Turn ON
      setError(null);
      const recognition = buildRecognition();
      if (!recognition) {
        setError("Reconnaissance vocale non disponible.");
        return;
      }
      recognitionRef.current = recognition;
      shouldRestartRef.current = true;
      isPausedRef.current = false;
      try {
        recognition.start();
        setIsListening(true);
      } catch (e) {
        // If already running, stop first then start
        try {
          recognition.stop();
        } catch (e2) {}
        setTimeout(() => {
          try {
            recognition.start();
            setIsListening(true);
          } catch (e2) {}
        }, 200);
      }
      setIsActive(true);
    }
  }, [isActive, isSupported, buildRecognition]);

  // Speak text via TTS — pauses listening during speech, resumes after
  const speak = useCallback(async (text: string) => {
    if (!isActive || !text.trim()) return;

    // Clean text: remove markdown, code blocks, tool context, memory tags, etc.
    const cleanText = text
      .replace(/```[\s\S]*?```/g, " bloc de code ")
      .replace(/`[^`]+`/g, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/==([^=]+)==/g, "$1")
      .replace(/[#*`_~]/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\[CONTEXTE OUTILS PRÉCÉDENTS\][\s\S]*$/i, "") // Remove persisted tool context
      .replace(/\[OUTIL:[^\]]+\]/g, "") // Remove tool log entries
      .replace(/\u003cmemory_add[^\u003e]*\u003e[\s\S]*?\u003c\/memory_add\u003e/gi, "") // Remove memory add tags
      .replace(/\u003cmemory_delete\u003e[^\]]*?\u003c\/memory_delete\u003e/gi, "") // Remove memory delete tags
      .replace(/\u003cupdate_title\u003e[\s\S]*?\u003c\/update_title\u003e/gi, "") // Remove title tags
      .replace(/\u003cupdate_memory\u003e[\s\S]*?\u003c\/update_memory\u003e/gi, "") // Remove old memory tags
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (!cleanText) return;

    // Cancel any ongoing speech/audio
    audioRef.current?.pause();
    audioRef.current = null;
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (maxSpeechTimeoutRef.current) {
      window.clearTimeout(maxSpeechTimeoutRef.current);
      maxSpeechTimeoutRef.current = null;
    }

    // Pause listening while speaking
    isPausedRef.current = true;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
    setIsSpeaking(true);
    setIsListening(false);
    speakingRef.current = true;
    callbacksRef.current.onAISpeakingChange?.(true);

    const resumeListening = () => {
      if (maxSpeechTimeoutRef.current) {
        window.clearTimeout(maxSpeechTimeoutRef.current);
        maxSpeechTimeoutRef.current = null;
      }
      setIsSpeaking(false);
      speakingRef.current = false;
      callbacksRef.current.onAISpeakingChange?.(false);
      isPausedRef.current = false;
      if (shouldRestartRef.current && recognitionRef.current) {
        try {
          recognitionRef.current.start();
          setIsListening(true);
        } catch (e) {}
      }
    };

    // Try server TTS first (natural voice via OpenRouter Grok Voice TTS)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cleanText }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const blob = await response.blob();
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
          resumeListening();
        };

        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
          resumeListening();
        };

        // CRITICAL: safety timeout so isSpeaking never stays stuck forever
        maxSpeechTimeoutRef.current = window.setTimeout(() => {
          audio.pause();
          audio.currentTime = 0;
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
          resumeListening();
        }, 30000);

        await audio.play();
        return;
      }
      // response not ok → fall through to speechSynthesis fallback
    } catch (e) {
      // network/error → fall through to speechSynthesis fallback
    }

    // Fallback to native speechSynthesis
    if (!("speechSynthesis" in window)) {
      resumeListening();
      return;
    }

    // Only chunk if text is very long; Groq handles long text, but for the fallback
    // keep chunking small enough for speechSynthesis
    const chunks: string[] = [];
    const maxChunk = cleanText.length > 2000 ? 500 : 200;
    const sentences = cleanText.match(/[^.!?]+[.!?]*/g) || [cleanText];
    let currentChunk = "";
    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > maxChunk) {
        if (currentChunk) chunks.push(currentChunk);
        currentChunk = sentence;
      } else {
        currentChunk += sentence;
      }
    }
    if (currentChunk) chunks.push(currentChunk);

    let chunkIndex = 0;

    const speakChunk = () => {
      if (chunkIndex >= chunks.length) {
        resumeListening();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(chunks[chunkIndex]);
      utterance.lang = "fr-FR";
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      let voices = window.speechSynthesis.getVoices();
      if (voices.length === 0) {
        window.speechSynthesis.getVoices();
        voices = window.speechSynthesis.getVoices();
      }
      const frVoice =
        voices.find((v) => v.name.includes("Google") && v.lang === "fr-FR")
        || voices.find((v) => v.lang === "fr-FR" && v.localService && v.name.includes("Amelie"))
        || voices.find((v) => v.lang === "fr-FR" && v.localService && v.name.includes("Thomas"))
        || voices.find((v) => v.lang === "fr-FR" && v.localService)
        || voices.find((v) => v.lang === "fr-FR")
        || voices.find((v) => v.lang.startsWith("fr"))
        || voices.find((v) => v.lang === "fr" || v.lang === "fr_CA" || v.lang === "fr-BE");
      if (frVoice) {
        utterance.voice = frVoice;
      }
      if (!frVoice) {
        utterance.lang = "fr-FR";
      }
      utterance.volume = 1;

      utterance.onend = () => {
        chunkIndex++;
        speakChunk();
      };

      utterance.onerror = () => {
        chunkIndex++;
        speakChunk();
      };

      window.speechSynthesis.speak(utterance);
    };

    // CRITICAL: safety timeout so isSpeaking never stays stuck forever
    maxSpeechTimeoutRef.current = window.setTimeout(() => {
      window.speechSynthesis.cancel();
      resumeListening();
    }, 30000);

    speakChunk();
  }, [isActive]);

  // Stop speaking (if user interrupts)
  const stopSpeaking = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current && (audioRef.current.currentTime = 0);
    audioRef.current = null;
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (maxSpeechTimeoutRef.current) {
      window.clearTimeout(maxSpeechTimeoutRef.current);
      maxSpeechTimeoutRef.current = null;
    }
    setIsSpeaking(false);
    speakingRef.current = false;
    isPausedRef.current = false;
    if (shouldRestartRef.current && recognitionRef.current) {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {}
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      shouldRestartRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
      audioRef.current?.pause();
      audioRef.current = null;
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      if (maxSpeechTimeoutRef.current) {
        window.clearTimeout(maxSpeechTimeoutRef.current);
      }
    };
  }, []);

  return {
    isActive,
    isListening,
    isSpeaking,
    interimText,
    error,
    isSupported,
    toggleVoiceMode,
    speak,
    stopSpeaking,
  };
}