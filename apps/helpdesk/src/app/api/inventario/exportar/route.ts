import { buildAssetWhere, parseAssetFilters } from "@/lib/asset-queries";
import { formatDate } from "@/lib/format";
import { assetStatusLabels, assetTypeLabels, termStatusLabels } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/rbac";
import { getSessionUser } from "@/lib/session";

// Planilha do inventário, com os mesmos filtros da tela.
//
// CSV com ponto e vírgula e BOM: é o formato que o Excel em português abre
// com acentos e colunas certas por duplo clique, sem assistente de importação.

export const dynamic = "force-dynamic";

/**
 * Célula segura. Além das aspas, neutraliza texto que começa com = + - @: o
 * Excel executaria como fórmula, e o conteúdo vem de campo livre digitado.
 */
function celula(valor: string | null | undefined): string {
  let v = (valor ?? "").replace(/\r?\n/g, " ").trim();
  if (/^[=+\-@\t]/.test(v)) v = `'${v}`;
  return /[";]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return new Response("Não autenticado.", { status: 401 });
  if (!isAdmin(user.role)) return new Response("Acesso negado.", { status: 403 });

  const url = new URL(request.url);
  const filters = parseAssetFilters(Object.fromEntries(url.searchParams));

  const assets = await prisma.asset.findMany({
    where: buildAssetWhere(filters),
    orderBy: { tag: "asc" },
    include: {
      team: { select: { name: true } },
      assignee: { select: { name: true, email: true } },
      terms: {
        where: { status: { in: ["PENDING", "SIGNED"] } },
        select: { status: true, signedAt: true },
        orderBy: { issuedAt: "desc" },
        take: 1,
      },
    },
  });

  const cabecalho = [
    "Patrimônio",
    "Tipo",
    "Nome na rede",
    "Marca",
    "Modelo",
    "Nº de série",
    "Processador",
    "Memória",
    "Armazenamento",
    "Sistema",
    "IP",
    "MAC",
    "Acesso remoto",
    "Situação",
    "Setor",
    "Local",
    "Responsável",
    "E-mail do responsável",
    "Termo",
    "Termo assinado em",
    "Compra",
    "Garantia até",
    "Conferido em",
    "Observações",
  ];

  const linhas = assets.map((a) => {
    const termo = a.terms[0];
    return [
      a.tag,
      assetTypeLabels[a.type],
      a.hostname,
      a.brand,
      a.model,
      a.serialNumber,
      a.processor,
      a.memory,
      a.storage,
      a.operatingSystem,
      a.ipAddress,
      a.macAddress,
      a.remoteAccess,
      assetStatusLabels[a.status],
      a.team?.name,
      a.location,
      a.assignee?.name,
      a.assignee?.email,
      termo ? termStatusLabels[termo.status] : a.assignee ? "Sem termo" : "",
      termo?.signedAt ? formatDate(termo.signedAt) : "",
      a.purchasedAt ? formatDate(a.purchasedAt) : "",
      a.warrantyUntil ? formatDate(a.warrantyUntil) : "",
      a.lastCheckedAt ? formatDate(a.lastCheckedAt) : "",
      a.notes,
    ]
      .map(celula)
      .join(";");
  });

  const csv = `﻿${[cabecalho.join(";"), ...linhas].join("\r\n")}\r\n`;
  const hoje = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="inventario-${hoje}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
