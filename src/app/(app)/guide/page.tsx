import {
  Compass,
  Plus,
  Users,
  FileUp,
  Search,
  MessageCircle,
  CalendarClock,
  MapPin,
  Sparkles,
} from "lucide-react";

// Pagina di sola lettura, contenuto statico: nessun dato utente da
// caricare. Riusa (adattata ai nomi attuali dei pulsanti) la guida già
// scritta per il post Instagram "Come si usa" — stesso testo, stesso
// ordine, qui semplicemente sempre a portata di mano nell'app invece che
// solo su Instagram.
// 2026-08-26: palette celeste (nona schermata convertita).
const SECTIONS = [
  {
    icon: Compass,
    title: "Dashboard e il cerchio",
    text: "Il cerchio in Dashboard porta direttamente alle sezioni principali — Ricordi, Chat, Calendario, Scadenze, Profilo. Il pulsante + al centro (e quello fluttuante su ogni altra schermata) apre la cattura.",
  },
  {
    icon: Plus,
    title: "Salvare qualcosa",
    text: "Tocca il + (in Dashboard o quello fluttuante) e scegli il tipo: testo, foto, voce, riunione, documento o link. Conferma — titolo, categorie e collegamenti li trova IMRECALL da sola.",
  },
  {
    icon: Users,
    title: "Registrare una riunione",
    text: "Nel foglio di cattura tocca \"Riunione\", appoggia il telefono vicino all'altoparlante e registra (fino a un'ora). Allo stop arrivano da soli trascrizione, riassunto, temi e mappa mentale — tradotti in italiano se la riunione era in un'altra lingua.",
  },
  {
    icon: FileUp,
    title: "Caricare un documento",
    text: "Tocca \"File\" e scegli un PDF, Word, Excel o PowerPoint dal telefono. IMRECALL legge il contenuto e lo rende cercabile, non solo il nome del file.",
  },
  {
    icon: Search,
    title: "Cercare qualcosa",
    text: "Dalla barra di ricerca in Dashboard o in Ricordi, scrivi con parole tue cosa stai cercando. Non serve il termine esatto: la ricerca capisce il significato, non solo le parole uguali.",
  },
  {
    icon: MessageCircle,
    title: "Fare domande in chat",
    text: "Apri Chat e chiedi, per esempio: \"mi ricordi la scheda della palestra?\". Risponde attingendo solo a quello che hai salvato tu — non inventa.",
  },
  {
    icon: CalendarClock,
    title: "Scadenze e appuntamenti automatici",
    text: "Fotografa un documento o registra una riunione: se emerge una data, IMRECALL crea da sola una scadenza o un appuntamento. Li trovi nelle tab dedicate, senza doverli scrivere a mano.",
  },
  {
    icon: MapPin,
    title: "Consigli nei paraggi",
    text: "Imposta i tuoi interessi in Profilo → Il tuo profilo. Quando arrivi in un posto nuovo, la Dashboard suggerisce cosa potrebbe piacerti lì vicino.",
  },
  {
    icon: Sparkles,
    title: "Si ricorda le cose da sola",
    text: "Non richiede nessuna azione: \"Accadde oggi\" un anno fa, sei di nuovo in un posto dove volevi tornare, un riepilogo prima di partire — arrivano da soli in Dashboard o come notifica.",
  },
];

export default function GuidePage() {
  return (
    <div className="bg-celeste-bg min-h-full px-4 pt-6 space-y-6 pb-4 text-celeste-navy">
      <div>
        <h1 className="text-xl font-semibold">Istruzioni</h1>
        <p className="text-sm text-celeste-muted mt-1">
          Una guida rapida a come funziona IMRECALL, passo per passo.
        </p>
      </div>

      <div className="space-y-3">
        {SECTIONS.map(({ icon: Icon, title, text }) => (
          <div key={title} className="card-light flex gap-3">
            <div className="w-9 h-9 rounded-full bg-celeste-navy/5 flex items-center justify-center text-celeste-accent shrink-0">
              <Icon size={18} />
            </div>
            <div className="min-w-0">
              <p className="font-medium">{title}</p>
              <p className="text-sm text-celeste-muted mt-1">{text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
