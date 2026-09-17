// src/stores/captureQueueStore.ts
//
// Stato reattivo (Zustand) sopra la coda offline (src/lib/offlineQueue.ts):
// tiene traccia di cosa è in attesa di upload, cosa si sta caricando in
// questo momento, e riprova automaticamente i falliti quando torna la
// connessione. È il "motore" dietro l'indicatore visivo
// (PendingUploadsIndicator) e viene avviato una sola volta per sessione
// da useCaptureQueueSync(), montato nel layout dell'app.

"use client";

import { create } from "zustand";
import { mutate } from "swr";
import {
  enqueueCapture,
  listPendingCaptures,
  markCaptureAttemptFailed,
  removePendingCapture,
  setCaptureRemotePath,
  type PendingCapture,
  type PendingCaptureKind,
} from "@/lib/offlineQueue";
import { uploadCapture, UploadError } from "@/lib/uploadCapture";

export type PendingCaptureStatus = "pending" | "uploading" | "error";

export interface PendingCaptureSummary {
  id: string;
  kind: PendingCaptureKind;
  createdAt: number;
  status: PendingCaptureStatus;
  lastError: string | null;
  /** 2026-09-17: esposto per mostrare il dettaglio tecnico dopo un po' di
   * tentativi falliti — vedi PendingUploadsIndicator.tsx. */
  attempts: number;
}

function toSummary(item: PendingCapture, status: PendingCaptureStatus): PendingCaptureSummary {
  return {
    id: item.id,
    kind: item.kind,
    createdAt: item.createdAt,
    status,
    lastError: item.lastError,
    attempts: item.attempts,
  };
}

interface CaptureQueueState {
  items: PendingCaptureSummary[];
  processing: boolean;
  hydrated: boolean;
  /** Carica lo stato iniziale da IndexedDB (una sola volta per sessione). */
  hydrate: () => Promise<void>;
  /** Salva subito una nuova registrazione in coda (prima ancora di tentare l'upload). */
  enqueue: (kind: PendingCaptureKind, blob: Blob, duration: number) => Promise<string>;
  /** Da chiamare quando un upload "diretto" (non dalla coda) va a buon fine, per ripulire la riga corrispondente. */
  markUploaded: (id: string) => Promise<void>;
  /**
   * 2026-09-17: registra che il blob di questa voce è già stato caricato su
   * Storage a `remotePath` — vedi commento su PendingCapture.remotePath in
   * offlineQueue.ts. Chiamata sia dal tentativo diretto (Audio/MeetingRecorder)
   * sia da un retry dalla coda, subito dopo la fase 1 dell'upload.
   */
  setRemotePath: (id: string, remotePath: string) => Promise<void>;
  /** Tenta di caricare tutte le registrazioni in coda, una alla volta. */
  processQueue: () => Promise<void>;
}

export const useCaptureQueueStore = create<CaptureQueueState>((set, get) => ({
  items: [],
  processing: false,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const pending = await listPendingCaptures();
      set({ items: pending.map((p) => toSummary(p, "pending")), hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  enqueue: async (kind, blob, duration) => {
    try {
      const item = await enqueueCapture(kind, blob, duration);
      set((state) => ({ items: [...state.items, toSummary(item, "pending")] }));
      return item.id;
    } catch {
      // Se anche il salvataggio in coda fallisce (IndexedDB non disponibile,
      // storage pieno...) non possiamo fare altro che segnalarlo a chi chiama:
      // niente id di coda, quindi l'unico tentativo sarà quello diretto.
      return "";
    }
  },

  markUploaded: async (id) => {
    if (!id) return;
    await removePendingCapture(id).catch(() => {});
    set((state) => ({ items: state.items.filter((i) => i.id !== id) }));
  },

  setRemotePath: async (id, remotePath) => {
    if (!id) return;
    await setCaptureRemotePath(id, remotePath).catch(() => {});
  },

  processQueue: async () => {
    if (get().processing) return;
    const pending = await listPendingCaptures().catch(() => [] as PendingCapture[]);
    if (pending.length === 0) {
      set({ items: [] });
      return;
    }

    set({ processing: true, items: pending.map((p) => toSummary(p, "pending")) });

    let anyUploaded = false;
    for (const item of pending) {
      set((state) => ({
        items: state.items.map((i) => (i.id === item.id ? { ...i, status: "uploading" } : i)),
      }));
      try {
        await uploadCapture(item.kind, item.blob, item.duration, {
          remotePath: item.remotePath,
          onUploaded: (remotePath) => setCaptureRemotePath(item.id, remotePath).catch(() => {}),
        });
        await removePendingCapture(item.id);
        anyUploaded = true;
        set((state) => ({ items: state.items.filter((i) => i.id !== item.id) }));
      } catch (err) {
        const permanent = err instanceof UploadError && err.permanent;
        // 2026-09-17: prima qui finiva err.message, che per un UploadError è
        // sempre solo il "code" (es. "network_error") — mai la causa reale.
        // technicalDetail conserva l'eccezione originale (vedi
        // uploadCapture.ts), così lastError in coda è utile per diagnosticare
        // davvero, non solo per dire "qualcosa è fallito".
        const message =
          err instanceof UploadError ? err.technicalDetail : err instanceof Error ? err.message : "upload_failed";
        console.error("Upload da coda offline fallito", item.kind, message);
        if (permanent) {
          // Il server ha già rifiutato definitivamente questo file: tenerlo
          // in coda vorrebbe dire ritentare per sempre un upload che non
          // andrà mai a buon fine.
          await removePendingCapture(item.id).catch(() => {});
          set((state) => ({ items: state.items.filter((i) => i.id !== item.id) }));
        } else {
          await markCaptureAttemptFailed(item.id, message).catch(() => {});
          set((state) => ({
            items: state.items.map((i) =>
              i.id === item.id ? { ...i, status: "error", lastError: message, attempts: i.attempts + 1 } : i
            ),
          }));
        }
      }
    }

    if (anyUploaded) mutate("/api/memories");
    set({ processing: false });
  },
}));
