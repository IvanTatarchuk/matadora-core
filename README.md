# Matadora Core

> Multi-agent AI research platform where autonomous **scientist agents** collaborate, reason, and propose actions — with a human-in-the-loop approval gate.

---

## Project Structure

```
matadora-core/
│
├── backend/                        # Server-side logic
│   ├── database/
│   │   └── schema.sql              # Supabase schema: tables, pgvector, RLS policies
│   ├── agents/                     # Scientist agent definitions & orchestration (Phase 2)
│   ├── api/                        # REST / WebSocket endpoints           (Phase 3)
│   └── services/                   # Shared services: embeddings, memory  (Phase 2)
│
├── frontend/                       # User-facing interface                 (Phase 4)
│   ├── src/
│   └── public/
│
├── shared/                         # Types, constants, utilities shared between
│   └── types/                      # backend and frontend
│
├── docs/                           # Architecture decisions, API contracts
│
└── README.md
```

---

## Development Phases

| Phase | Name | Status | Description |
|-------|------|--------|-------------|
| **1** | Memory Foundation | ✅ In progress | Supabase schema, pgvector, RLS |
| **2** | Agent Core | 🔲 Planned | Scientist agents, memory read/write, embeddings |
| **3** | API Layer | 🔲 Planned | FastAPI/Edge Functions, auth, streaming |
| **4** | Frontend | 🔲 Planned | Session UI, approval dashboard, real-time feed |
| **5** | Orchestration | 🔲 Planned | Multi-agent workflows, critic loop, tool-use |

---

## Database Schema (Phase 1)

### Tables

| Table | Purpose |
|-------|---------|
| `scientists_core` | Registry of AI-scientist agents (roles, personas, domain embeddings) |
| `sessions` | Work contexts grouping related messages and decisions |
| `messages_log` | Immutable append-only message log with semantic embeddings for RAG |
| `approval_queue` | Human-in-the-loop gate for high-risk proposed actions |

### Key Design Decisions

- **pgvector (`VECTOR(1536)`)** — all semantic content is embedded with OpenAI `text-embedding-3-small` and stored as 1536-dim vectors. IVFFlat indexes enable sub-second ANN retrieval.
- **Append-only `messages_log`** — RLS prevents `UPDATE`/`DELETE` for authenticated users; only the service role can mutate records, preserving audit integrity.
- **JSONB blobs** (`persona`, `context`, `metadata`, `payload`) — flexible schema evolution without migrations for exploratory fields.
- **`approval_queue`** — every consequential action proposed by a scientist is enqueued here; a human (or lead scientist) must approve/reject before execution.
- **RLS policies** — `service_role` has unrestricted access; `authenticated` role gets read-heavy access with write restrictions that enforce business rules at the database level.

---

## Getting Started

### Prerequisites

- [Supabase](https://supabase.com) project (or local `supabase start`)
- PostgreSQL ≥ 15 with `pgvector` extension available

### Apply the Schema

```bash
# Using Supabase CLI
supabase db push

# Or directly with psql
psql "$DATABASE_URL" -f backend/database/schema.sql
```

### Environment Variables

```env
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # backend only — never expose to client
OPENAI_API_KEY=<openai-key>                    # for embedding generation
```

---

## Contributing

Work is organised around **Phases**. Each phase has its own sub-folder and is tracked in the issue board. All schema changes go through a reviewed migration file in `backend/database/`.

---

*Matadora Core — Phase 1 bootstrapped on 2026-05-05.*
