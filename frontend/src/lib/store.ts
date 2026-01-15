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
  fromGemini?: boolean;
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
  suggestions: string[];
  geminiStatus: "available" | "quota_exceeded" | "error" | null;
  addMessage: (message: Omit<ChatMessage, "id" | "timestamp">) => void;
  updateLastMessage: (content: string, suggestions?: string[], fromGemini?: boolean) => void;
  setIsProcessing: (isProcessing: boolean) => void;
  setSuggestions: (suggestions: string[]) => void;
  setGeminiStatus: (status: "available" | "quota_exceeded" | "error" | null) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  isProcessing: false,
  suggestions: [],
  geminiStatus: null,
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
  updateLastMessage: (content, suggestions, fromGemini) =>
    set((state) => {
      const messages = [...state.messages];
      if (messages.length > 0) {
        messages[messages.length - 1] = {
          ...messages[messages.length - 1],
          content,
          isLoading: false,
          fromGemini,
        };
      }
      return { 
        messages,
        suggestions: suggestions || []
      };
    }),
  setIsProcessing: (isProcessing) => set({ isProcessing }),
  setSuggestions: (suggestions) => set({ suggestions }),
  setGeminiStatus: (geminiStatus) => set({ geminiStatus }),
  clearMessages: () => set({ messages: [], suggestions: [], geminiStatus: null }),
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
