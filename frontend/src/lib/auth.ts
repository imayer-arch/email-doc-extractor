import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Dominios permitidos (desde variable de entorno o default)
const ALLOWED_DOMAINS = (process.env.ALLOWED_DOMAINS || "mobeats.io").split(",").map(d => d.trim());

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    // Verificar dominio al hacer login
    async signIn({ user }) {
      const email = user.email || "";
      const domain = email.split("@")[1];
      
      // Verificar dominio permitido
      if (!ALLOWED_DOMAINS.includes(domain)) {
        console.log(`Login rechazado: ${email} (dominio no autorizado)`);
        return false;
      }
      
      console.log(`Login permitido: ${email}`);
      return true;
    },
    
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith("/dashboard") || 
                            nextUrl.pathname.startsWith("/documents") ||
                            nextUrl.pathname.startsWith("/chat");
      
      if (isOnDashboard) {
        if (isLoggedIn) return true;
        return false;
      } else if (isLoggedIn && nextUrl.pathname === "/login") {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }
      return true;
    },
    
    jwt({ token, user }) {
      if (user) {
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;
      }
      return token;
    },
    
    session({ session, token }) {
      if (session.user) {
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.image = token.picture as string;
      }
      return session;
    },
  },
});
