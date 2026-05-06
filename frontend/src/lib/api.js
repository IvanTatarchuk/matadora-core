import { getAccessToken } from "./supabase";
const BASE = import.meta.env.VITE_API_URL ?? "/api/v1";
// ---------------------------------------------------------------------------
// Core fetch helper
// ---------------------------------------------------------------------------
async function apiFetch(path, options = {}) {
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
    if (res.status === 204)
        return undefined;
    return res.json();
}
// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------
export const sessions = {
    create: (title, context) => apiFetch("/sessions", {
        method: "POST",
        body: JSON.stringify({ title, context }),
    }),
    get: (id) => apiFetch(`/sessions/${id}`),
    close: (id) => apiFetch(`/sessions/${id}/close`, { method: "PATCH" }),
    updateSummary: (id, summary) => apiFetch(`/sessions/${id}/summary`, {
        method: "PATCH",
        body: JSON.stringify({ summary }),
    }),
};
// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------
export const messages = {
    list: (sessionId, limit = 50) => apiFetch(`/sessions/${sessionId}/messages?limit=${limit}`),
    send: (sessionId, content, scientist) => apiFetch(`/sessions/${sessionId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content, scientist }),
    }),
    search: (sessionId, query, topK = 5) => apiFetch(`/sessions/${sessionId}/messages/search`, {
        method: "POST",
        body: JSON.stringify({ query, top_k: topK }),
    }),
    stream: async (sessionId, content, scientist, onDelta, onDone, onError) => {
        const token = await getAccessToken();
        const res = await fetch(`${BASE}/sessions/${sessionId}/messages/stream`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
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
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split("\n\n");
            buffer = parts.pop() ?? "";
            for (const part of parts) {
                const line = part.replace(/^data:\s*/, "");
                if (line === "[DONE]") {
                    onDone();
                    return;
                }
                try {
                    const parsed = JSON.parse(line);
                    onDelta(parsed.delta);
                }
                catch {
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
    list: () => apiFetch("/scientists"),
    get: (name) => apiFetch(`/scientists/${name}`),
    sync: () => apiFetch("/scientists/sync", { method: "POST" }),
};
// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------
export const approvals = {
    list: (sessionId) => apiFetch(`/approvals${sessionId ? `?session_id=${sessionId}` : ""}`),
    get: (id) => apiFetch(`/approvals/${id}`),
    review: (id, decision, note) => apiFetch(`/approvals/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ decision, review_note: note }),
    }),
};
// ---------------------------------------------------------------------------
// Technologies (Marketplace)
// ---------------------------------------------------------------------------
export const technologies = {
    list: (status = "published", category) => apiFetch(`/technologies?status=${status}${category ? `&category=${category}` : ""}`),
    get: (id) => apiFetch(`/technologies/${id}`),
    create: (data) => apiFetch("/technologies", {
        method: "POST",
        body: JSON.stringify(data),
    }),
    publish: (id) => apiFetch(`/technologies/${id}/publish`, { method: "POST" }),
    buy: (id) => apiFetch(`/technologies/${id}/buy`, { method: "POST" }),
    myPurchases: () => apiFetch("/technologies/mine"),
};
// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------
export const wallet = {
    get: () => apiFetch("/wallet"),
    transactions: (limit = 20) => apiFetch(`/wallet/transactions?limit=${limit}`),
};
