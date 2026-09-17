"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { ShareButton } from "./ShareButton";
import { shareText } from "@/lib/share";

// Mappa mentale interattiva: sostituisce il vecchio disegno SVG statico
// (src/components/memory/MindMap.tsx, generato da mermaid) che l'utente ha
// segnalato (2026-09-17) come "una semplice immagine che non riesco a
// ingrandire". Qui i nodi sono elementi DOM veri, non un disegno: niente
// zoom/pan necessario, ci si naviga toccando i rami per espandere/collassare
// i sotto-punti — la struttura arriva già pronta dal server (vedi
// buildMindMapTree in src/app/api/upload/meeting/route.ts).
export interface MindMapNode {
  label: string;
  children?: MindMapNode[];
}

function TreeNode({ node, depth }: { node: MindMapNode; depth: number }) {
  const hasChildren = !!node.children?.length;
  // Radice e argomenti di primo livello aperti di default (colpo d'occhio
  // sull'intera struttura); gli eventuali sotto-punti restano collassati
  // finché non si tocca il ramo, per tenere la mappa compatta.
  const [expanded, setExpanded] = useState(depth < 2);

  return (
    <div className={depth > 0 ? "border-l border-celeste-navy/10 pl-3 ml-1.5" : ""}>
      <button
        type="button"
        onClick={() => hasChildren && setExpanded((e) => !e)}
        disabled={!hasChildren}
        className={`flex items-start gap-1.5 py-1.5 text-left w-full ${
          hasChildren ? "active:opacity-60" : "cursor-default"
        }`}
      >
        {hasChildren ? (
          <ChevronRight
            size={14}
            className={`shrink-0 mt-1 text-celeste-navy/40 transition-transform ${
              expanded ? "rotate-90" : ""
            }`}
          />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <span
          className={
            depth === 0
              ? "font-semibold text-celeste-navy"
              : depth === 1
                ? "text-celeste-navy/90 text-sm font-medium"
                : "text-celeste-navy/70 text-sm"
          }
        >
          {node.label}
        </span>
      </button>

      {hasChildren && expanded && (
        <div>
          {node.children!.map((child, i) => (
            <TreeNode key={i} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// Serializza l'albero in un elenco indentato leggibile fuori dall'app —
// il pannello di condivisione nativo manda solo testo semplice, non i nodi
// espandibili della UI.
function treeToText(node: MindMapNode, depth = 0): string {
  const prefix = depth === 0 ? "" : `${"  ".repeat(depth - 1)}- `;
  const line = `${prefix}${node.label}`;
  const children = node.children?.map((child) => treeToText(child, depth + 1)).join("\n") ?? "";
  return children ? `${line}\n${children}` : line;
}

export function MindMapTree({ root }: { root: MindMapNode }) {
  return (
    <div className="card-light">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-celeste-muted">Mappa mentale</p>
        <ShareButton label="Condividi mappa mentale" onShare={() => shareText(root.label, treeToText(root))} />
      </div>
      <TreeNode node={root} depth={0} />
    </div>
  );
}
