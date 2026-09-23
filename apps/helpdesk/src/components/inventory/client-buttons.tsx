"use client";

import type { ComponentProps } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Botão de envio que pede confirmação antes. Para ações que não se desfazem
 * com um clique (apagar foto, devolver equipamento).
 */
export function ConfirmSubmit({
  message,
  ...props
}: ComponentProps<typeof Button> & { message: string }) {
  return (
    <Button
      type="submit"
      {...props}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    />
  );
}

export function PrintButton({ label = "Imprimir / PDF" }: { label?: string }) {
  return (
    <Button type="button" variant="secondary" size="sm" onClick={() => window.print()}>
      <Printer />
      {label}
    </Button>
  );
}
