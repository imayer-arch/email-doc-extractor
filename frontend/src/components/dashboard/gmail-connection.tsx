"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mail, Link2, Unlink, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/lib/useUser";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000";

export function GmailConnection() {
  const { user, userId, isLoading, gmailConnected } = useUser();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [showNotification, setShowNotification] = useState<string | null>(null);

  // Check URL params for Gmail connection result
  useEffect(() => {
    const gmail = searchParams.get("gmail");
    if (gmail === "connected") {
      setShowNotification("Gmail conectado exitosamente");
      queryClient.invalidateQueries({ queryKey: ["user"] });
      // Clean URL
      window.history.replaceState({}, "", "/dashboard");
    } else if (gmail === "error") {
      const reason = searchParams.get("reason");
      setShowNotification(`Error al conectar Gmail: ${reason || "unknown"}`);
      window.history.replaceState({}, "", "/dashboard");
    }
  }, [searchParams, queryClient]);

  // Connect Gmail mutation
  const connectGmail = useMutation({
    mutationFn: async () => {
      if (!userId) {
        throw new Error("User not synced yet");
      }
      
      const url = `${BACKEND_URL}/api/auth/gmail/url?userId=${userId}`;
      console.log("Fetching OAuth URL for user:", userId);
      
      const res = await fetch(url);
      
      if (!res.ok) {
        const error = await res.text();
        throw new Error(`Failed to get OAuth URL: ${error}`);
      }
      
      const data = await res.json();
      window.location.href = data.url;
    },
    onError: (error) => {
      console.error("Connect Gmail error:", error);
      setShowNotification(`Error: ${error.message}`);
    },
  });

  // Disconnect Gmail mutation
  const disconnectGmail = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("User not synced");
      const res = await fetch(`${BACKEND_URL}/api/auth/gmail/disconnect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error("Failed to disconnect Gmail");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user"] });
      setShowNotification("Gmail desconectado");
    },
  });

  const isConnected = gmailConnected;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
    >
      <Card className="bg-slate-900/50 backdrop-blur-xl border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-white flex items-center gap-2">
            <Mail className="h-5 w-5 text-cyan-400" />
            Conexión Gmail
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">Estado</span>
            {isLoading ? (
              <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Cargando...
              </Badge>
            ) : isConnected ? (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                <CheckCircle className="h-3 w-3 mr-1" />
                Conectado
              </Badge>
            ) : (
              <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                <AlertCircle className="h-3 w-3 mr-1" />
                No conectado
              </Badge>
            )}
          </div>

          {/* Email */}
          {user?.email && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Cuenta</span>
              <span className="text-sm text-white">{user.email}</span>
            </div>
          )}

          {/* Action Button */}
          <div className="pt-2">
            {isConnected ? (
              <Button
                variant="outline"
                className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                onClick={() => disconnectGmail.mutate()}
                disabled={disconnectGmail.isPending}
              >
                {disconnectGmail.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Unlink className="h-4 w-4 mr-2" />
                )}
                Desconectar Gmail
              </Button>
            ) : (
              <Button
                className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white"
                onClick={() => connectGmail.mutate()}
                disabled={connectGmail.isPending}
              >
                {connectGmail.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4 mr-2" />
                )}
                Conectar Gmail
              </Button>
            )}
          </div>

          {/* Notification */}
          {showNotification && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`text-sm p-2 rounded ${
                showNotification.includes("Error")
                  ? "bg-red-500/20 text-red-400"
                  : "bg-green-500/20 text-green-400"
              }`}
            >
              {showNotification}
            </motion.div>
          )}

          {/* Info */}
          {!isConnected && (
            <p className="text-xs text-slate-500">
              Conecta tu cuenta de Gmail para procesar emails con adjuntos desde tu buzón.
            </p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
