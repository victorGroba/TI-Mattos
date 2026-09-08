// Formatação para leitura humana, sempre em pt-BR e no fuso de São Paulo.
// Datas são renderizadas no servidor; fixar o fuso evita o descasamento de
// hidratação entre o container (UTC) e o navegador.

const TZ = "America/Sao_Paulo";

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const shortDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  day: "2-digit",
  month: "short",
});

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return dateTimeFormatter.format(new Date(date));
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return dateFormatter.format(new Date(date));
}

export function formatShortDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return shortDateFormatter.format(new Date(date));
}

/**
 * Duração legível a partir de minutos. Usa dias de 8 horas acima de uma
 * semana de trabalho, porque os minutos vêm do relógio de horário útil —
 * "3d" aqui significa três dias de expediente, não 72 horas corridas.
 */
export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "—";
  if (minutes < 1) return "<1min";
  if (minutes < 60) return `${Math.round(minutes)}min`;

  const hours = minutes / 60;
  if (hours < 8) {
    const h = Math.floor(hours);
    const m = Math.round(minutes - h * 60);
    return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
  }

  const days = Math.floor(hours / 8);
  const restHours = Math.round(hours - days * 8);
  return restHours > 0 ? `${days}d ${restHours}h` : `${days}d`;
}

/** "há 3 dias", "em 2 horas" — para prazos e atividade recente. */
export function formatRelative(
  date: Date | string | null | undefined,
  now: Date = new Date(),
): string {
  if (!date) return "—";

  const target = new Date(date);
  const diffMs = target.getTime() - now.getTime();
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 365 * 86_400_000],
    ["month", 30 * 86_400_000],
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
  ];

  for (const [unit, ms] of units) {
    if (Math.abs(diffMs) >= ms) {
      return rtf.format(Math.round(diffMs / ms), unit);
    }
  }
  return "agora";
}

/** Percentual inteiro, com o traço quando não há base para calcular. */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
