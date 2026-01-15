"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  const { messages, isProcessing, addMessage, setIsProcessing, updateLastMessage } =
    useChatStore();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (messageText?: string) => {
    const text = messageText || input;
    if (!text.trim() || isProcessing) return;

    // Add user message
    addMessage({ role: "user", content: text });
    setInput("");
    setIsProcessing(true);

    // Add loading message
    addMessage({ role: "assistant", content: "", isLoading: true });

    // Simulate AI response (replace with actual API call)
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Update with response
    const responses: Record<string, string> = {
      "Revisa si hay nuevos emails con adjuntos para procesar": `🔍 **Revisando bandeja de entrada...**

Encontré **1 email** con adjuntos pendientes de procesar:

📧 **Email:** factura personal
- **De:** Ivan Meyer <ivanmeyer1991@gmail.com>
- **Adjunto:** factura-personal.pdf (1.5 MB)
- **Fecha:** Hace 30 minutos

¿Quieres que procese este documento ahora?`,
      "Procesa todos los documentos pendientes y dame un resumen": `✅ **Procesamiento completado**

He procesado **1 documento** nuevo:

📄 **factura-personal.pdf**
- Tipo: Factura de servicios (Personal Flow)
- Confianza: 79.3%
- Datos extraídos: 65 campos
- Tablas detectadas: 6

**Datos clave encontrados:**
- 💰 Total a pagar: $27,131.51
- 📅 Vencimiento: 05/01/2026
- 📱 Línea: (3492) 606992
- 💳 Saldo a favor: $14,014.67

Los datos fueron guardados en la base de datos.`,
      "Muéstrame las estadísticas de extracción de documentos": `📊 **Estadísticas de Extracción**

**Últimos 30 días:**
- 📄 Total documentos: 24
- ✅ Completados: 21 (87.5%)
- ❌ Errores: 3 (12.5%)
- 📈 Confianza promedio: 87.5%

**Por tipo de documento:**
- Facturas: 15
- Estados de cuenta: 6
- Comprobantes: 3

**Tendencia:** +12% más documentos que el mes anterior.`,
      default: `Entendido. Voy a procesar tu solicitud.

Para ejecutar acciones, el agente ADK necesita estar activo. Actualmente hay un límite de cuota en la API de Gemini.

**Estado de los servicios:**
- ✅ Gmail API: Conectado
- ✅ AWS Textract: Activo
- ✅ PostgreSQL: Conectado
- ⚠️ Google ADK: Cuota limitada

¿Hay algo más en lo que pueda ayudarte?`,
    };

    const response = responses[text] || responses.default;
    updateLastMessage(response);
    setIsProcessing(false);
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
        className="mb-6"
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
      </motion.div>

      {/* Chat Area */}
      <Card className="flex-1 bg-slate-900/50 backdrop-blur-xl border-slate-800 flex flex-col overflow-hidden">
        <ScrollArea className="flex-1 p-6" ref={scrollRef}>
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
            </div>
          )}
        </ScrollArea>

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
          {isUser ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>

      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-3",
          isUser
            ? "bg-cyan-500/20 border border-cyan-500/30"
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
                strong: ({ children }) => <strong className="font-semibold text-cyan-300">{children}</strong>,
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
    </motion.div>
  );
}
