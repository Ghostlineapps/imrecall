type LogomarkProps = {
  size?: number;
  className?: string;
};

// Il segno scelto per IMRECALL (vedi BACKLOG.md, 2026-08-21, mix "Orbita
// nel Monogramma"): lo stesso cerchio con il puntino che orbita del
// cerchio-hub della Dashboard, già usato per l'icona dell'app installata
// sul telefono. In bianco, pensato per stare sopra la sfumatura celeste
// dell'header — non un colore a sé, deriva da dove viene mostrato.
export function Logomark({ size = 20, className }: LogomarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      <circle cx="32" cy="32" r="22" fill="none" stroke="white" strokeWidth="5" strokeOpacity="0.85" />
      <circle cx="32" cy="32" r="6" fill="white" />
      <circle cx="49" cy="18" r="5" fill="white" fillOpacity="0.85" />
    </svg>
  );
}
