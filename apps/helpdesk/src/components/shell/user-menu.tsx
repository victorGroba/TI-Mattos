"use client";

import { useTransition } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronsUpDown, LogOut } from "lucide-react";
import type { Role } from "@/generated/prisma/enums";
import { Avatar } from "@/components/ui/misc";
import { roleLabels } from "@/lib/labels";
import { logoutAction } from "@/app/(app)/actions";
import { ThemeMenuItem } from "./theme-toggle";

export function UserMenu({
  name,
  email,
  role,
  id,
}: {
  name: string;
  email: string;
  role: Role;
  id: number;
}) {
  // A ação de sair é chamada em transição, e não por um <form> dentro do item
  // do menu: o Radix desmonta o conteúdo ao selecionar, o que cancelaria o
  // envio. Continua sendo um POST — nunca um link GET, que poderia ser
  // disparado por prefetch ou por uma página externa.
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex min-w-0 flex-1 items-center gap-2 rounded px-1.5 py-1 text-left transition-colors hover:bg-surface-muted">
        <Avatar name={name} id={id} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-medium leading-tight text-foreground">
            {name}
          </span>
          <span className="block truncate text-[10px] leading-tight text-subtle-foreground">
            {roleLabels[role]}
          </span>
        </span>
        {/* Seta dupla porque o menu abre para cima no rodapé da coluna — uma
            seta só para baixo indicaria a direção errada. */}
        <ChevronsUpDown className="size-3 shrink-0 text-subtle-foreground" />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          side="top"
          sideOffset={6}
          className="z-50 w-56 rounded-lg border border-border bg-overlay p-1 shadow-[var(--shadow-raised)]"
        >
          <div className="px-2.5 py-2">
            <p className="truncate text-[13px] font-medium text-foreground">{name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{email}</p>
          </div>

          <DropdownMenu.Separator className="my-1 h-px bg-border" />

          <DropdownMenu.Item
            asChild
            onSelect={(e) => {
              // Trocar o tema não deve fechar o menu: dá para conferir o
              // resultado e voltar atrás sem reabrir.
              e.preventDefault();
            }}
          >
            <ThemeMenuItem />
          </DropdownMenu.Item>

          <DropdownMenu.Item
            disabled={pending}
            onSelect={(event) => {
              // Sem o preventDefault, o Radix fecha o menu ao selecionar e
              // desmonta o conteúdo antes de a ação sair — era por isso que o
              // clique em "Sair" não fazia absolutamente nada.
              event.preventDefault();
              startTransition(async () => {
                await logoutAction();
              });
            }}
            className="flex cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-[13px] text-muted-foreground outline-none transition-colors select-none hover:bg-surface-muted hover:text-foreground data-disabled:opacity-60 data-highlighted:bg-surface-muted"
          >
            <LogOut className="size-4" />
            {pending ? "Saindo…" : "Sair"}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
