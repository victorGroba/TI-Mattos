import { Sidebar } from "@/components/shell/sidebar";
import { getSidebarCounts } from "@/lib/sidebar-counts";
import { requireUser } from "@/lib/session";

// Sem cabeçalho no desktop: o que ficaria nele (ação principal, tema, conta)
// mora na própria coluna lateral, e a faixa de 48px volta para o conteúdo.
// No mobile a Sidebar renderiza a sua própria barra com o botão da gaveta.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Toda rota dentro de (app) passa por aqui: um layout de servidor é a
  // fronteira de autenticação, e nenhuma página abaixo renderiza sem ela.
  const user = await requireUser();
  const counts = await getSidebarCounts(user);

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <Sidebar
        user={{ id: user.id, name: user.name, email: user.email, role: user.role }}
        counts={counts}
      />

      <main className="mx-auto w-full max-w-[1360px] min-w-0 flex-1 px-4 py-6 sm:px-6">
        {children}
      </main>
    </div>
  );
}
