import { AdminTabs } from "@/components/admin/admin-tabs";
import { requireAdmin } from "@/lib/session";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // Uma checagem só, no layout, cobre todas as rotas de administração —
  // nenhuma página abaixo renderiza sem passar por aqui.
  await requireAdmin();

  return (
    <div className="space-y-6">
      <AdminTabs />
      {children}
    </div>
  );
}
