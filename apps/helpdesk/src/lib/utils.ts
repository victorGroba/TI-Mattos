import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Junta classes condicionais resolvendo conflitos do Tailwind (p-2 vs p-4). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
