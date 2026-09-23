"use client";

import Link from "next/link";
import { useActionState, useState, useTransition, type ReactNode } from "react";
import { AlertCircle, FileSignature, Loader2 } from "lucide-react";
import type { AdminState } from "@/app/(app)/admin/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import type { AssetStatus, AssetType } from "@/generated/prisma/enums";
import { createAssetAction, updateAssetAction } from "@/app/(app)/inventario/actions";
import {
  assetStatusLabels,
  assetStatusOrder,
  assetTypeLabels,
  assetTypeOrder,
} from "@/lib/labels";
import { cn } from "@/lib/utils";
import { assetTypeIcons } from "./asset-visuals";
import { PhotoPicker } from "./photo-picker";

// Cadastro e edição de equipamento.
//
// Pensado para ser preenchido no celular, em pé ao lado da máquina: blocos
// curtos, na ordem em que a informação é encontrada (foto, etiqueta,
// configuração, onde está e com quem), e só os campos que fazem sentido para
// o tipo escolhido — um monitor não tem processador, e um campo inútil na
// tela é um campo que a pessoa para para pensar se precisa preencher.

type Campo =
  | "hostname"
  | "processor"
  | "memory"
  | "storage"
  | "operatingSystem"
  | "ipAddress"
  | "macAddress"
  | "remoteAccess";

const CAMPOS_POR_TIPO: Record<AssetType, Campo[]> = {
  DESKTOP: ["hostname", "processor", "memory", "storage", "operatingSystem", "ipAddress", "macAddress", "remoteAccess"],
  NOTEBOOK: ["hostname", "processor", "memory", "storage", "operatingSystem", "ipAddress", "macAddress", "remoteAccess"],
  PHONE: ["storage", "operatingSystem"],
  TABLET: ["storage", "operatingSystem"],
  PRINTER: ["hostname", "ipAddress", "macAddress"],
  NETWORK: ["hostname", "ipAddress", "macAddress"],
  MONITOR: [],
  OTHER: [],
};

export interface AssetFormValues {
  id?: number;
  tag?: string;
  type?: AssetType;
  status?: AssetStatus;
  hostname?: string | null;
  brand?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  processor?: string | null;
  memory?: string | null;
  storage?: string | null;
  operatingSystem?: string | null;
  ipAddress?: string | null;
  macAddress?: string | null;
  remoteAccess?: string | null;
  location?: string | null;
  notes?: string | null;
  teamId?: number | null;
  assigneeId?: number | null;
  purchasedAt?: string | null;
  warrantyUntil?: string | null;
}

export interface AssetFormOptions {
  teams: Array<{ id: number; name: string }>;
  users: Array<{ id: number; name: string; teamId: number | null }>;
  /** Valores já usados em outros cadastros, oferecidos como sugestão. */
  suggestions: Partial<Record<"brand" | "model" | "processor" | "memory" | "storage" | "operatingSystem" | "location", string[]>>;
}

function Bloco({ titulo, dica, children }: { titulo: string; dica?: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <legend className="float-left mb-3 w-full">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
          {titulo}
        </span>
        {dica && <span className="mt-0.5 block text-[12px] text-subtle-foreground">{dica}</span>}
      </legend>
      <div className="clear-both space-y-3">{children}</div>
    </fieldset>
  );
}

/** Lista de sugestões nativa do navegador: autocompleta sem biblioteca. */
function Sugestoes({ id, valores }: { id: string; valores?: string[] }) {
  if (!valores?.length) return null;
  return (
    <datalist id={id}>
      {valores.map((v) => (
        <option key={v} value={v} />
      ))}
    </datalist>
  );
}

