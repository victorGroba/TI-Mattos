"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/usuarios", label: "Usuários" },
  { href: "/admin/setores", label: "Setores" },
  { href: "/admin/categorias", label: "Categorias" },
];

export function AdminTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-5 border-b border-border">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              // A aba ativa é marcada por uma régua sob o texto, não por um
              // fundo: mantém a leitura horizontal limpa e o peso na palavra.
              "-mb-px border-b-2 pb-2 text-[13px] transition-colors",
              active
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
