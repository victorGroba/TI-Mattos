import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { Toaster } from "sonner";
import "./globals.css";

const sans = Inter({
  variable: "--font-sans-stack",
  subsets: ["latin"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-mono-stack",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "HelpDesk — Lab Mattos",
    template: "%s · HelpDesk Lab Mattos",
  },
  description:
    "Chamados de suporte técnico e demandas de projeto da Lab Mattos.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f7" },
    { media: "(prefers-color-scheme: dark)", color: "#12191c" },
  ],
};

/**
 * Nome do cookie de tema. O valor é lido no servidor e vira classe no <html>,
 * então a página já chega pintada — sem script inline e sem flash.
 * Sem cookie, o CSS cai na media query do sistema.
 */
export const THEME_COOKIE = "helpdesk-theme";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = (await cookies()).get(THEME_COOKIE)?.value;
  const themeClass = theme === "dark" ? "dark" : theme === "light" ? "light" : "";

  return (
    <html
      lang="pt-BR"
      className={`${sans.variable} ${mono.variable} ${themeClass} h-full`}
    >
      <body className="min-h-full font-sans">
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            classNames: {
              toast:
                "!bg-surface !text-foreground !border !border-border !shadow-[var(--shadow-raised)]",
              description: "!text-muted-foreground",
            },
          }}
        />
      </body>
    </html>
  );
}
