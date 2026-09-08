# Deploy da v2 na VPS

O HelpDesk v2 (Next.js + Postgres, em `apps/helpdesk`) é uma aplicação
**diferente** do sistema atual em Flask. Ele sobe **em paralelo**, na porta
5002, sem encostar no que está no ar na 5001. O Nginx só passa a apontar para
ele no último passo, quando você validar.

> `git pull` sozinho não atualiza nada: ele traz os arquivos, mas não cria o
> banco, não roda as migrations e não constrói a imagem nova.

## Antes de começar

Dois nomes que causam confusão, e por isso ficam explícitos:

| Arquivo | De quem é | Cuidado |
| --- | --- | --- |
| `.env` | sistema **antigo** (Flask) | contém `SECRET_KEY`, `MAIL_USERNAME`, `MAIL_PASSWORD`. **Não sobrescreva.** |
| `.env.v2` | sistema **novo** | é o que você vai criar agora |

Por isso todo comando do compose leva `--env-file .env.v2`.

## 1. Trazer o código e criar o arquivo de ambiente

```bash
cd /var/www/helpdesk
git pull

cp .env.v2.example .env.v2
```

Gere e grave os dois segredos de uma vez, sem abrir editor — assim não há risco
de sair do editor sem salvar, nem de colar o valor na linha errada:

```bash
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|; s|^AUTH_SECRET=.*|AUTH_SECRET=$(openssl rand -hex 32)|" .env.v2
```

> Os dois são hexadecimais de propósito. A senha do Postgres entra dentro da
> URL de conexão, e caracteres como `/`, `+` ou `@` — que `openssl rand
> -base64` produz — quebram essa URL, com um erro que não menciona a senha.

Confira sem imprimir os valores:

```bash
awk -F= '$1=="POSTGRES_PASSWORD"||$1=="AUTH_SECRET"{print $1, length($2)"c"}' .env.v2
```

Esperado: `POSTGRES_PASSWORD 48c` e `AUTH_SECRET 64c`. Se vier `0c`, o arquivo
não foi gravado.

Falta só um campo, e é opcional agora: `SMTP_PASSWORD`, a senha do
`ti@labmattos.com.br` que já está no `.env` antigo. Sem ela o envio de e-mail
fica **desligado explicitamente** e registrado no log — o sistema sobe e
funciona normalmente.

Deixe `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD` **vazios**: os administradores
vêm dos dados importados, no passo 5.

## 2. Subir o banco

```bash
docker compose -f docker-compose.v2.yml --env-file .env.v2 up -d db
docker compose -f docker-compose.v2.yml --env-file .env.v2 ps
```

Espere o `db` aparecer como `healthy` antes de seguir.

## 3. Criar as tabelas

```bash
docker compose -f docker-compose.v2.yml --env-file .env.v2 \
  run --rm migrate npx prisma migrate deploy
```

## 4. Importar usuários, setores e categorias do sistema antigo

O banco SQLite atual (`instance/helpdesk.db`) entra no container montado em
`/legado` — em somente leitura, para nada escrever no banco que ainda está em
produção. **O caminho é sempre `/legado/helpdesk.db`**, independentemente de
onde o arquivo esteja no host.

Confira primeiro, sem gravar nada:

```bash
docker compose -f docker-compose.v2.yml --env-file .env.v2 \
  run --rm migrate npx tsx scripts/migrate-legacy.ts /legado/helpdesk.db --dry-run
```

Se os números baterem com o esperado (18 setores, 20 usuários, 5 categorias),
rode de verdade:

```bash
docker compose -f docker-compose.v2.yml --env-file .env.v2 \
  run --rm migrate npx tsx scripts/migrate-legacy.ts /legado/helpdesk.db
```

> **A ordem importa.** A importação preserva os IDs originais, então precisa
> rodar num banco onde esses IDs ainda estejam livres. Se algum estiver
> ocupado, o script **aborta com a mensagem explicando qual** — ele nunca
> descarta um registro em silêncio.

As senhas vêm intactas: quem já usa o sistema antigo entra com a mesma senha.

## 5. Definir quem é administrador

```bash
docker compose -f docker-compose.v2.yml --env-file .env.v2 \
  run --rm migrate npx tsx scripts/set-admins.ts \
  ti@labmattos.com.br rmattos@labmattos.com.br
```

Quem não estiver nessa lista vira usuário comum — vê apenas os próprios
chamados. O script recusa e-mail inexistente sem alterar nada, para um erro de
digitação não deixar o sistema sem administrador.

## 6. Subir a aplicação

```bash
docker compose -f docker-compose.v2.yml --env-file .env.v2 up -d --build
curl -s localhost:5002/api/health
```

A resposta esperada é `{"status":"ok","database":"up",...}`.

## 7. Validar antes do cutover

Enquanto o Nginx ainda aponta para o sistema antigo, acesse a v2 por um túnel
SSH a partir da sua máquina:

```bash
ssh -L 5002:localhost:5002 root@SEU_IP
```

E abra <http://localhost:5002>. Entre com uma conta de administrador e uma
comum, confira os cadastros importados, abra um chamado de teste.

## 8. Cutover no Nginx

Só depois de validar. Em `/etc/nginx/conf.d/helpdesk.conf`, troque a porta:

```nginx
proxy_pass http://127.0.0.1:5002;
```

```bash
nginx -t && systemctl reload nginx
```

Aproveite para remover `/etc/nginx/sites-enabled/helpdesk`, que é o bloco
duplicado sem SSL e gera `conflicting server name` no log.

O sistema antigo continua no ar na 5001 durante o período que você quiser. Para
voltar atrás, basta apontar o `proxy_pass` de volta e recarregar o Nginx.

## 9. Backup

```bash
cp scripts/backup-helpdesk.sh /usr/local/bin/backup-helpdesk
chmod +x /usr/local/bin/backup-helpdesk
crontab -e
```

Acrescente:

```
15 2 * * * /usr/local/bin/backup-helpdesk >> /var/log/backup-helpdesk.log 2>&1
```

## Atualizações seguintes

Aí sim é simples:

```bash
cd /var/www/helpdesk && git pull
docker compose -f docker-compose.v2.yml --env-file .env.v2 \
  run --rm migrate npx prisma migrate deploy
docker compose -f docker-compose.v2.yml --env-file .env.v2 up -d --build
```

## Desligar o sistema antigo (quando tiver certeza)

```bash
docker compose -f docker-compose.yml down
```

O `instance/helpdesk.db` continua no disco como arquivo histórico — os chamados
antigos não foram migrados de propósito.
