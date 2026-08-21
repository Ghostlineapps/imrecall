// Layout minimale per le pagine pensate per la stampa (vedi
// /expenses/export): niente BottomNav, niente pulsante di cattura
// fluttuante, niente check-in di posizione — sono tutte cose pensate per
// l'app, non per un documento che l'utente stampa o salva come PDF.
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-white text-black">{children}</div>;
}
