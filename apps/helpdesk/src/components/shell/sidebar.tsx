"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, Plus, X } from "lucide-react";
import type { Role } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SidebarCounts } from "@/lib/sidebar-counts";
import { isActive, visibleSections } from "./nav-config";
import { NotificationBell } from "./notification-bell";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

export interface SidebarUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export function Sidebar({
  user,
  counts,
}: {
  user: SidebarUser;
  counts: SidebarCounts;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const sections = visibleSections(user.role);

  return (
    <>
      {/* Barra superior — só no mobile, onde a sidebar vira gaveta. No desktop
          não existe cabeçalho: tudo que ficaria nele mora na própria coluna,
          o que devolve uma faixa inteira de altura ao conteúdo. */}
      <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2 lg:hidden">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
        >
          <Menu />
        </Button>
        <Image
          src="/logo.png"
          alt=""
          width={22}
          height={22}
          className="rounded dark:bg-white/90 dark:p-0.5"
        />
        <span className="text-[13px] font-semibold">HelpDesk</span>
        <span className="ml-auto">
          <ThemeToggle />
        </span>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-52 shrink-0 flex-col border-r border-border bg-surface transition-transform lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
          <Image
            src="/logo.png"
            alt="Mattos &amp; Mattos TI"
            width={24}
            height={24}
            /* O logo é tinta escura sobre fundo transparente e some no tema
               escuro; a plaquinha clara preserva as cores da marca. */
            className="rounded dark:bg-white/90 dark:p-0.5"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold leading-none text-foreground">
              HelpDesk
            </p>
            <p className="mt-0.5 truncate text-[10px] uppercase leading-none tracking-[0.08em] text-subtle-foreground">
              Lab Mattos
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Fechar menu"
          >
            <X />
          </Button>
        </div>

        <div className="px-2 pt-3">
          <Button asChild size="sm" className="h-8 w-full justify-start gap-2">
            <Link href="/chamados/novo" onClick={() => setOpen(false)}>
              <Plus />
              Novo chamado
            </Link>
          </Button>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
          {sections.map((section, index) => (
            <div key={section.label ?? index}>
              {section.label && (
                <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.09em] text-subtle-foreground">
                  {section.label}
                </p>
              )}
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(item, pathname);
                  const Icon = item.icon;
                  const count = counts.counts[item.href];
                  const alert = counts.alerts[item.href];

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        // Fecha a gaveta no próprio clique. Reagir à troca de
                        // rota num efeito faria uma renderização em cascata, e
                        // o resultado visível é idêntico.
                        onClick={() => setOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded px-2 py-[5px] text-[13px] transition-colors",
                          active
                            ? "bg-primary-subtle font-medium text-primary-subtle-foreground"
                            : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
                        )}
                      >
                        <Icon className="size-[15px] shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>

                        {alert && (
                          <span
                            className="size-1.5 shrink-0 rounded-full bg-danger"
                            title="Há chamados fora do prazo"
                            aria-label="Há chamados fora do prazo"
                          />
                        )}
                        {count !== undefined && count > 0 && (
                          <span
                            className={cn(
                              "tabular shrink-0 text-[11px]",
                              active
                                ? "text-primary-subtle-foreground"
                                : "text-subtle-foreground",
                            )}
                          >
                            {count}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Rodapé: fecha a coluna e dá a ela começo e fim. Sem isso sobrava um
            vazio grande embaixo da navegação. */}
        <div className="flex shrink-0 items-center gap-0.5 border-t border-border px-2 py-2">
          <UserMenu id={user.id} name={user.name} email={user.email} role={user.role} />
          <span className="ml-auto flex items-center">
            <NotificationBell inicial={counts.unread} />
            <span className="hidden lg:block">
              <ThemeToggle />
            </span>
          </span>
        </div>
      </aside>
    </>
  );
}
