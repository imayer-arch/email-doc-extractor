"use client";

import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000";

export interface UserInfo {
  id: string;
  email: string;
  name: string | null;
  gmailConnected: boolean;
}

/**
 * Hook to sync user with backend and get user info
 * Creates user in backend if not exists
 */
export function useUser() {
  const { data: session, status } = useSession();

  const query = useQuery<UserInfo>({
    queryKey: ["user", session?.user?.email],
    queryFn: async () => {
      if (!session?.user?.email) throw new Error("No user email");

      const res = await fetch(`${BACKEND_URL}/api/user/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: session.user.email,
          name: session.user.name,
          image: session.user.image,
        }),
      });

      if (!res.ok) throw new Error("Failed to sync user");
      return res.json();
    },
    enabled: status === "authenticated" && !!session?.user?.email,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  return {
    user: query.data,
    userId: query.data?.id,
    isLoading: query.isLoading || status === "loading",
    isAuthenticated: status === "authenticated",
    gmailConnected: query.data?.gmailConnected || false,
  };
}
