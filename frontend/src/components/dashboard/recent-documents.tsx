"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, CheckCircle, XCircle, Clock } from "lucide-react";
import { ExtractedDocument } from "@/lib/store";
import { formatDistanceToNow } from "@/lib/utils";

interface RecentDocumentsProps {
  documents: ExtractedDocument[];
  onSelect?: (doc: ExtractedDocument) => void;
}

const statusConfig = {
  completed: {
    label: "Completado",
    icon: CheckCircle,
    className: "bg-green-500/20 text-green-400 border-green-500/30",
  },
  pending: {
    label: "Pendiente",
    icon: Clock,
    className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  },
  error: {
    label: "Error",
    icon: XCircle,
    className: "bg-red-500/20 text-red-400 border-red-500/30",
  },
};

export function RecentDocuments({ documents, onSelect }: RecentDocumentsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
    >
      <Card className="bg-slate-900/50 backdrop-blur-xl border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-white flex items-center gap-2">
            <FileText className="h-5 w-5 text-cyan-400" />
            Documentos Recientes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] pr-4">
            {documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[300px] text-slate-500">
                <FileText className="h-12 w-12 mb-4 opacity-50" />
                <p>No hay documentos procesados</p>
              </div>
            ) : (
              <div className="space-y-3">
                {documents.map((doc, index) => {
                  const status = statusConfig[doc.status as keyof typeof statusConfig] || statusConfig.pending;
                  const StatusIcon = status.icon;

                  return (
                    <motion.div
                      key={doc.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      onClick={() => onSelect?.(doc)}
                      className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:border-cyan-500/30 hover:bg-slate-800 transition-all duration-200 cursor-pointer group"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <FileText className="h-4 w-4 text-slate-400 group-hover:text-cyan-400 transition-colors" />
                            <p className="text-sm font-medium text-white truncate">
                              {doc.fileName}
                            </p>
                          </div>
                          <p className="text-xs text-slate-500 truncate mb-2">
                            {doc.emailSubject || "Sin asunto"}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span>{doc.emailFrom?.split("<")[0]?.trim() || "Desconocido"}</span>
                            <span>•</span>
                            <span>{formatDistanceToNow(doc.extractedAt)}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Badge variant="outline" className={status.className}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {status.label}
                          </Badge>
                          {doc.confidence && (
                            <span className="text-xs text-slate-500">
                              {doc.confidence.toFixed(0)}% confianza
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </motion.div>
  );
}
