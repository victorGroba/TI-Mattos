"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";

// Quadro de assinatura.
//
// Canvas com eventos de ponteiro, que cobrem mouse, dedo e caneta com o mesmo
// código. O fundo é sempre branco e a tinta sempre escura, nos dois temas: é
// uma folha de papel, e a imagem gravada precisa sair legível na impressão do
// termo, que é sempre em papel branco.

const TINTA = "#1b262b";
const ALTURA = 180;

export function SignaturePad({
  name,
  onChange,
}: {
  name: string;
  onChange?: (assinado: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const desenhando = useRef(false);
  const ultimo = useRef<{ x: number; y: number } | null>(null);
  const [vazio, setVazio] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Resolução real multiplicada pela densidade da tela: sem isso o traço
    // sai serrilhado no celular, que tem 2–3 pixels físicos por pixel CSS.
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const largura = canvas.parentElement?.clientWidth ?? 480;
    canvas.width = Math.round(largura * dpr);
    canvas.height = Math.round(ALTURA * dpr);
    canvas.style.width = `${largura}px`;
    canvas.style.height = `${ALTURA}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = TINTA;
    ctx.fillStyle = TINTA;
    ctx.lineWidth = 2.2;
  }, []);

  function ponto(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function exportar() {
    const canvas = canvasRef.current;
    if (!canvas || !inputRef.current) return;
    inputRef.current.value = canvas.toDataURL("image/png");
  }

  function limpar() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    if (inputRef.current) inputRef.current.value = "";
    setVazio(true);
    onChange?.(false);
  }

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-md border border-border-strong bg-white">
        <canvas
          ref={canvasRef}
          // touch-action: none impede que o dedo role a página em vez de
          // desenhar — sem isso, assinar no celular é impossível.
          className="block cursor-crosshair touch-none"
          aria-label="Área de assinatura"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            desenhando.current = true;
            const p = ponto(e);
            ultimo.current = p;
            // Um toque sem arrastar ainda deixa um ponto, como numa caneta.
            const ctx = e.currentTarget.getContext("2d");
            ctx?.beginPath();
            ctx?.arc(p.x, p.y, 1.1, 0, Math.PI * 2);
            ctx?.fill();
          }}
          onPointerMove={(e) => {
            if (!desenhando.current || !ultimo.current) return;
            const ctx = e.currentTarget.getContext("2d");
            if (!ctx) return;
            const p = ponto(e);
            // Segmentos curtos com ponta arredondada: na frequência em que o
            // navegador entrega os eventos, o traço já sai contínuo.
            ctx.beginPath();
            ctx.moveTo(ultimo.current.x, ultimo.current.y);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            ultimo.current = p;
          }}
          onPointerUp={() => {
            if (!desenhando.current) return;
            desenhando.current = false;
            ultimo.current = null;
            exportar();
            if (vazio) {
              setVazio(false);
              onChange?.(true);
            }
          }}
          onPointerCancel={() => {
            desenhando.current = false;
            ultimo.current = null;
          }}
        />
        {vazio && (
          <span className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[13px] text-[#82949c]">
            Assine aqui com o dedo ou o mouse
          </span>
        )}
        <span className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-dashed border-[#c8d2d5]" />
      </div>

      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={limpar} disabled={vazio}>
          <Eraser />
          Limpar
        </Button>
      </div>

      <input ref={inputRef} type="hidden" name={name} />
    </div>
  );
}
