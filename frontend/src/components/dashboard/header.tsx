"use client";

import { signOut, useSession } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, ChevronDown } from "lucide-react";

export function Header() {
  const { data: session } = useSession();

  // Extract username from email (before @)
  const username = session?.user?.email?.split("@")[0] || "Usuario";
  
  return (
    <header className="fixed top-0 right-0 z-50 p-4 pl-72">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-white">
          {username}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-1 outline-none">
            <Avatar className="h-8 w-8 cursor-pointer ring-2 ring-slate-700 hover:ring-cyan-500/50 transition-all">
              <AvatarImage src={session?.user?.image || ""} />
              <AvatarFallback className="bg-gradient-to-br from-cyan-400 to-blue-500 text-white text-sm">
                {username.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 bg-slate-900 border-slate-800">
            <div className="px-2 py-1.5 text-xs text-slate-500">
              {session?.user?.email}
            </div>
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-red-400 focus:text-red-400 focus:bg-red-500/10 cursor-pointer"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
