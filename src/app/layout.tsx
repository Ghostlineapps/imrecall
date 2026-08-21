import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "IMRECALL — la tua memoria, sempre con te",
  description:
    "Cattura pensieri, foto e voce. IMRECALL li ricorda per te — e te li fa ritrovare al momento giusto: nel posto giusto, nel giorno giusto.",
  manifest: "/manifest.json",
  // Senza questo, Safari/iOS non trova nessuna icona dedicata per "Aggiungi
  // a Home" e si inventa da solo un placeholder — la prima lettera del
  // titolo su sfondo nero, che è esattamente la "I" bianca su nero senza
  // alcun design vista sul telefono (screenshot utente, 21/08). Il
  // manifest.json aveva già le icone corrette per Android/Chrome, ma iOS
  // non le legge da lì: gli serve un <link rel="apple-touch-icon"> esplicito,
  // che solo `metadata.icons` genera. icon-192/512.png ora contengono il
  // logo scelto (mix "Orbita nel Monogramma": il cerchio con il puntino
  // della Dashboard dentro la piastrella sfumata) — vedi BACKLOG.md.
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  // Allineato alla nuova icona/palette celeste (vedi metadata.icons sopra):
  // prima era #0F0F11, il nero del vecchio tema, e colorava la barra di
  // stato/status bar di iOS in modo incoerente col resto.
  themeColor: "#375F7D",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
