"use client";

import { motion } from "framer-motion";
import { StatsCard } from "@/components/dashboard/stats-card";
import { RecentDocuments } from "@/components/dashboard/recent-documents";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  Play,
  RefreshCw,
  Sparkles,
  Mail,
} from "lucide-react";
import { useDocuments, useStats, useTriggerProcess } from "@/lib/api";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();
  const { data: documents, isLoading: docsLoading } = useDocuments();
  const { data: stats, isLoading: statsLoading } = useStats();
  const { mutate: triggerProcess, isPending: isProcessing } = useTriggerProcess();

  const handleProcess = () => {
    triggerProcess();
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-400 mt-1">
            Monitorea y gestiona la extracción de documentos
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={handleProcess}
            disabled={isProcessing}
            className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white shadow-lg shadow-cyan-500/20"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Procesar Emails
              </>
            )}
          </Button>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statsLoading ? (
          <>
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-6">
                  <Skeleton className="h-4 w-24 mb-2 bg-slate-700" />
                  <Skeleton className="h-8 w-16 bg-slate-700" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : (
          <>
            <StatsCard
              title="Total Documentos"
              value={stats?.total || 0}
              subtitle="Todos los tiempos"
              icon={FileText}
              color="cyan"
              delay={0}
            />
            <StatsCard
              title="Completados"
              value={stats?.completed || 0}
              icon={CheckCircle}
              color="green"
              delay={0.1}
            />
            <StatsCard
              title="Errores"
              value={stats?.errors || 0}
              icon={AlertCircle}
              color="orange"
              delay={0.2}
            />
            <StatsCard
              title="Confianza de Extracción"
              value={stats?.avgConfidence ? `${stats.avgConfidence.toFixed(1)}%` : "N/A"}
              icon={TrendingUp}
              color="purple"
              delay={0.3}
            />
          </>
        )}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Documents */}
        <div className="lg:col-span-2">
          {docsLoading ? (
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <Skeleton className="h-6 w-48 bg-slate-700" />
              </CardHeader>
              <CardContent className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full bg-slate-800" />
                ))}
              </CardContent>
            </Card>
          ) : (
            <RecentDocuments 
              documents={documents?.slice(0, 5) || []} 
              onSelect={(doc) => router.push(`/documents?id=${doc.id}`)}
            />
          )}
        </div>

        {/* Quick Actions & Status */}
        <div className="space-y-6">
          {/* Agent Status */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.4 }}
          >
            <Card className="bg-slate-900/50 backdrop-blur-xl border-slate-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold text-white flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-cyan-400" />
                  Estado del Agente
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Google ADK</span>
                  <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                    Cuota limitada
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">AWS Textract</span>
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                    Activo
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Gmail API</span>
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                    Conectado
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">PostgreSQL</span>
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                    Conectado
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Quick Tips */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.5 }}
          >
            <Card className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border-cyan-500/30 backdrop-blur-xl">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="p-2 rounded-lg bg-cyan-500/20">
                    <Mail className="h-5 w-5 text-cyan-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white mb-1">
                      Procesamiento Automático
                    </h3>
                    <p className="text-sm text-slate-400">
                      Los emails con adjuntos PDF se procesan automáticamente.
                      Los datos extraídos se guardan en la base de datos.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
