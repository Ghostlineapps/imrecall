import crypto from "crypto";

// Il refresh token Google concede accesso di lunga durata a Gmail (lettura)
// e Google Calendar (scrittura) dell'utente: va cifrato a riposo nel
// database, non salvato in chiaro come i normali campi di configurazione.
// AES-256-GCM: cifratura autenticata, l'unico requisito è una chiave a 32
// byte in GOOGLE_TOKEN_ENCRYPTION_KEY (base64 o hex), generata una tantum
// e messa nelle Environment Variables di Vercel — mai nel repo.
const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const raw = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY non configurata");
  }
  // Accetta sia base64 che hex per comodità in fase di generazione della chiave.
  const key = raw.length === 64 ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY deve rappresentare esattamente 32 byte");
  }
  return key;
}

/** Restituisce "iv:authTag:ciphertext", tutto in base64, come stringa unica salvabile in una colonna text. */
export function encryptToken(plainText: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12); // 96 bit, dimensione raccomandata per GCM
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptToken(stored: string): string {
  const [ivB64, authTagB64, ciphertextB64] = stored.split(":");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Formato token cifrato non valido");
  }
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}
