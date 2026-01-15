import { create } from "zustand";

// Types
export interface ExtractedDocument {
  id: string;
  emailId: string;
  emailSubject: string | null;
  emailFrom: string | null;
  emailDate: string | null;
  fileName: string;
  fileType: string | null;
  rawText: string | null;
  structuredData: Record<string, unknown> | null;
  tablesData: unknown[] | null;
  confidence: number | null;
  status: string;
  extractedAt: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isLoading?: boolean;
}

export interface Stats {
  total: number;
  completed: number;
  errors: number;
  avgConfidence: number;
}

// Document Store
interface DocumentStore {
  documents: ExtractedDocument[];
  selectedDocument: ExtractedDocument | null;
  isLoading: boolean;
  setDocuments: (documents: ExtractedDocument[]) => void;
  setSelectedDocument: (document: ExtractedDocument | null) => void;
  setIsLoading: (isLoading: boolean) => void;
}

export const useDocumentStore = create<DocumentStore>((set) => ({
  documents: [],
  selectedDocument: null,
  isLoading: false,
  setDocuments: (documents) => set({ documents }),
  setSelectedDocument: (selectedDocument) => set({ selectedDocument }),
  setIsLoading: (isLoading) => set({ isLoading }),
}));

// Chat Store
interface ChatStore {
  messages: ChatMessage[];
  isProcessing: boolean;
  addMessage: (message: Omit<ChatMessage, "id" | "timestamp">) => void;
  updateLastMessage: (content: string) => void;
  setIsProcessing: (isProcessing: boolean) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  isProcessing: false,
  addMessage: (message) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          ...message,
          id: crypto.randomUUID(),
          timestamp: new Date(),
        },
      ],
    })),
  updateLastMessage: (content) =>
    set((state) => {
      const messages = [...state.messages];
      if (messages.length > 0) {
        messages[messages.length - 1] = {
          ...messages[messages.length - 1],
          content,
          isLoading: false,
        };
      }
      return { messages };
    }),
  setIsProcessing: (isProcessing) => set({ isProcessing }),
  clearMessages: () => set({ messages: [] }),
}));

// Stats Store
interface StatsStore {
  stats: Stats | null;
  setStats: (stats: Stats) => void;
}

export const useStatsStore = create<StatsStore>((set) => ({
  stats: null,
  setStats: (stats) => set({ stats }),
}));
