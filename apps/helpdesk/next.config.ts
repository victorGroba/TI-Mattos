import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Gera uma árvore mínima com server.js e só as dependências usadas em
  // runtime — é o que mantém a imagem Docker pequena.
  output: "standalone",

  // O client do Prisma carrega binários nativos; empacotá-lo quebraria a
  // resolução desses arquivos no bundle do servidor.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg"],

  devIndicators: {
    // O padrão (bottom-left) cobre o rodapé da barra lateral, justamente onde
    // ficam a conta e o botão de tema. Só afeta desenvolvimento.
    position: "bottom-right",
  },
};

export default nextConfig;
