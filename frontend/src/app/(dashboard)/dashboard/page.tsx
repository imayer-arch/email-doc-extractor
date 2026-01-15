"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { StatsCard } from "@/components/dashboard/stats-card";
import { RecentDocuments } from "@/components/dashboard/recent-documents";
import { GmailConnection } from "@/components/dashboard/gmail-connection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import {
  FileText,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  Play,
  RefreshCw,
  Sparkles,
  Mail,
  KeyRound,
  Table as TableIcon,
  FileCode,
  Radio,
} from "lucide-react";
import { useDocuments, useStatsWithPolling, useTriggerProcess } from "@/lib/api";
import { useUser } from "@/lib/useUser";
import { ExtractedDocument } from "@/lib/store";

// Polling intervals
const PROCESSING_POLL_INTERVAL = 2000;  // 2 seconds while processing
const AUTO_POLL_INTERVAL = 30000;       // 30 seconds for auto-refresh

export default function DashboardPage() {
  const { userId, gmailConnected } = useUser();
  const [selectedDoc, setSelectedDoc] = useState<ExtractedDocument | null>(null);
  const { mutate: triggerProcess, isPending: isProcessing } = useTriggerProcess();
  
  // Enable faster polling while processing, otherwise poll every 30s for new documents
  const pollingInterval = isProcessing ? PROCESSING_POLL_INTERVAL : AUTO_POLL_INTERVAL;
  
  const { data: documents, isLoading: docsLoading } = useDocuments(userId, undefined, pollingInterval);
  const { data: stats, isLoading: statsLoading } = useStatsWithPolling(pollingInterval);

  const handleProcess = () => {
    // Pass userId to process user's own emails
    triggerProcess(userId);
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
          <div className="flex items-center gap-3 mt-1">
            <p className="text-slate-400">
              Monitorea y gestiona la extracción de documentos
            </p>
            {gmailConnected && (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                <Radio className="h-3 w-3 mr-1 animate-pulse" />
                Auto-refresh activo
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!gmailConnected && (
            <span className="text-sm text-yellow-400">
              Conecta Gmail primero →
            </span>
          )}
          <Button
            onClick={handleProcess}
            disabled={isProcessing || !gmailConnected}
            className={gmailConnected 
              ? "bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white shadow-lg shadow-cyan-500/20"
              : "bg-slate-700 text-slate-400 cursor-not-allowed"
            }
            title={!gmailConnected ? "Primero conecta tu Gmail en el panel derecho" : ""}
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
              onSelect={(doc) => setSelectedDoc(doc)}
            />
          )}
        </div>

        {/* Quick Actions & Status */}
        <div className="space-y-6">
          {/* Gmail Connection */}
          <GmailConnection />

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

      {/* Document Detail Modal */}
      <Dialog open={!!selectedDoc} onOpenChange={() => setSelectedDoc(null)}>
        <DialogContent className="max-w-[95vw] w-[95vw] max-h-[90vh] h-[90vh] bg-slate-900 border-slate-800 text-white overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/20">
                <FileText className="h-5 w-5 text-cyan-400" />
              </div>
              <div>
                <span className="text-white">{selectedDoc?.fileName}</span>
                <p className="text-sm text-slate-400 font-normal mt-1">
                  {selectedDoc?.emailSubject}
                </p>
              </div>
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="data" className="mt-4">
            <TabsList className="bg-slate-800/50 border border-slate-700">
              <TabsTrigger
                value="data"
                className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400"
              >
                <KeyRound className="h-4 w-4 mr-2" />
                Datos Extraídos
              </TabsTrigger>
              <TabsTrigger
                value="tables"
                className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400"
              >
                <TableIcon className="h-4 w-4 mr-2" />
                Tablas
              </TabsTrigger>
              <TabsTrigger
                value="raw"
                className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400"
              >
                <FileCode className="h-4 w-4 mr-2" />
                Texto Raw
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="h-[calc(90vh-180px)] mt-4">
              <TabsContent value="data" className="mt-0">
                <div className="space-y-3">
                  {(selectedDoc?.structuredData as any)?.keyValuePairs?.length > 0 ||
                  (Array.isArray(selectedDoc?.structuredData) && selectedDoc?.structuredData?.length > 0) ? (
                    ((selectedDoc?.structuredData as any)?.keyValuePairs || selectedDoc?.structuredData || []).map(
                      (kv: any, i: number) => (
                        <div
                          key={i}
                          className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700"
                        >
                          <div>
                            <span className="text-slate-400 text-sm">
                              {kv.key}
                            </span>
                            <p className="text-white font-medium mt-1">
                              {kv.value}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className={
                              kv.confidence >= 90
                                ? "bg-green-500/20 text-green-400 border-green-500/30"
                                : kv.confidence >= 70
                                ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                                : "bg-red-500/20 text-red-400 border-red-500/30"
                            }
                          >
                            {kv.confidence?.toFixed(0) || 0}%
                          </Badge>
                        </div>
                      )
                    )
                  ) : (
                    <p className="text-slate-500 text-center py-8">
                      No hay datos estructurados disponibles
                    </p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="tables" className="mt-0 space-y-6 pr-4">
                {(selectedDoc?.tablesData as any[])?.length > 0 ? (
                  (selectedDoc?.tablesData as any[])?.map(
                    (table: any, tableIndex: number) => (
                      <div key={tableIndex} className="mb-8">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-base font-semibold text-white">
                            Tabla {tableIndex + 1}
                          </h4>
                          <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30">
                            {table.confidence?.toFixed(0)}% confianza
                          </Badge>
                        </div>
                        <div className="rounded-lg border border-slate-700 overflow-auto max-w-full">
                          <table className="w-full border-collapse">
                            <tbody>
                              {table.rows?.map((row: string[], rowIndex: number) => (
                                <tr
                                  key={rowIndex}
                                  className={
                                    rowIndex === 0
                                      ? "bg-slate-800/80"
                                      : "border-t border-slate-700 hover:bg-slate-800/30"
                                  }
                                >
                                  {row.map((cell: string, cellIndex: number) => (
                                    <td
                                      key={cellIndex}
                                      className={`px-4 py-3 whitespace-nowrap ${
                                        rowIndex === 0
                                          ? "text-cyan-400 font-semibold text-sm"
                                          : "text-slate-300 text-sm"
                                      }`}
                                    >
                                      {cell || "-"}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  )
                ) : (
                  <p className="text-slate-500 text-center py-8">
                    No hay tablas disponibles
                  </p>
                )}
              </TabsContent>

              <TabsContent value="raw" className="mt-0">
                <pre className="p-4 rounded-lg bg-slate-800/50 border border-slate-700 text-sm text-slate-300 whitespace-pre-wrap font-mono">
                  {selectedDoc?.rawText || "No hay texto disponible"}
                </pre>
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
