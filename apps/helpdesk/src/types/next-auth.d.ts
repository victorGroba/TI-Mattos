import type { Role } from "@/generated/prisma/enums";

// Estende os tipos do Auth.js com os campos que o helpdesk carrega na sessão.
//
// O `id` continua string, como o Auth.js define: o tipo do callback de sessão
// intersecciona Session com AdapterUser, que fixa `id: string`, e redeclarar
// como number colapsaria o campo para `never`. A conversão para o Int do banco
// acontece num lugar só, em getSessionUser().

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      teamId: number | null;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }

  interface User {
    role: Role;
    teamId: number | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: number;
    role?: Role;
    teamId?: number | null;
  }
}
