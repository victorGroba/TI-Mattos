import NextAuth from "next-auth";
import type { JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "./prisma";
import { hashPassword, needsRehash, verifyPassword } from "./password";

// Sessão em JWT, sem tabela de sessões: o helpdesk não precisa revogar sessão
// individualmente e isso economiza uma ida ao banco em toda requisição.
//
// O papel e o setor vão no token porque quase toda tela precisa deles para
// decidir o que mostrar. A contrapartida é que uma mudança de papel só vale na
// próxima renovação do token — aceitável para uso interno, e o servidor
// revalida as permissões críticas contra o banco de qualquer forma.

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/login" },
  trustHost: true,

  providers: [
    Credentials({
      name: "credenciais",
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase().trim() },
        });

        // Mesma resposta para usuário inexistente, inativo e senha errada —
        // a tela de login não deve revelar quais e-mails existem.
        if (!user || !user.active) return null;

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) return null;

        // Migração silenciosa dos hashes vindos do Flask: quem loga uma vez
        // já sai do scrypt do Werkzeug para bcrypt.
        if (needsRehash(user.passwordHash)) {
          await prisma.user.update({
            where: { id: user.id },
            data: { passwordHash: await hashPassword(password) },
          });
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLogin: new Date() },
        });

        return {
          id: String(user.id),
          name: user.name,
          email: user.email,
          role: user.role,
          teamId: user.teamId,
        };
      },
    }),
  ],

  callbacks: {
    jwt({ token, user, trigger }) {
      if (user) {
        token.role = user.role;
        token.teamId = user.teamId;
        token.uid = Number(user.id);
      }

      // Permite que a própria sessão se atualize depois de o admin trocar o
      // papel de alguém, sem obrigar a pessoa a sair e entrar de novo.
      if (trigger === "update" && token.uid) {
        return refreshToken(token);
      }

      return token;
    },

    session({ session, token }) {
      // Um token sem uid/role é de uma versão anterior do formato; tratá-lo
      // como sessão incompleta é melhor que preencher com valor inventado.
      if (token.uid && token.role) {
        session.user.id = String(token.uid);
        session.user.role = token.role;
        session.user.teamId = token.teamId ?? null;
      }
      return session;
    },
  },
});

async function refreshToken(token: JWT): Promise<JWT> {
  const fresh = await prisma.user.findUnique({
    where: { id: token.uid! },
    select: { role: true, teamId: true },
  });
  if (fresh) {
    token.role = fresh.role;
    token.teamId = fresh.teamId;
  }
  return token;
}
