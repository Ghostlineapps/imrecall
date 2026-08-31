// Contenuto informativo generico settimana-per-settimana, sullo stesso
// modello (dimensione + una riga di cosa cambia) usato in praticamente ogni
// app di gravidanza — nessuna indicazione clinica, nessun consiglio: solo
// informazioni generali di sviluppo prenatale. Le indicazioni sulla propria
// gravidanza specifica restano sempre e solo del ginecologo — vedi la nota
// in cima a /gravidanza.
export type WeeklyEntry = { week: number; size: string; note: string };

export const WEEKLY_CONTENT: WeeklyEntry[] = [
  { week: 4, size: "un semino di papavero", note: "L'ovulo fecondato si è appena impiantato nell'utero." },
  { week: 5, size: "un seme di sesamo", note: "Iniziano a formarsi il tubo neurale e l'abbozzo del cuore." },
  { week: 6, size: "un pisello", note: "Il cuore comincia a battere, spesso visibile alla prima ecografia." },
  { week: 7, size: "un mirtillo", note: "Si formano gli abbozzi di braccia e gambe." },
  { week: 8, size: "un lampone", note: "Da questa settimana si parla di feto, non più di embrione." },
  { week: 9, size: "una ciliegia", note: "Dita delle mani e dei piedi iniziano a separarsi." },
  { week: 10, size: "una prugna", note: "Le articolazioni principali sono tutte abbozzate." },
  { week: 11, size: "un fico", note: "Le unghie iniziano a formarsi." },
  { week: 12, size: "una prugna grande", note: "Fine del primo trimestre: i riflessi cominciano a svilupparsi." },
  { week: 13, size: "un baccello di pisello", note: "Si formano le impronte digitali." },
  { week: 14, size: "un limone", note: "Il viso comincia ad assumere espressioni." },
  { week: 15, size: "una mela", note: "Lo scheletro si sta rafforzando, ancora in gran parte cartilagineo." },
  { week: 16, size: "un avocado", note: "Possono comparire i primi movimenti, non ancora percepibili." },
  { week: 17, size: "una pera", note: "Si accumula il primo grasso corporeo." },
  { week: 18, size: "un peperone", note: "Con l'ecografia morfologica spesso si può scoprire il sesso." },
  { week: 19, size: "un pomodoro grande", note: "Si forma il vernice caseosa, la pellicola protettiva della pelle." },
  { week: 20, size: "una banana", note: "Metà gravidanza: molte mamme iniziano a sentire i primi movimenti." },
  { week: 21, size: "una carota", note: "I movimenti diventano via via più percepibili." },
  { week: 22, size: "una zucchina", note: "Ciglia e sopracciglia sono ormai formate." },
  { week: 23, size: "un mango grande", note: "L'udito si sta sviluppando: comincia a percepire i suoni." },
  { week: 24, size: "una pannocchia di mais", note: "I polmoni continuano a maturare." },
  { week: 25, size: "una rapa", note: "Comincia a farsi una piccola riserva di grasso." },
  { week: 26, size: "una zucca piccola", note: "Gli occhi iniziano ad aprirsi." },
  { week: 27, size: "un cavolfiore", note: "Inizia il terzo trimestre." },
  { week: 28, size: "una melanzana", note: "Il cervello sta crescendo rapidamente." },
  { week: 29, size: "una zucca butternut", note: "Ossa e muscoli continuano a rafforzarsi." },
  { week: 30, size: "un cavolo cappuccio", note: "Il cervello continua il suo sviluppo più intenso." },
  { week: 31, size: "un cocco", note: "Comincia a regolare meglio la propria temperatura corporea." },
  { week: 32, size: "un jicama", note: "Le unghie arrivano quasi alla punta delle dita." },
  { week: 33, size: "un ananas", note: "Le ossa del cranio restano flessibili, utili per il parto." },
  { week: 34, size: "un melone piccolo", note: "Il sistema immunitario continua a maturare." },
  { week: 35, size: "un melone honeydew", note: "I reni sono ormai pienamente sviluppati." },
  { week: 36, size: "una lattuga romana", note: "Di solito si posiziona a testa in giù in vista del parto." },
  { week: 37, size: "un porro", note: "Da questa settimana la gravidanza è considerata a termine precoce." },
  { week: 38, size: "un porro grande", note: "Continua ad accumulare grasso corporeo." },
  { week: 39, size: "una piccola anguria", note: "Gravidanza a termine pieno: può nascere in qualsiasi momento." },
  { week: 40, size: "una zucca piccola", note: "È la settimana della data presunta del parto." },
];

// Ritorna la voce della settimana più vicina (in difetto) a quella indicata,
// così anche le settimane non elencate esplicitamente (es. la 3 o la 41+)
// mostrano comunque il contenuto più pertinente invece di lasciare la
// scheda vuota.
export function weeklyEntryFor(week: number): WeeklyEntry {
  const clamped = Math.max(4, Math.min(40, week));
  let best = WEEKLY_CONTENT[0];
  for (const entry of WEEKLY_CONTENT) {
    if (entry.week <= clamped) best = entry;
  }
  return best;
}
