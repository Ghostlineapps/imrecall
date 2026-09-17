"use client";

import { useEffect, useRef, useState } from "react";
import { ShareButton } from "./ShareButton";
import { shareText } from "@/lib/share";

// Le mappe legacy sono sintassi mermaid grezza (righe indentate con
// ((titolo)), [nodo], {nodo}...); per la condivisione basta togliere i
// delimitatori di forma e la riga "mindmap" per ottenere un elenco leggibile.
function mermaidToText(syntax: string): string {
  return syntax
    .split("\n")
    .filter((line) => line.trim() && !/^\s*mindmap\s*$/.test(line))
    .map((line) => line.replace(/[[\](){}]/g, "").trimEnd())
    .join("\n");
}

// Renderizza la mappa mentale visiva delle riunioni (richiesta dall'utente
// come alternativa allo stile Plaud Note) a partire dalla sintassi mermaid
// "mindmap" generata lato server in /api/upload/meeting/route.ts
// (buildMindMapMermaid, salvata in memories.metadata.mind_map). mermaid
// manipola il DOM per disegnare l'SVG, quindi il rendering avviene solo qui
// lato client (import dinamico, mai lato server/SSR).
export function MindMap({ mermaidSyntax }: { mermaidSyntax: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "strict" });
        const id = `mindmap-${Math.random().toString(36).slice(2)}`;
        const { svg } = await mermaid.render(id, mermaidSyntax);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (err) {
        // Il testo generato da GPT è quasi sempre pulito (vedi sanitize in
        // buildMindMapMermaid), ma in caso di sintassi imprevista è meglio
        // nascondere la card che mostrare un errore di rendering rotto —
        // riassunto e temi restano comunque visibili come testo sopra.
        console.error("Rendering mappa mentale fallito", err);
        if (!cancelled) setFailed(true);
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [mermaidSyntax]);

  if (failed) return null;

  return (
    <div className="card overflow-x-auto">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-white/40">Mappa mentale</p>
        <ShareButton
          label="Condividi mappa mentale"
          onShare={() => shareText("Mappa mentale", mermaidToText(mermaidSyntax))}
          className="text-white/40 hover:text-white/70"
        />
      </div>
      <div ref={containerRef} className="min-w-[280px] flex justify-center" />
    </div>
  );
}
