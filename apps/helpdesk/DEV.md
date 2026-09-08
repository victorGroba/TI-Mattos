# Rodando localmente

Não precisa de Docker. O banco vem do `prisma dev`, um Postgres 17 isolado que
o próprio Prisma sobe — separado do PostgreSQL instalado na máquina.

## Subir

```bash
cd apps/helpdesk

# 1. Banco (fica em segundo plano; a porta aparece no fim da URL)
npx prisma dev -n helpdesk -d

# 2. Aplicação
npm run dev
```

Abra <http://localhost:3000>.

O `.env` local já está configurado e **não é versionado**. Se a porta do banco
mudar entre execuções, veja com `npx prisma dev ls` e ajuste `DATABASE_URL`.

## Acesso

| E-mail | Senha | Papel |
| --- | --- | --- |
| `victorgroba2@gmail.com` | `admin123` | Administrador |

Para trocar a senha de qualquer conta (inclusive as importadas do sistema
antigo, cujo hash ninguém conhece):

```bash
npx tsx scripts/set-password.ts email@labmattos.com.br NovaSenha123 --admin
```

## Preparar o banco do zero

A ordem importa. A importação do sistema antigo preserva os ids originais
(setor 1, usuário 1...), então precisa rodar antes do seed — senão o seed ocupa
o id 1 e a importação recusa o registro correspondente (com mensagem explícita,
não em silêncio).

```bash
npx prisma migrate deploy                                   # 1. schema
npx tsx scripts/migrate-legacy.ts ../../instance/helpdesk.db  # 2. dados antigos
npx tsx prisma/seed.ts                                      # 3. políticas de SLA
npx tsx scripts/seed-demo.ts                                # 4. dados fictícios
```

> `seed-demo` é só para desenvolvimento — cria 90 chamados e 3 projetos
> fictícios. Nunca rode em produção. Use `--reset` para recriar do zero.

## Comandos úteis

```bash
npm run typecheck              # tsc --noEmit
npm test                       # testes unitários
npx eslint src                 # lint
npx prisma studio              # navegar no banco
npx tsx scripts/list-teams.ts  # conferir setores importados
npx tsx scripts/probe-pool.ts  # medir a concorrência que o banco suporta
```

## Limitações do banco de desenvolvimento

O Postgres do `prisma dev` roda em WebAssembly e **derruba a conexão acima de
~4 consultas simultâneas**. Por isso o `.env` local define
`DATABASE_POOL_MAX="4"` — o painel dispara mais de dez consultas em paralelo e
falharia com o padrão. Em produção o valor padrão (10) é o adequado; um
Postgres normal não tem esse limite.
