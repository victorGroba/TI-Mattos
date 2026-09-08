import { z } from "zod";

// Validado uma vez, na primeira importação. Um deploy com variável faltando
// falha aqui com mensagem clara, em vez de virar `undefined` silencioso lá na
// frente — que foi exatamente o que quebrou o e-mail no sistema antigo.
/**
 * Variável opcional que aceita string vazia como "não informada".
 *
 * Isto NÃO é conveniência: o docker compose escreve `VAR: ${VAR:-}`, o que
 * entrega uma string vazia quando a variável não está no .env. Para o Zod,
 * vazio é um valor presente — então `.optional()` não se aplica e qualquer
 * regra (min, url) falha. O resultado era a validação lançar erro na
 * inicialização e TODA requisição virar 500, por um campo opcional em branco.
 */
function opcional<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((v) => (v === "" ? undefined : v), schema.optional());
}

const schema = z.object({
  DATABASE_URL: z.string().url(),

  // Conexões simultâneas do pool. O padrão serve para um Postgres normal; o
  // banco local do `prisma dev` é wasm e derruba a conexão acima de ~4, então
  // o .env de desenvolvimento reduz este valor.
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

  // Assina os cookies de sessão. Sem valor padrão de propósito.
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET precisa de pelo menos 32 caracteres"),
  AUTH_URL: opcional(z.string().url()),

  APP_URL: z.string().url().default("http://localhost:3000"),

  SMTP_HOST: z.string().default("email-ssl.com.br"),
  SMTP_PORT: z.coerce.number().int().default(465),
  SMTP_SECURE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  SMTP_USER: opcional(z.string()),
  SMTP_PASSWORD: opcional(z.string()),
  MAIL_FROM: opcional(z.string()),

  // Diretório dos anexos. É um volume nomeado no compose, não o bind mount
  // do código.
  UPLOAD_DIR: z.string().default("/app/uploads"),

  // Protege /api/cron/*. Sem valor definido, essas rotas ficam desligadas em
  // vez de abertas — um agendador ausente é melhor que um endpoint público.
  CRON_SECRET: opcional(z.string().min(16)),

  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`Variáveis de ambiente inválidas:\n${issues}`);
}

export const env = parsed.data;

/** true quando há credenciais SMTP completas; o envio é pulado caso contrário. */
export const mailEnabled = Boolean(env.SMTP_USER && env.SMTP_PASSWORD);
