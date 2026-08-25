"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";

/**
 * Barra di ricerca semantica sopra la timeline dei Ricordi. Non filtra per
 * testo esatto: manda la query a /api/search, che la confronta per
 * significato con tutti i ricordi (stesso motore già usato in Chat) e
 * restituisce quelli pertinenti come risultati cliccabili.
 */
export function SearchBar({
  onSearch,
  onClear,
  initialValue,
}: {
  onSearch: (query: string) => void;
  onClear: () => void;
  initialValue?: string;
}) {
  const [value, setValue] = useState(initialValue ?? "");

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (value.trim()) onSearch(value.trim());
  }

  function clear() {
    setValue("");
    onClear();
  }

  return (
    // Stessa forma (bianca, pillola, ombra morbida) della barra di ricerca
    // in Dashboard — vedi DashboardSearchBar.tsx — per coerenza tra i due
    // punti d'ingresso alla stessa ricerca semantica.
    <form onSubmit={submit} className="flex items-center gap-2 bg-white rounded-full px-4 py-3 shadow-sm shadow-celeste-navy/10">
      <Search size={16} className="text-celeste-muted shrink-0" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder='Cerca nei ricordi… es. "viaggio in Cina"'
        className="bg-transparent outline-none flex-1 text-sm text-celeste-navy placeholder:text-celeste-muted"
      />
      {value && (
        <button type="button" onClick={clear} className="text-celeste-muted shrink-0">
          <X size={16} />
        </button>
      )}
    </form>
  );
}
