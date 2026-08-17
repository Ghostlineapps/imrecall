"use client";

import { useChat as useVercelChat } from "ai/react";

export function useChat(sessionId?: string) {
  return useVercelChat({
    api: "/api/chat",
    body: { session_id: sessionId },
    // Il body dell'hook usa "messages"; il nostro endpoint si aspetta
    // "query" — normalizziamo con un piccolo wrapper qui sotto se serve
    // adattare il payload esatto lato client in fase di integrazione.
  });
}
