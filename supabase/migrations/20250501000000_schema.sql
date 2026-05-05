-- =============================================================================
-- MATADORA CORE — Phase 1: Memory Foundation
-- Database Schema for Supabase (PostgreSQL + pgvector)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "vector";          -- pgvector for embeddings

-- ---------------------------------------------------------------------------
-- 1. scientists_core
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scientists_core (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT        NOT NULL,
    role            TEXT        NOT NULL,
    persona         JSONB       NOT NULL DEFAULT '{}',
    embedding       VECTOR(1536),
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scientists_role
    ON public.scientists_core (role);

CREATE INDEX IF NOT EXISTS idx_scientists_embedding
    ON public.scientists_core
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

COMMENT ON TABLE  public.scientists_core             IS 'Registry of all AI-scientist agents in the Matadora Core system.';
COMMENT ON COLUMN public.scientists_core.persona     IS 'Structured JSON describing personality, specialisation, and behavioural constraints.';
COMMENT ON COLUMN public.scientists_core.embedding   IS '1536-dim vector (text-embedding-3-small) representing the scientist domain.';

-- ---------------------------------------------------------------------------
-- 2. sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sessions (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    title           TEXT        NOT NULL DEFAULT 'Untitled Session',
    status          TEXT        NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'paused', 'closed', 'archived')),
    initiated_by    UUID        REFERENCES public.scientists_core (id) ON DELETE SET NULL,
    context         JSONB       NOT NULL DEFAULT '{}',
    summary         TEXT,
    summary_vector  VECTOR(1536),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_status
    ON public.sessions (status);

CREATE INDEX IF NOT EXISTS idx_sessions_initiated_by
    ON public.sessions (initiated_by);

CREATE INDEX IF NOT EXISTS idx_sessions_summary_vector
    ON public.sessions
    USING ivfflat (summary_vector vector_cosine_ops)
    WITH (lists = 100);

COMMENT ON TABLE  public.sessions                    IS 'Work sessions grouping a coherent chain of messages and decisions.';
COMMENT ON COLUMN public.sessions.summary_vector     IS 'Semantic embedding of the session summary for similarity retrieval.';

-- ---------------------------------------------------------------------------
-- 3. messages_log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.messages_log (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID        NOT NULL REFERENCES public.sessions (id) ON DELETE CASCADE,
    scientist_id    UUID        REFERENCES public.scientists_core (id) ON DELETE SET NULL,
    role            TEXT        NOT NULL
                        CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content         TEXT        NOT NULL,
    content_vector  VECTOR(1536),
    metadata        JSONB       NOT NULL DEFAULT '{}',
    parent_id       UUID        REFERENCES public.messages_log (id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_session
    ON public.messages_log (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_scientist
    ON public.messages_log (scientist_id);

CREATE INDEX IF NOT EXISTS idx_messages_content_vector
    ON public.messages_log
    USING ivfflat (content_vector vector_cosine_ops)
    WITH (lists = 200);

COMMENT ON TABLE  public.messages_log                IS 'Immutable log of all messages. Supports RAG via content_vector index.';
COMMENT ON COLUMN public.messages_log.parent_id      IS 'Self-reference for threaded / branching conversations.';
COMMENT ON COLUMN public.messages_log.content_vector IS '1536-dim embedding used for semantic nearest-neighbour retrieval.';

-- ---------------------------------------------------------------------------
-- 4. approval_queue
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.approval_queue (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID        NOT NULL REFERENCES public.sessions (id) ON DELETE CASCADE,
    proposed_by     UUID        REFERENCES public.scientists_core (id) ON DELETE SET NULL,
    action_type     TEXT        NOT NULL,
    payload         JSONB       NOT NULL DEFAULT '{}',
    status          TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    reviewed_by     UUID        REFERENCES public.scientists_core (id) ON DELETE SET NULL,
    review_note     TEXT,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_approval_status
    ON public.approval_queue (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_approval_session
    ON public.approval_queue (session_id);

COMMENT ON TABLE  public.approval_queue              IS 'Human-in-the-loop gate for high-risk actions proposed by AI scientists.';
COMMENT ON COLUMN public.approval_queue.action_type  IS 'Categorises the action: tool_call, publish, delete, escalate, etc.';
COMMENT ON COLUMN public.approval_queue.expires_at   IS 'Optional deadline; item transitions to ''expired'' if not reviewed in time.';

-- ---------------------------------------------------------------------------
-- 5. updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_scientists_updated_at
    BEFORE UPDATE ON public.scientists_core
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_sessions_updated_at
    BEFORE UPDATE ON public.sessions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. Row-Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.scientists_core  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_queue   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_all_scientists" ON public.scientists_core
    FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "auth_read_active_scientists" ON public.scientists_core
    FOR SELECT TO authenticated USING (is_active = TRUE);

CREATE POLICY "service_all_sessions" ON public.sessions
    FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "auth_read_sessions" ON public.sessions
    FOR SELECT TO authenticated USING (status <> 'archived');

CREATE POLICY "auth_insert_sessions" ON public.sessions
    FOR INSERT TO authenticated WITH CHECK (status IN ('open', 'paused'));

CREATE POLICY "service_all_messages" ON public.messages_log
    FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "auth_read_messages" ON public.messages_log
    FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "auth_insert_messages" ON public.messages_log
    FOR INSERT TO authenticated WITH CHECK (TRUE);

CREATE POLICY "service_all_approval" ON public.approval_queue
    FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "auth_read_approval" ON public.approval_queue
    FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "auth_insert_approval" ON public.approval_queue
    FOR INSERT TO authenticated WITH CHECK (status = 'pending');
