import React, { useState, useEffect, useRef } from "react";
import { Play, Maximize2, Minimize2, Terminal, Code2, Copy, Check, Eye, RefreshCw, X, Download } from "lucide-react";

interface CodeExecutorProps {
  key?: any;
  code: string;
  language: string;
}

export default function CodeExecutor({ code, language }: CodeExecutorProps) {
  const [activeTab, setActiveTab] = useState<"code" | "preview">("code");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [version, setVersion] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  };

  const reloadPreview = () => {
    setVersion(v => v + 1);
  };

  const downloadCode = () => {
    // Determine appropriate file extension
    let ext = "txt";
    const cleanLang = language.toLowerCase().trim();
    if (cleanLang === "html") ext = "html";
    else if (cleanLang === "javascript" || cleanLang === "js") ext = "js";
    else if (cleanLang === "lua") ext = "lua";
    else if (cleanLang === "css") ext = "css";
    else if (cleanLang === "python" || cleanLang === "py") ext = "py";

    const filename = `code_agora.${ext}`;
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Build the SrcDoc depending on the language
  const getSrcDoc = () => {
    const cleanLang = language.toLowerCase().trim();
    if (cleanLang === "html") {
      // Add a modern dark styling fallback and inject Tailwind + Font Awesome if needed, or keep it standard
      return `
        <!DOCTYPE html>
        <html lang="fr">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Aperçu HTML</title>
          <script>
            // Override fetch to bypass CORS via our server-side proxy
            const originalFetch = window.fetch;
            window.fetch = function(input, init) {
              let url = "";
              if (typeof input === "string") {
                url = input;
              } else if (input && typeof input === "object" && input.url) {
                url = input.url;
              }
              if (url && (url.startsWith("http://") || url.startsWith("https://")) && !url.includes(window.location.host)) {
                const proxyUrl = "/api/proxy?url=" + encodeURIComponent(url);
                return originalFetch(proxyUrl, init);
              }
              return originalFetch(input, init);
            };
          </script>
          <script src="https://unpkg.com/@tailwindcss/browser@4"></script>
          <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
          <style>
            body {
              margin: 0;
              padding: 16px;
              font-family: system-ui, -apple-system, sans-serif;
              background-color: #0d0e12;
              color: #f3f4f6;
            }
          </style>
        </head>
        <body>
          ${code}
        </body>
        </html>
      `;
    }

    if (cleanLang === "javascript" || cleanLang === "js") {
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              background: #0d0e12;
              color: #38bdf8;
              font-family: 'Courier New', Courier, monospace;
              padding: 16px;
              margin: 0;
              font-size: 13px;
              line-height: 1.5;
            }
            #console { white-space: pre-wrap; word-break: break-all; }
            .log-line { border-bottom: 1px solid #1e293b; padding: 4px 0; }
            .system-line { color: #64748b; font-style: italic; }
            .error-line { color: #f43f5e; font-weight: bold; }
          </style>
        </head>
        <body>
          <div id="console"><div class="log-line system-line">[Console Virtuelle JavaScript initialisée]</div></div>
          <script>
            const consoleDiv = document.getElementById('console');

            function printLine(text, className = 'log-line') {
              const div = document.createElement('div');
              div.className = className;
              div.innerText = text;
              consoleDiv.appendChild(div);
              window.scrollTo(0, document.body.scrollHeight);
            }

            // Override fetch to bypass CORS via our server-side proxy
            const originalFetch = window.fetch;
            window.fetch = function(input, init) {
              let url = "";
              if (typeof input === "string") {
                url = input;
              } else if (input && typeof input === "object" && input.url) {
                url = input.url;
              }
              if (url && (url.startsWith("http://") || url.startsWith("https://")) && !url.includes(window.location.host)) {
                const proxyUrl = "/api/proxy?url=" + encodeURIComponent(url);
                printLine("[CORS Proxy] Redirection de fetch : " + url, "log-line system-line");
                return originalFetch(proxyUrl, init);
              }
              return originalFetch(input, init);
            };

            // Capture console.log
            const originalLog = console.log;
            console.log = function(...args) {
              printLine(args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' '));
              originalLog.apply(console, args);
            };

            // Capture errors
            window.onerror = function(message, source, lineno, colno, error) {
              printLine(`Erreur Ligne ${lineno}: ${message}`, 'log-line error-line');
              return true;
            };

            try {
              ${code}
            } catch (err) {
              printLine(`Erreur d'exécution: ${err.message}`, 'log-line error-line');
            }
          </script>
        </body>
        </html>
      `;
    }

    if (cleanLang === "lua") {
      // Lua execution with Fengari VM
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <script src="https://cdn.jsdelivr.net/npm/fengari-web@0.1.4/dist/fengari-web.js" type="text/javascript"></script>
          <style>
            body {
              background: #090a0f;
              color: #22c55e;
              font-family: 'Consolas', 'Courier New', monospace;
              padding: 16px;
              margin: 0;
              font-size: 13px;
              line-height: 1.6;
            }
            #console { white-space: pre-wrap; word-break: break-all; }
            .log { border-bottom: 1px solid #111827; padding: 4px 0; }
            .sys { color: #4b5563; font-style: italic; }
            .err { color: #ef4444; font-weight: bold; }
            .api { color: #a855f7; }
          </style>
        </head>
        <body>
          <div id="console"><div class="log sys">[Interpréteur Lua 5.3 Virtuel - Fengari VM initialisé]</div></div>
          <script type="text/javascript">
            const consoleDiv = document.getElementById('console');

            window.printToConsole = function(text, type = 'log') {
              const div = document.createElement('div');
              div.className = \`log \${type}\`;
              div.innerText = text;
              consoleDiv.appendChild(div);
              window.scrollTo(0, document.body.scrollHeight);
            };
          </script>
          <script type="application/lua">
            local js = require "js"
            local window = js.global

            -- Override print to output to interactive terminal console
            function print(...)
              local args = {...}
              local str_parts = {}
              for i, v in ipairs(args) do
                table.insert(str_parts, tostring(v))
              end
              window:printToConsole(table.concat(str_parts, "   "), "log")
            end

            -- Virtual game/framework compatibility mocks
            -- ROBLOX
            game = {
              GetService = function(self, serviceName)
                window:printToConsole("[Roblox Virtual API] game:GetService('" .. tostring(serviceName) .. "')", "api")
                return setmetatable({}, {
                  __index = function(t, k)
                    return function(...)
                      local args = {...}
                      local s = ""
                      for idx, val in ipairs(args) do
                        s = s .. tostring(val) .. (idx < #args && ", " || "")
                      end
                      window:printToConsole("[Roblox Virtual API] ServiceAction: " .. tostring(k) .. "(" .. s .. ")", "api")
                      return t
                    end
                  end
                })
              end,
              Players = {
                LocalPlayer = { Name = "Emerick", UserId = 12345678 }
              }
            }

            Instance = {
              new = function(className, parent)
                window:printToConsole("[Roblox Virtual API] Instance.new('" .. tostring(className) .. "')", "api")
                return setmetatable({ Name = className, Parent = parent }, {
                  __index = function(t, k)
                    return function() return t end
                  end
                })
              end
            }

            -- FIVEM / CITIZEN FX
            function TriggerEvent(eventName, ...)
              local args = {...}
              local s = ""
              for idx, val in ipairs(args) do
                s = s .. tostring(val) .. (idx < #args && ", " || "")
              end
              window:printToConsole("[FiveM Native] TriggerEvent('" .. eventName .. "', " .. s .. ")", "api")
            end

            function RegisterNetEvent(eventName)
              window:printToConsole("[FiveM Native] RegisterNetEvent('" .. eventName .. "')", "api")
            end

            function RegisterCommand(commandName, handler, restricted)
              window:printToConsole("[FiveM Command] Commande enregistrée : /" .. commandName, "api")
            end

            -- Execute user code safely
            local success, err = pcall(function()
              ${code}
            end)

            if not success then
              window:printToConsole("[Erreur d'exécution Lua]: " .. tostring(err), "err")
            end
          </script>
        </body>
        </html>
      `;
    }

    return "";
  };

  const renderHeader = () => {
    return (
      <div className="px-4 py-2.5 bg-gray-900 border-b border-white/5 flex items-center justify-between select-none">
        <div className="flex items-center space-x-2">
          <div className="flex space-x-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500/80 block" />
            <span className="w-3 h-3 rounded-full bg-yellow-500/80 block" />
            <span className="w-3 h-3 rounded-full bg-green-500/80 block" />
          </div>
          <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-gray-400 bg-white/5 px-2 py-0.5 rounded ml-2 border border-white/5">
            {language}
          </span>
        </div>

        <div className="flex items-center space-x-1">
          {/* Action Tabs */}
          {(() => {
            const cleanLang = language.toLowerCase().trim();
            const isRunnable = cleanLang === "html" || cleanLang === "lua" || cleanLang === "javascript" || cleanLang === "js";
            if (!isRunnable) return null;
            return (
              <div className="flex bg-black/40 p-0.5 rounded-lg border border-white/5 mr-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("code")}
                  className={`px-3 py-1 rounded-md text-[10px] font-bold tracking-wide uppercase transition_all cursor-pointer flex items-center space-x-1 ${activeTab === "code" ? "bg-indigo-600/30 text-white border border-indigo-500/30 shadow-md shadow-indigo-600/5" : "text-gray-400 hover:text-white"}`}
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>Code</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("preview");
                  }}
                  className={`px-3 py-1 rounded-md text-[10px] font-bold tracking-wide uppercase transition_all cursor-pointer flex items-center space-x-1.5 ${activeTab === "preview" ? "bg-emerald-600/30 text-white border border-emerald-500/30 shadow-md shadow-emerald-600/5" : "text-gray-400 hover:text-white"}`}
                >
                  {language === "html" ? <Eye className="w-3.5 h-3.5" /> : <Terminal className="w-3.5 h-3.5" />}
                  <span>{language === "html" ? "Aperçu" : "Exécuter"</span>}
                </button>
              </div>
            );
          })()}

          {/* Refresh/Reload Preview (only when in preview mode) */}
          {(() => {
            const cleanLang = language.toLowerCase().trim();
            const isRunnable = cleanLang === "html" || cleanLang === "lua" || cleanLang === "javascript" || cleanLang === "js";
            if (!isRunnable || activeTab !== "preview") return null;
            return (
              <button
                type="button"
                onClick={reloadPreview}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition_all cursor-pointer"
                title="Recharger l'exécution"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            );
          })()}};

          {/* Download Button */}
          <button
            type="button"
            onClick={downloadCode}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition_all cursor-pointer flex items-center"
            title="Télécharger le fichier"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          {/* Copy Button */}
          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition_all cursor-pointer flex items-center"
            title="Copier le code"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          {/* Fullscreen Button */}
          {(() => {
            const cleanLang = language.toLowerCase().trim();
            const isRunnable = cleanLang === "html" || cleanLang === "lua" || cleanLang === "javascript" || cleanLang === "js";
            if (!isRunnable) return null;
            return (
              <button
                type="button"
                onClick={() => {
                  setIsFullscreen(!isFullscreen);
                }}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition_all cursor-pointer flex items-center"
                title="Plein écran"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            );
          })()}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="relative w-full h-full bg-black/50 rounded-2xl border border-white/5 overflow-hidden flex flex-col">
        {renderHeader()}
        <div className="flex-1 relative">
          {activeTab === "code" && (
            <div className="flex-1 p-4 bg-black/80">
              <div className="flex-1 relative w-full h-full">
                <div className="relative w-full h-full overflow-auto p-4 bg-black/90">
                  <pre className="whitespace-pre-wrap bg-black/90 text-[12px] font-mono text-gray-300">
                    <code>{code}</code>
                  </pre>
                </div>
              </div>
            </div>
          )}
          {activeTab === "preview" && (
            <div className="flex-1 w-full h-full relative bg-black">
              <iframe
                ref={iframeRef}
                key={`${language}||${code}||${version}`}
                srcDoc={getSrcDoc()}
                className="w-full h-full border-none bg-black"
                sandbox="allow-scripts"
                title="sandbox-executor"
              />
              {isFullscreen && (
                <button
                  className="absolute top-2 right-2 z-10 p-1 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition_all cursor-pointer"
                  onClick={() => setIsFullscreen(false)}
                >
                  <Minimize2 className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {isFullscreen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="relative w-full h-full bg-black/50 rounded-2xl border border-white/5 overflow-hidden flex flex-col max-w-6xl max-h-[90vh]">
            {renderHeader()}
            <div className="flex-1 relative">
              {activeTab === "code" && (
                <div className="flex-1 p-4 bg-black/80">
                  <div className="flex-1 relative w-full h-full">
                    <div className="relative w-full h-full overflow-auto p-4 bg-black/90">
                      <pre className="whitespace-pre-wrap bg-black/90 text-[12px] font-mono text-gray-300">
                        <code>{code}</code>
                      </pre>
                    </div>
                  </div>
                )
              )}
              {activeTab === "preview" && (
                <div className="flex-1 w-full h-full relative bg-black">
                  <iframe
                    ref={iframeRef}
                    key={`${language}||${code}||${version}`}
                    srcDoc={getSrcDoc()}
                    className="w-full h-full border-none bg-black"
                    sandbox="allow-scripts"
                    title="fullscreen-sandbox-executor"
                  />
                </div>
              )}
            </div>
            <button
              className="absolute top-2 right-2 z-10 p-1 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition_all cursor-pointer"
              onClick={() => setIsFullscreen(false)}
            >
              <Minimize2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}