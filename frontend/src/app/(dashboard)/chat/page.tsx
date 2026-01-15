"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
// ScrollArea removed - using native overflow-y-auto for better compatibility
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Send,
  Sparkles,
  User,
  Loader2,
  Mail,
  FileText,
  Database,
  Zap,
  RotateCcw,
  Bot,
  Cpu,
} from "lucide-react";
import { useChatStore, ChatMessage } from "@/lib/store";
import { cn } from "@/lib/utils";

const suggestedPrompts = [
  {
    icon: Mail,
    title: "Revisar emails",
    prompt: "Revisa si hay nuevos emails con adjuntos para procesar",
  },
  {
    icon: FileText,
    title: "Procesar documentos",
    prompt: "Procesa todos los documentos pendientes y dame un resumen",
  },
  {
    icon: Database,
    title: "Estadísticas",
    prompt: "Muéstrame las estadísticas de extracción de documentos",
  },
  {
    icon: Zap,
    title: "Último documento",
    prompt: "¿Cuál fue el último documento procesado y qué datos se extrajeron?",
  },
];

export default function ChatPage() {
  const { messages, isProcessing, suggestions, geminiStatus, addMessage, setIsProcessing, updateLastMessage, setSuggestions, setGeminiStatus, clearMessages } =
    useChatStore();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, suggestions]);

  const handleSend = async (messageText?: string) => {
    const text = messageText || input;
    if (!text.trim() || isProcessing) return;

    // Add user message
    addMessage({ role: "user", content: text });
    setInput("");
    setIsProcessing(true);
    setSuggestions([]); // Clear suggestions while processing

    // Add loading message
    addMessage({ role: "assistant", content: "", isLoading: true });

    try {
      // Call the real API
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      if (!response.ok) {
        throw new Error("API error");
      }

      const data = await response.json();
      updateLastMessage(data.message, data.suggestions || [], data.fromGemini);
      setGeminiStatus(data.geminiStatus || null);
    } catch (error) {
      console.error("Chat error:", error);
      updateLastMessage(
        "❌ Hubo un error al procesar tu mensaje. Por favor, intenta de nuevo.",
        ["Ayuda", "Estado del sistema"],
        false
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30">
            <Sparkles className="h-6 w-6 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Chat con el Agente</h1>
            <p className="text-slate-400 text-sm">
              Interactúa con el agente ADK para procesar documentos
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={clearMessages}
            className="border-slate-700 text-slate-400 hover:text-white hover:border-slate-600"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Nueva conversación
          </Button>
        )}
      </motion.div>

      {/* Chat Area */}
      <Card className="flex-1 bg-slate-900/50 backdrop-blur-xl border-slate-800 flex flex-col overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto p-6" ref={scrollRef}>
          {messages.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="h-full flex flex-col items-center justify-center"
            >
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center mb-6">
                <Sparkles className="h-10 w-10 text-cyan-400" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">
                ¿En qué puedo ayudarte?
              </h2>
              <p className="text-slate-400 text-center max-w-md mb-8">
                Puedo revisar emails, procesar documentos adjuntos, extraer
                datos y mostrarte estadísticas.
              </p>

              {/* Suggested Prompts */}
              <div className="grid grid-cols-2 gap-3 max-w-2xl">
                {suggestedPrompts.map((prompt, index) => (
                  <motion.button
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    onClick={() => handleSend(prompt.prompt)}
                    className="flex items-start gap-3 p-4 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-cyan-500/50 hover:bg-slate-800 transition-all text-left group"
                  >
                    <div className="p-2 rounded-lg bg-slate-700 group-hover:bg-cyan-500/20 transition-colors">
                      <prompt.icon className="h-4 w-4 text-slate-400 group-hover:text-cyan-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">
                        {prompt.title}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {prompt.prompt}
                      </p>
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          ) : (
            <div className="space-y-6">
              <AnimatePresence>
                {messages.map((message, index) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
              </AnimatePresence>
              
              {/* Quick Replies - Sugerencias después del último mensaje */}
              {suggestions.length > 0 && !isProcessing && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-wrap gap-2 ml-11"
                >
                  {suggestions.map((suggestion, index) => (
                    <motion.button
                      key={index}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.05 }}
                      onClick={() => handleSend(suggestion)}
                      className="px-3 py-1.5 text-sm rounded-full bg-slate-800/50 border border-slate-700 text-slate-300 hover:border-cyan-500/50 hover:text-cyan-400 hover:bg-slate-800 transition-all"
                    >
                      {suggestion}
                    </motion.button>
                  ))}
                </motion.div>
              )}
              {/* Scroll anchor */}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <CardContent className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Escribe un mensaje..."
              disabled={isProcessing}
              className="flex-1 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-cyan-500"
            />
            <Button
              onClick={() => handleSend()}
              disabled={!input.trim() || isProcessing}
              className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white shadow-lg shadow-cyan-500/20"
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn("flex gap-3", isUser && "flex-row-reverse")}
    >
      <Avatar
        className={cn(
          "h-8 w-8",
          isUser
            ? "bg-slate-700"
            : message.fromGemini
              ? "bg-gradient-to-br from-purple-500 to-pink-500"
              : "bg-gradient-to-br from-cyan-500 to-blue-500"
        )}
      >
        <AvatarFallback
          className={cn(
            isUser
              ? "bg-slate-700 text-white"
              : "bg-transparent text-white"
          )}
        >
          {isUser ? (
            <User className="h-4 w-4" />
          ) : message.fromGemini ? (
            <Bot className="h-4 w-4" />
          ) : (
            <Cpu className="h-4 w-4" />
          )}
        </AvatarFallback>
      </Avatar>

      <div className="flex flex-col gap-1 max-w-[80%]">
        {/* Badge indicando fuente */}
        {!isUser && !message.isLoading && (
          <div className="flex items-center gap-1">
            {message.fromGemini ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center gap-1">
                <Bot className="h-2.5 w-2.5" />
                Gemini AI
              </span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-700/50 text-slate-400 border border-slate-600 flex items-center gap-1">
                <Cpu className="h-2.5 w-2.5" />
                Respuesta local
              </span>
            )}
          </div>
        )}
        
        <div
          className={cn(
            "rounded-2xl px-4 py-3",
            isUser
              ? "bg-cyan-500/20 border border-cyan-500/30"
              : message.fromGemini
                ? "bg-purple-900/30 border border-purple-500/30"
                : "bg-slate-800/50 border border-slate-700"
          )}
        >
          {message.isLoading ? (
            <div className="flex items-center gap-2 text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Pensando...</span>
            </div>
          ) : (
            <div className="text-sm text-white prose prose-invert prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0">
              <ReactMarkdown
                components={{
                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  strong: ({ children }) => (
                    <strong className={cn(
                      "font-semibold",
                      message.fromGemini ? "text-purple-300" : "text-cyan-300"
                    )}>
                      {children}
                    </strong>
                  ),
                  ul: ({ children }) => <ul className="list-disc list-inside space-y-1 my-2">{children}</ul>,
                  li: ({ children }) => <li className="text-slate-300">{children}</li>,
                  h1: ({ children }) => <h1 className="text-lg font-bold text-white mb-2">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-base font-bold text-white mb-2">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-sm font-bold text-white mb-1">{children}</h3>,
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
