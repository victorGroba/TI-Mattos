"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Criados x resolvidos por dia. Duas séries na MESMA escala (contagem de
// chamados), num único eixo — nunca dois eixos y, que fariam qualquer relação
// entre as linhas parecer o que o desenho quisesse.
//
// A leitura que importa é o cruzamento: enquanto "criados" fica acima de
// "resolvidos", a fila está crescendo.

export interface ThroughputPoint {
  day: string; // "AAAA-MM-DD"
  created: number;
  resolved: number;
}

const SERIES = [
  { key: "created" as const, label: "Criados", color: "var(--chart-1)" },
  { key: "resolved" as const, label: "Resolvidos", color: "var(--chart-2)" },
];

function formatDay(day: string): string {
  const [, month, date] = day.split("-");
  return `${date}/${month}`;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; value?: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-md border border-border bg-overlay px-3 py-2 shadow-[var(--shadow-raised)]">
      <p className="mb-1 text-xs font-medium text-foreground">
        {label ? formatDay(label) : ""}
      </p>
      {SERIES.map((series) => {
        const point = payload.find((p) => p.dataKey === series.key);
        return (
          <p key={series.key} className="flex items-center gap-1.5 text-xs">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: series.color }}
              aria-hidden
            />
            <span className="text-muted-foreground">{series.label}</span>
            <span className="tabular ml-auto font-medium text-foreground">
              {point?.value ?? 0}
            </span>
          </p>
        );
      })}
    </div>
  );
}

export function ThroughputChart({ data }: { data: ThroughputPoint[] }) {
  return (
    <div>
      {/* Legenda própria em vez da do recharts: assim ela usa os tokens de
          texto do sistema, e a identidade não fica só na cor da linha. */}
      <div className="mb-2 flex flex-wrap items-center gap-4">
        {SERIES.map((series) => (
          <span key={series.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="h-0.5 w-4 rounded-full"
              style={{ backgroundColor: series.color }}
              aria-hidden
            />
            {series.label}
          </span>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid
            stroke="var(--chart-grid)"
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis
            dataKey="day"
            tickFormatter={formatDay}
            tick={{ fill: "var(--subtle-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "var(--chart-grid)" }}
            minTickGap={24}
          />
          <YAxis
            allowDecimals={false}
            width={44}
            tick={{ fill: "var(--subtle-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
          />
          {SERIES.map((series) => (
            <Line
              key={series.key}
              type="monotone"
              dataKey={series.key}
              name={series.label}
              stroke={series.color}
              strokeWidth={2}
              dot={false}
              // Anel na cor da superfície separa os marcadores quando as duas
              // linhas se cruzam no mesmo ponto.
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
