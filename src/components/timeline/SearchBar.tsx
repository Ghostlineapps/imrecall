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
}: {
  onSearch: (query: string) => void;
  onClear: () => void;
}) {
  const [value, setValue] = useState("");

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (value.trim()) onSearch(value.trim());
  }

  function clear() {
    setValue("");
    onClear();
  }

  return (
    <form onSubmit={submit} className="input-field flex items-center gap-2">
      <Search size={16} className="text-white/30 shrink-0" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder='Cerca nei ricordi… es. "viaggio in Cina"'
        className="bg-transparent outline-none flex-1 text-sm placeholder:text-white/30"
      />
      {value && (
        <button type="button" onClick={clear} className="text-white/30 shrink-0">
          <X size={16} />
        </button>
      )}
    </form>
  );
}
