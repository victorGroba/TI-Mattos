import { requireAdmin } from "@/lib/session";

export default async function InventoryLayout({ children }: LayoutProps<"/inventario">) {
  // Inventário é ferramenta da TI. O colaborador vê só as próprias máquinas,
  // em /meus-equipamentos; a checagem no layout cobre todas as rotas abaixo.
  await requireAdmin();
  return children;
}
