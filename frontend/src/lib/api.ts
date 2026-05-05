import { getAccessToken } from "./supabase";

const BASE = "/api/v1";

// ---------------------------------------------------------------------------
// Types (mirrors backend Pydantic models)
// ---------------------------------------------------------------------------

export interface Session {
  id:           string;
  title:        string;
  status:       "open" | "paused" | "closed" | "archived";
  initiated_by: string | null;
  context:      Record<string, unknown>;
  summary:      string | null;
  created_at:   string;
  updated_at:   string;
  closed_at:    string | null;
}

export interface Message {
  id:           string;
  session_id:   string;
  scientist_id: string | null;
  role:         "user" | "assistant" | "system" | "tool";
  content:      string;
  metadata:     Record<string, unknown>;
  parent_id:    string | null;
  created_at:   string;
}

export interface Scientist {
  id:         string;
  name:       string;
  role:       string;
  persona:    Record<string, unknown>;
  is_active:  boolean;
  created_at: string;
}

export interface Approval {
  id:          string;
  session_id:  string;
  proposed_by: string | null;
  action_type: string;
  payload:     Record<string, unknown>;
  status:      "pending" | "approved" | "rejected" | "expired";
  reviewed_by: string | null;
  review_note: string | null;
  expires_at:  string | null;
  created_at:  string;
  reviewed_at: string | null;
}

export interface SyncResult {
  synced: string[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// Core fetch helper
// ---------------------------------------------------------------------------

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Unknown API error");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export const sessions = {
  create: (title: string, context?: Record<string, unknown>) =>
    apiFetch<Session>("/sessions", {
      method: "POST",
      body: JSON.stringify({ title, context }),
    }),

  get: (id: string) => apiFetch<Session>(`/sessions/${id}`),

  close: (id: string) =>
    apiFetch<Session>(`/sessions/${id}/close`, { method: "PATCH" }),

  updateSummary: (id: string, summary: string) =>
    apiFetch<void>(`/sessions/${id}/summary`, {
      method: "PATCH",
      body: JSON.stringify({ summary }),
    }),
};

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export const messages = {
  list: (sessionId: string, limit = 50) =>
    apiFetch<Message[]>(`/sessions/${sessionId}/messages?limit=${limit}`),

  send: (sessionId: string, content: string, scientist?: string) =>
    apiFetch<Message>(`/sessions/${sessionId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content, scientist }),
    }),

  search: (sessionId: string, query: string, topK = 5) =>
    apiFetch<Array<{ similarity: number; message: Message }>>(
      `/sessions/${sessionId}/messages/search`,
      {
        method: "POST",
        body: JSON.stringify({ query, top_k: topK }),
      }
    ),

  stream: async (
    sessionId: string,
    content: string,
    scientist: string | undefined,
    onDelta: (delta: string) => void,
    onDone: () => void,
    onError: (err: string) => void
  ): Promise<void> => {
    const token = await getAccessToken();
    const res = await fetch(`${BASE}/sessions/${sessionId}/messages/stream`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ content, scientist }),
    });

    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      onError(err.detail ?? "Stream error");
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const line = part.replace(/^data:\s*/, "");
        if (line === "[DONE]") { onDone(); return; }
        try {
          const parsed = JSON.parse(line) as { delta: string };
          onDelta(parsed.delta);
        } catch {
          // skip malformed chunk
        }
      }
    }
    onDone();
  },
};

// ---------------------------------------------------------------------------
// Scientists
// ---------------------------------------------------------------------------

export const scientists = {
  list: () => apiFetch<Scientist[]>("/scientists"),
  get:  (name: string) => apiFetch<Scientist>(`/scientists/${name}`),
  sync: () => apiFetch<SyncResult>("/scientists/sync", { method: "POST" }),
};

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export const approvals = {
  list: (sessionId?: string) =>
    apiFetch<Approval[]>(`/approvals${sessionId ? `?session_id=${sessionId}` : ""}`),

  get: (id: string) => apiFetch<Approval>(`/approvals/${id}`),

  review: (id: string, decision: "approved" | "rejected", note?: string) =>
    apiFetch<Approval>(`/approvals/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ decision, review_note: note }),
    }),
};
