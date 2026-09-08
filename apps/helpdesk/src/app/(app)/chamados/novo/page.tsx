import type { Metadata } from "next";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { isAdmin } from "@/lib/rbac";
import { requireUser } from "@/lib/session";
import { getFormOptions } from "@/lib/ticket-queries";
import { TicketForm } from "./ticket-form";

export const metadata: Metadata = { title: "Novo chamado" };
export const dynamic = "force-dynamic";

export default async function NewTicketPage() {
  const user = await requireUser("/chamados/novo");
  const options = await getFormOptions();

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <PageHeader
        title="Abrir chamado"
        description="Suporte técnico ou demanda de mudança em um projeto."
      />

      <Card>
        <CardBody>
          <TicketForm options={options} isAdmin={isAdmin(user.role)} />
        </CardBody>
      </Card>
    </div>
  );
}
