import {
  Building2,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  type LucideIcon,
  Tags,
  Ticket,
  Users,
} from "lucide-react";
import type { Role } from "@/generated/prisma/enums";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Papéis que enxergam o item. Ausente = todos. */
  roles?: Role[];
  /** Marca o item como ativo também nas rotas filhas. */
  matchPrefix?: boolean;
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

const ADMIN_ONLY: Role[] = ["ADMIN"];

export const navSections: NavSection[] = [
  {
    items: [
      { href: "/", label: "Painel", icon: LayoutDashboard, roles: ADMIN_ONLY },
      { href: "/chamados", label: "Chamados", icon: Inbox, roles: ADMIN_ONLY, matchPrefix: true },
      { href: "/meus-chamados", label: "Meus chamados", icon: Ticket, matchPrefix: true },
      { href: "/projetos", label: "Projetos", icon: FolderKanban, roles: ADMIN_ONLY, matchPrefix: true },
    ],
  },
  {
    label: "Administração",
    items: [
      { href: "/admin/usuarios", label: "Usuários", icon: Users, roles: ADMIN_ONLY, matchPrefix: true },
      { href: "/admin/setores", label: "Setores", icon: Building2, roles: ADMIN_ONLY, matchPrefix: true },
      { href: "/admin/categorias", label: "Categorias", icon: Tags, roles: ADMIN_ONLY, matchPrefix: true },
    ],
  },
  // SLA, Integrações (n8n) e Relatórios entram aqui quando as telas ficarem
  // prontas. Um item de menu que leva a 404 é pior que um menu curto.
];

export function visibleSections(role: Role): NavSection[] {
  return navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.roles || item.roles.includes(role)),
    }))
    .filter((section) => section.items.length > 0);
}

/**
 * Um item é ativo na rota exata ou, quando marcado, em qualquer rota abaixo
 * dele — para que /chamados/42 mantenha "Chamados" destacado.
 */
export function isActive(item: NavItem, pathname: string): boolean {
  if (pathname === item.href) return true;
  return Boolean(item.matchPrefix) && pathname.startsWith(`${item.href}/`);
}
