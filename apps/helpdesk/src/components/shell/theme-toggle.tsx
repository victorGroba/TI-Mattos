"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

const COOKIE = "helpdesk-theme";
const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * O tema vive em duas camadas: um cookie, lido pelo servidor para carimbar a
 * classe no <html> já no HTML inicial (sem flash), e a própria classe no DOM,
 * que o botão troca na hora para a resposta ser instantânea.
 *
 * A leitura usa useSyncExternalStore porque o estado mora fora do React — no
 * elemento <html>. Com useState + useEffect haveria renderização em cascata e,
 * pior, uma segunda fonte de verdade capaz de divergir do que está pintado.
 */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });

  // Sem classe explícita, quem manda é a preferência do sistema — que pode
  // mudar com o usuário na tela.
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);

  return () => {
    observer.disconnect();
    media.removeEventListener("change", onChange);
  };
}

function getSnapshot(): boolean {
  const root = document.documentElement;
  if (root.classList.contains("dark")) return true;
  if (root.classList.contains("light")) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** No servidor o tema é desconhecido; null evita renderizar o ícone errado. */
function getServerSnapshot(): boolean | null {
  return null;
}

/** Grava a escolha no DOM (efeito imediato) e no cookie (lido pelo servidor). */
function aplicar(escuro: boolean): void {
  const root = document.documentElement;
  root.classList.toggle("dark", escuro);
  root.classList.toggle("light", !escuro);
  // SameSite=Lax: o cookie é só preferência visual, não precisa viajar em
  // requisição de terceiro.
  document.cookie = `${COOKIE}=${escuro ? "dark" : "light"}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
}

/**
 * Versão para dentro de um menu: linha com rótulo, em vez de botão de ícone.
 * O tema é preferência de conta, então mora junto do nome — e devolve espaço
 * ao rodapé da barra, que estava truncando o nome do usuário.
 */
export function ThemeMenuItem() {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <button
      type="button"
      onClick={() => aplicar(!getSnapshot())}
      className="flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-[13px] text-muted-foreground outline-none transition-colors hover:bg-surface-muted hover:text-foreground"
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      {isDark === null ? "Tema" : isDark ? "Tema claro" : "Tema escuro"}
    </button>
  );
}

export function ThemeToggle() {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => aplicar(!getSnapshot()), []);

  const label = isDark ? "Usar tema claro" : "Usar tema escuro";

  return (
    <Button variant="ghost" size="icon" onClick={toggle} title={label} aria-label={label}>
      {isDark === null ? <span className="size-4" /> : isDark ? <Sun /> : <Moon />}
    </Button>
  );
}
