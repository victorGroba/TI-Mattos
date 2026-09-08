/**
 * Slug ASCII a partir de texto em português. Usado para setores e categorias,
 * cujos nomes vêm com acento ("Área Técnica" → "area-tecnica").
 */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove os diacríticos separados pelo NFD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Garante unicidade acrescentando um sufixo numérico. `taken` é mutado para
 * que chamadas seguidas dentro do mesmo lote não colidam entre si.
 */
export function uniqueSlug(value: string, taken: Set<string>): string {
  const base = slugify(value) || "item";
  let candidate = base;
  let n = 2;
  while (taken.has(candidate)) {
    candidate = `${base}-${n}`;
    n += 1;
  }
  taken.add(candidate);
  return candidate;
}
