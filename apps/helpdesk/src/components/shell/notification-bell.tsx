"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Bell, CheckCheck } from "lucide-react";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

// Sino de notificações.
//
// Consulta o servidor a cada 45 segundos, e não por WebSocket: o volume aqui é
// de alguns avisos por dia, e manter conexão aberta por usuário custaria mais
// do que resolve. A consulta também é refeita quando a aba volta ao foco, que
// é quando a pessoa de fato vai olhar.
//
// O contador inicial vem renderizado pelo servidor. Além de o número já estar
// certo no primeiro quadro (sem piscar de 0 para 3), isso evita uma busca a
// cada navegação e mantém o efeito livre de setState síncrono.

interface Item {
  id: number;
  type: string;
  title: string;
  body: string | null;
  lida: boolean;
  createdAt: string;
  ticketId: number | null;
}

const INTERVALO_MS = 45_000;

export function NotificationBell({ inicial = 0 }: { inicial?: number }) {
  const router = useRouter();
  const [itens, setItens] = useState<Item[]>([]);
  const [naoLidas, setNaoLidas] = useState(inicial);
  const [aberto, setAberto] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/notificacoes", { cache: "no-store" });
      if (!r.ok) return;
      const dados = await r.json();
      setItens(dados.itens);
      setNaoLidas(dados.naoLidas);
    } catch {
      // Rede instável não deve poluir o console nem quebrar a barra lateral.
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(carregar, INTERVALO_MS);

    // Voltar para a aba é o momento em que a pessoa vai olhar — vale uma
    // consulta imediata, em vez de esperar o próximo ciclo.
    const aoFocar = () => {
      if (document.visibilityState === "visible") void carregar();
    };
    document.addEventListener("visibilitychange", aoFocar);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", aoFocar);
    };
  }, [carregar]);

  async function marcar(id?: number) {
    // Atualiza a tela na hora e reconcilia com o servidor depois: esperar a
    // resposta faria o contador piscar a cada clique.
    setNaoLidas((n) => (id ? Math.max(0, n - 1) : 0));
    setItens((atual) =>
      atual.map((i) => (!id || i.id === id ? { ...i, lida: true } : i)),
    );

    await fetch("/api/notificacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(id ? { id } : {}),
    }).catch(() => {});
  }

  return (
    <DropdownMenu.Root
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        // A lista só é buscada quando alguém abre o sino: até então, o número
        // do servidor é tudo que a barra precisa mostrar.
        if (v) void carregar();
      }}
    >
      <DropdownMenu.Trigger
        className="relative flex size-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
        aria-label={naoLidas > 0 ? `${naoLidas} avisos não lidos` : "Avisos"}
      >
        <Bell className="size-4" />
        {naoLidas > 0 && (
          <span className="tabular absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white">
            {naoLidas > 9 ? "9+" : naoLidas}
          </span>
        )}
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          side="top"
          sideOffset={8}
          className="z-50 max-h-[26rem] w-80 overflow-y-auto rounded-lg border border-border bg-overlay p-1 shadow-[var(--shadow-raised)]"
        >
          <div className="flex items-center justify-between px-2.5 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
              Avisos
            </span>
            {naoLidas > 0 && (
              <button
                type="button"
                onClick={() => void marcar()}
                className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <CheckCheck className="size-3" />
                Marcar todos
              </button>
            )}
          </div>

          {itens.length === 0 ? (
            <p className="px-2.5 py-6 text-center text-[13px] text-muted-foreground">
              Nenhum aviso por enquanto.
            </p>
          ) : (
            <ul>
              {itens.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      void marcar(item.id);
                      if (item.ticketId) router.push(`/chamados/${item.ticketId}`);
                    }}
                    className="flex w-full gap-2 rounded px-2.5 py-2 text-left transition-colors hover:bg-surface-muted"
                  >
                    <span
                      className={cn(
                        "mt-1.5 size-1.5 shrink-0 rounded-full",
                        item.lida ? "bg-transparent" : "bg-primary",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-[13px]",
                          item.lida
                            ? "text-muted-foreground"
                            : "font-medium text-foreground",
                        )}
                      >
                        {item.title}
                      </span>
                      {item.body && (
                        <span className="block truncate text-[12px] text-muted-foreground">
                          {item.body}
                        </span>
                      )}
                      <span className="mt-0.5 block text-[11px] text-subtle-foreground">
                        {formatRelative(item.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
