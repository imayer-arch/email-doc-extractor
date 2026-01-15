"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  Filter,
  Table as TableIcon,
  KeyRound,
  FileCode,
  Trash2,
  Loader2,
} from "lucide-react";
import { ExtractedDocument } from "@/lib/store";
import { formatDistanceToNow, truncateText } from "@/lib/utils";
import { useDocuments, useDeleteDocuments } from "@/lib/api";

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

export default function DocumentsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDoc, setSelectedDoc] = useState<ExtractedDocument | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: documents, isLoading } = useDocuments();
  const { mutate: deleteDocuments, isPending: isDeleting } = useDeleteDocuments();

  const filteredDocs = (documents || []).filter((doc) => {
    const matchesSearch =
      doc.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.emailSubject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.emailFrom?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || doc.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredDocs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredDocs.map((doc) => doc.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleDelete = () => {
    if (selectedIds.size === 0) return;
    
    if (confirm(`¿Estás seguro de eliminar ${selectedIds.size} documento(s)?`)) {
      deleteDocuments(Array.from(selectedIds), {
        onSuccess: () => {
          setSelectedIds(new Set());
        },
      });
    }
  };

  const isAllSelected = filteredDocs.length > 0 && selectedIds.size === filteredDocs.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-white">Documentos</h1>
          <p className="text-slate-400 mt-1">
            Todos los documentos extraídos de emails
          </p>
        </div>
        {selectedIds.size > 0 && (
          <Button
            onClick={handleDelete}
            disabled={isDeleting}
            variant="destructive"
            className="bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Eliminando...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                Eliminar ({selectedIds.size})
              </>
            )}
          </Button>
        )}
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex items-center gap-4"
      >
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <Input
            placeholder="Buscar por nombre, asunto o remitente..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-cyan-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-500" />
          <div className="flex gap-1">
            {["all", "completed", "pending", "error"].map((status) => (
              <Button
                key={status}
                variant={statusFilter === status ? "default" : "ghost"}
                size="sm"
                onClick={() => setStatusFilter(status)}
                className={
                  statusFilter === status
                    ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                    : "text-slate-400 hover:text-white"
                }
              >
                {status === "all"
                  ? "Todos"
                  : statusConfig[status as keyof typeof statusConfig]?.label}
              </Button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card className="bg-slate-900/50 backdrop-blur-xl border-slate-800">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full bg-slate-800" />
                ))}
              </div>
            ) : filteredDocs.length === 0 ? (
              <div className="p-12 text-center">
                <FileText className="h-12 w-12 mx-auto text-slate-600 mb-4" />
                <p className="text-slate-400">No hay documentos para mostrar</p>
                <p className="text-slate-500 text-sm mt-1">
                  Los documentos procesados aparecerán aquí
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="w-12">
                      <Checkbox
                        checked={isAllSelected}
                        onCheckedChange={toggleSelectAll}
                        className="border-slate-600 data-[state=checked]:bg-cyan-500 data-[state=checked]:border-cyan-500"
                      />
                    </TableHead>
                    <TableHead className="text-slate-400">Archivo</TableHead>
                    <TableHead className="text-slate-400">Email</TableHead>
                    <TableHead className="text-slate-400">Remitente</TableHead>
                    <TableHead className="text-slate-400">Estado</TableHead>
                    <TableHead className="text-slate-400">Confianza de Extracción</TableHead>
                    <TableHead className="text-slate-400">Fecha</TableHead>
                    <TableHead className="text-slate-400 text-right">
                      Acciones
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDocs.map((doc, index) => {
                    const status =
                      statusConfig[doc.status as keyof typeof statusConfig] ||
                      statusConfig.pending;
                    const StatusIcon = status.icon;
                    const isSelected = selectedIds.has(doc.id);

                    return (
                      <motion.tr
                        key={doc.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className={`border-slate-800 hover:bg-slate-800/50 cursor-pointer group ${
                          isSelected ? "bg-cyan-500/10" : ""
                        }`}
                        onClick={() => setSelectedDoc(doc)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelect(doc.id)}
                            className="border-slate-600 data-[state=checked]:bg-cyan-500 data-[state=checked]:border-cyan-500"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-slate-800 group-hover:bg-cyan-500/20 transition-colors">
                              <FileText className="h-4 w-4 text-slate-400 group-hover:text-cyan-400" />
                            </div>
                            <span className="text-white font-medium">
                              {truncateText(doc.fileName, 25)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-400">
                          {truncateText(doc.emailSubject || "Sin asunto", 30)}
                        </TableCell>
                        <TableCell className="text-slate-400">
                          {truncateText(
                            doc.emailFrom?.split("<")[0]?.trim() || "Desconocido",
                            20
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={status.className}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {doc.confidence ? (
                            <span
                              className={
                                doc.confidence >= 80
                                  ? "text-green-400"
                                  : doc.confidence >= 60
                                  ? "text-yellow-400"
                                  : "text-red-400"
                              }
                            >
                              {doc.confidence.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-slate-400">
                          {formatDistanceToNow(doc.extractedAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-slate-400 hover:text-cyan-400"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDoc(doc);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </motion.tr>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Document Detail Dialog */}
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
