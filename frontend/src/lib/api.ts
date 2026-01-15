import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ExtractedDocument, Stats } from "./store";

const API_BASE = "/api";

// Fetch documents (optionally filtered by userId)
// refetchInterval: pass a number (ms) to enable polling while processing
export function useDocuments(userId?: string, status?: string, refetchInterval?: number | false) {
  return useQuery<ExtractedDocument[]>({
    queryKey: ["documents", userId, status],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status && status !== "all") {
        params.set("status", status);
      }
      if (userId) {
        params.set("userId", userId);
      }
      const res = await fetch(`${API_BASE}/documents?${params}`);
      if (!res.ok) throw new Error("Failed to fetch documents");
      return res.json();
    },
    refetchInterval: refetchInterval || false,
  });
}

// Fetch stats with optional polling
export function useStatsWithPolling(refetchInterval?: number | false) {
  return useQuery<Stats>({
    queryKey: ["stats"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/stats`);
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    refetchInterval: refetchInterval || false,
  });
}

// Fetch single document
export function useDocument(id: string) {
  return useQuery<ExtractedDocument>({
    queryKey: ["document", id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/documents/${id}`);
      if (!res.ok) throw new Error("Failed to fetch document");
      return res.json();
    },
    enabled: !!id,
  });
}

// Fetch stats
export function useStats() {
  return useQuery<Stats>({
    queryKey: ["stats"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/stats`);
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
  });
}

// Send chat message
export function useSendMessage() {
  return useMutation({
    mutationFn: async (message: string) => {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) throw new Error("Failed to send message");
      return res.json();
    },
  });
}

// Trigger processing (optionally for a specific user)
export function useTriggerProcess() {
  const queryClient = useQueryClient();
  
  return useMutation<unknown, Error, string | undefined>({
    mutationFn: async (userId?: string) => {
      const res = await fetch(`${API_BASE}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error("Failed to trigger process");
      return res.json();
    },
    onSuccess: () => {
      // Invalidate documents and stats to refetch
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

// Delete documents
export function useDeleteDocuments() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch(`${API_BASE}/documents/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to delete documents");
      }
      return res.json();
    },
    onSuccess: () => {
      // Invalidate documents and stats to refetch
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}
