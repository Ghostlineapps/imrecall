"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

// Cerca nei ricordi direttamente dalla Dashboard: la query viene passata
// alla tab Ricordi (che ospita la ricerca semantica vera e propria), non
// duplicata qui — un solo motore di ricerca, un solo posto che lo implementa.
export function DashboardSearchBar() {
  const router = useRouter();
  const [value, setValue] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    router.push(`/timeline?q=${encodeURIComponent(value.trim())}`);
  }

  return (
    <form
      onSubmit={submit}
      className="flex items-center gap-3 bg-white rounded-full px-5 py-3.5 shadow-md shadow-celeste-navy/10"
    >
      <Search size={18} className="text-celeste-muted shrink-0" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Cerca nei tuoi ricordi…"
        className="bg-transparent outline-none flex-1 text-sm text-celeste-navy placeholder:text-celeste-muted"
      />
    </form>
  );
}
