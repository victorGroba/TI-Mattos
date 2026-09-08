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

export function ThemeToggle() {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    const next = !getSnapshot();
    const root = document.documentElement;
    root.classList.toggle("dark", next);
    root.classList.toggle("light", !next);
    // SameSite=Lax: o cookie é só preferência visual, não precisa viajar em
    // requisição de terceiro.
    document.cookie = `${COOKIE}=${next ? "dark" : "light"}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
  }, []);

  const label = isDark ? "Usar tema claro" : "Usar tema escuro";

  return (
    <Button variant="ghost" size="icon" onClick={toggle} title={label} aria-label={label}>
      {isDark === null ? <span className="size-4" /> : isDark ? <Sun /> : <Moon />}
    </Button>
  );
}
