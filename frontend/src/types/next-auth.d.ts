import { DefaultSession, DefaultUser } from "next-auth";
import { JWT, DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      gmailConnected: boolean;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    gmailConnected?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    userId?: string;
    gmailConnected?: boolean;
  }
}
