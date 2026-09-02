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
}

function toSummary(item: PendingCapture, status: PendingCaptureStatus): PendingCaptureSummary {
  return { id: item.id, kind: item.kind, createdAt: item.createdAt, status, lastError: item.lastError };
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
        await uploadCapture(item.kind, item.blob, item.duration);
        await removePendingCapture(item.id);
        anyUploaded = true;
        set((state) => ({ items: state.items.filter((i) => i.id !== item.id) }));
      } catch (err) {
        const permanent = err instanceof UploadError && err.permanent;
        const message = err instanceof Error ? err.message : "upload_failed";
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
              i.id === item.id ? { ...i, status: "error", lastError: message } : i
            ),
          }));
        }
      }
    }

    if (anyUploaded) mutate("/api/memories");
    set({ processing: false });
  },
}));
