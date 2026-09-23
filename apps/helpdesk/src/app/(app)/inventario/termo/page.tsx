import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { TermTemplateForm } from "@/components/inventory/term-template-form";
import { PageHeader } from "@/components/ui/misc";
import { Section } from "@/components/ui/section";
import { getTermTemplate, isDefaultTermTemplate } from "@/lib/assets";
import { TERM_PLACEHOLDERS } from "@/lib/inventory";

export const metadata: Metadata = { title: "Modelo do termo" };
export const dynamic = "force-dynamic";

export default async function TermTemplatePage() {
  const [template, padrao] = await Promise.all([getTermTemplate(), isDefaultTermTemplate()]);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          href="/inventario"
          className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Inventário
        </Link>
        <PageHeader
          title="Modelo do termo de responsabilidade"
          description={padrao ? "usando o modelo padrão" : "modelo personalizado"}
        />
      </div>

      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[1fr_17rem]">
        <TermTemplateForm template={template} padrao={padrao} />

        <aside className="space-y-6">
          <Section title="Campos automáticos">
            <ul className="space-y-2">
              {TERM_PLACEHOLDERS.map((p) => (
                <li key={p.key}>
                  <code className="rounded bg-surface-muted px-1 py-px font-mono text-[12px] text-foreground">
                    {`{{${p.key}}}`}
                  </code>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">{p.description}</p>
                </li>
              ))}
            </ul>
          </Section>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Mudanças valem só para os termos emitidos daqui em diante. Os já emitidos guardam o texto
            exato que foi apresentado — é isso que dá valor à assinatura. Para aplicar o texto novo a
            quem já assinou, use “Reemitir termo” na página do equipamento.
          </p>
          <p className="rounded-md bg-warning-subtle px-3 py-2 text-[12px] leading-relaxed text-warning">
            O modelo padrão é um ponto de partida. Peça ao RH ou ao jurídico para revisar antes de
            coletar as assinaturas.
          </p>
        </aside>
      </div>
    </div>
  );
}