export function AssetForm({
  options,
  values = {},
}: {
  options: AssetFormOptions;
  values?: AssetFormValues;
}) {
  const editing = values.id !== undefined;
  const [type, setType] = useState<AssetType | undefined>(values.type);
  const [teamId, setTeamId] = useState(values.teamId ? String(values.teamId) : "");
  const [assigneeId, setAssigneeId] = useState(values.assigneeId ? String(values.assigneeId) : "");

  const campos = new Set(type ? CAMPOS_POR_TIPO[type] : []);
  const s = options.suggestions;
  const trocouResponsavel = editing && assigneeId !== (values.assigneeId ? String(values.assigneeId) : "");

  const [state, formAction, actionPending] = useActionState<AdminState, FormData>(
    editing ? updateAssetAction : createAssetAction,
    {},
  );
  const [transitionPending, startTransition] = useTransition();
  const pending = actionPending || transitionPending;

  return (
    // Envio pelo onSubmit, e não por <form action>: o React limpa os campos
    // não controlados depois de toda action concluída — inclusive quando ela
    // volta com erro de validação. Num cadastro deste tamanho, com fotos, um
    // campo errado apagaria tudo o que foi digitado.
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
      className="space-y-4"
    >
      <div className="space-y-6">
        {editing && <input type="hidden" name="id" value={values.id} />}

        {!editing && (
          <Bloco titulo="Fotos">
            <PhotoPicker />
          </Bloco>
        )}

        <Bloco titulo="Tipo">
          <div
            role="radiogroup"
            aria-label="Tipo de equipamento"
            className="grid grid-cols-4 gap-2 sm:grid-cols-8"
          >
            {assetTypeOrder.map((t) => {
              const Icon = assetTypeIcons[t];
              const ativo = type === t;
              return (
                <label
                  key={t}
                  className={cn(
                    "flex cursor-pointer flex-col items-center gap-1 rounded-md border px-1 py-2.5 text-center transition-colors",
                    ativo
                      ? "border-primary bg-primary-subtle text-primary-subtle-foreground"
                      : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
                  )}
                >
                  <input
                    type="radio"
                    name="type"
                    value={t}
                    checked={ativo}
                    onChange={() => setType(t)}
                    className="sr-only"
                    required
                  />
                  <Icon className="size-5" />
                  <span className="text-[11px] font-medium leading-tight">{assetTypeLabels[t]}</span>
                </label>
              );
            })}
          </div>
          {state.fieldErrors?.type && (
            <p className="text-xs text-danger">{state.fieldErrors.type}</p>
          )}
        </Bloco>

        <Bloco titulo="Identificação">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Patrimônio"
              htmlFor="tag"
              error={state.fieldErrors?.tag}
              hint={editing ? "O número da etiqueta." : "Em branco, o sistema gera (LM-0001…)."}
            >
              <Input
                id="tag"
                name="tag"
                defaultValue={values.tag ?? ""}
                placeholder={editing ? undefined : "Automático"}
                autoCapitalize="characters"
                className="font-mono uppercase"
              />
            </Field>
            {campos.has("hostname") && (
              <Field label="Nome na rede" htmlFor="hostname" error={state.fieldErrors?.hostname}>
                <Input
                  id="hostname"
                  name="hostname"
                  defaultValue={values.hostname ?? ""}
                  placeholder="FIN-NOTE-02"
                  autoCapitalize="characters"
                  className="font-mono"
                />
              </Field>
            )}
            <Field label="Marca" htmlFor="brand" error={state.fieldErrors?.brand}>
              <Input id="brand" name="brand" list="sug-brand" defaultValue={values.brand ?? ""} placeholder="Dell" />
            </Field>
            <Field label="Modelo" htmlFor="model" error={state.fieldErrors?.model}>
              <Input id="model" name="model" list="sug-model" defaultValue={values.model ?? ""} placeholder="Latitude 3420" />
            </Field>
            <Field
              label="Nº de série"
              htmlFor="serialNumber"
              error={state.fieldErrors?.serialNumber}
              hint="Service tag, S/N ou IMEI — fica na etiqueta embaixo ou atrás."
              className="sm:col-span-2"
            >
              <Input
                id="serialNumber"
                name="serialNumber"
                defaultValue={values.serialNumber ?? ""}
                autoCapitalize="characters"
                className="font-mono"
              />
            </Field>
          </div>
        </Bloco>

        {campos.size > (campos.has("hostname") ? 1 : 0) && (
          <Bloco
            titulo="Configuração"
            dica={
              type === "DESKTOP" || type === "NOTEBOOK"
                ? "No Windows: Configurações → Sistema → Sobre mostra processador, memória e o nome."
                : undefined
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {campos.has("processor") && (
                <Field label="Processador" htmlFor="processor" error={state.fieldErrors?.processor}>
                  <Input id="processor" name="processor" list="sug-processor" defaultValue={values.processor ?? ""} placeholder="Core i5-1135G7" />
                </Field>
              )}
              {campos.has("memory") && (
                <Field label="Memória" htmlFor="memory" error={state.fieldErrors?.memory}>
                  <Input id="memory" name="memory" list="sug-memory" defaultValue={values.memory ?? ""} placeholder="16 GB" />
                </Field>
              )}
              {campos.has("storage") && (
                <Field label="Armazenamento" htmlFor="storage" error={state.fieldErrors?.storage}>
                  <Input id="storage" name="storage" list="sug-storage" defaultValue={values.storage ?? ""} placeholder="SSD 256 GB" />
                </Field>
              )}
              {campos.has("operatingSystem") && (
                <Field label="Sistema" htmlFor="operatingSystem" error={state.fieldErrors?.operatingSystem}>
                  <Input id="operatingSystem" name="operatingSystem" list="sug-operatingSystem" defaultValue={values.operatingSystem ?? ""} placeholder="Windows 11 Pro" />
                </Field>
              )}
              {campos.has("ipAddress") && (
                <Field label="IP" htmlFor="ipAddress" error={state.fieldErrors?.ipAddress}>
                  <Input id="ipAddress" name="ipAddress" inputMode="decimal" defaultValue={values.ipAddress ?? ""} placeholder="192.168.0.20" className="font-mono" />
                </Field>
              )}
              {campos.has("macAddress") && (
                <Field label="MAC" htmlFor="macAddress" error={state.fieldErrors?.macAddress}>
                  <Input id="macAddress" name="macAddress" defaultValue={values.macAddress ?? ""} placeholder="A4:BB:6D:…" className="font-mono" />
                </Field>
              )}
              {campos.has("remoteAccess") && (
                <Field
                  label="Acesso remoto"
                  htmlFor="remoteAccess"
                  error={state.fieldErrors?.remoteAccess}
                  hint="ID do AnyDesk ou TeamViewer."
                  className="sm:col-span-2"
                >
                  <Input id="remoteAccess" name="remoteAccess" inputMode="numeric" defaultValue={values.remoteAccess ?? ""} className="font-mono" />
                </Field>
              )}
            </div>
          </Bloco>
        )}

        <Bloco
          titulo="Onde está e com quem"
          dica="Ao definir o responsável, o sistema emite o termo de responsabilidade e avisa a pessoa para assinar."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Responsável" htmlFor="assigneeId" error={state.fieldErrors?.assigneeId}>
              <Select
                id="assigneeId"
                name="assigneeId"
                value={assigneeId}
                onChange={(e) => {
                  const id = e.target.value;
                  setAssigneeId(id);
                  // O setor da máquina costuma ser o de quem a usa. Só
                  // preenche quando ainda está vazio, para não desfazer uma
                  // escolha feita de propósito.
                  const pessoa = options.users.find((u) => String(u.id) === id);
                  if (!teamId && pessoa?.teamId) setTeamId(String(pessoa.teamId));
                }}
              >
                <option value="">Ninguém (em estoque)</option>
                {options.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Setor" htmlFor="teamId" error={state.fieldErrors?.teamId}>
              <Select id="teamId" name="teamId" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                <option value="">Sem setor</option>
                {options.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Local" htmlFor="location" error={state.fieldErrors?.location} hint="Sala, andar, mesa.">
              <Input id="location" name="location" list="sug-location" defaultValue={values.location ?? ""} placeholder="Sala 2, mesa 4" />
            </Field>
            <Field
              label="Situação"
              htmlFor="status"
              hint="Com responsável, passa a “em uso”; sem, volta ao estoque."
            >
              <Select id="status" name="status" defaultValue={values.status ?? "IN_STOCK"}>
                {assetStatusOrder.map((st) => (
                  <option key={st} value={st}>
                    {assetStatusLabels[st]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {trocouResponsavel && (
            <p className="flex items-start gap-2 rounded-md bg-info-subtle px-3 py-2 text-[12px] leading-relaxed text-info">
              <FileSignature className="mt-px size-4 shrink-0" />
              Ao salvar, o termo atual é encerrado e
              {assigneeId ? " um novo é emitido para a nova pessoa assinar." : " a máquina volta sem responsável."}
            </p>
          )}
        </Bloco>

        <Bloco titulo="Aquisição">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Data de compra" htmlFor="purchasedAt" error={state.fieldErrors?.purchasedAt}>
              <Input id="purchasedAt" name="purchasedAt" type="date" defaultValue={values.purchasedAt ?? ""} />
            </Field>
            <Field label="Garantia até" htmlFor="warrantyUntil" error={state.fieldErrors?.warrantyUntil}>
              <Input id="warrantyUntil" name="warrantyUntil" type="date" defaultValue={values.warrantyUntil ?? ""} />
            </Field>
          </div>
        </Bloco>

        <Bloco titulo="Observações">
          <Field label="Anotações livres" htmlFor="notes" error={state.fieldErrors?.notes}>
            <Textarea
              id="notes"
              name="notes"
              rows={4}
              defaultValue={values.notes ?? ""}
              placeholder="Tela com risco no canto, bateria segura ~2h, carregador fica na gaveta…"
            />
          </Field>
        </Bloco>

        <Sugestoes id="sug-brand" valores={s.brand} />
        <Sugestoes id="sug-model" valores={s.model} />
        <Sugestoes id="sug-processor" valores={s.processor} />
        <Sugestoes id="sug-memory" valores={s.memory} />
        <Sugestoes id="sug-storage" valores={s.storage} />
        <Sugestoes id="sug-operatingSystem" valores={s.operatingSystem} />
        <Sugestoes id="sug-location" valores={s.location} />
      </div>

      {state.error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2 text-[13px] text-danger"
        >
          <AlertCircle className="mt-px size-4 shrink-0" />
          {state.error}
        </p>
      )}

      {/* Rodapé fixo no celular: num formulário longo, o botão de salvar
          não pode ficar a seis rolagens de distância. */}
      <div className="sticky bottom-0 -mx-4 flex items-center gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:backdrop-blur-none">
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {pending ? "Salvando…" : editing ? "Salvar alterações" : "Cadastrar equipamento"}
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href={editing ? `/inventario/${values.id}` : "/inventario"}>Cancelar</Link>
        </Button>
      </div>
    </form>
  );
}
