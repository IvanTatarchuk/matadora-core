-- =============================================================================
-- MATADORA CORE — Ollama migration
-- Change vector dimensions from 1536 (OpenAI) to 768 (nomic-embed-text)
-- =============================================================================

-- Drop ivfflat indexes that depend on the vector columns
DROP INDEX IF EXISTS public.idx_scientists_embedding;
DROP INDEX IF EXISTS public.idx_sessions_summary_vector;
DROP INDEX IF EXISTS public.idx_messages_content_vector;

-- Alter column types (tables are empty so no USING clause needed)
ALTER TABLE public.scientists_core
    ALTER COLUMN embedding TYPE VECTOR(768);

ALTER TABLE public.sessions
    ALTER COLUMN summary_vector TYPE VECTOR(768);

ALTER TABLE public.messages_log
    ALTER COLUMN content_vector TYPE VECTOR(768);

-- Recreate ivfflat indexes with new dimensions
CREATE INDEX idx_scientists_embedding
    ON public.scientists_core
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

CREATE INDEX idx_sessions_summary_vector
    ON public.sessions
    USING ivfflat (summary_vector vector_cosine_ops)
    WITH (lists = 100);

CREATE INDEX idx_messages_content_vector
    ON public.messages_log
    USING ivfflat (content_vector vector_cosine_ops)
    WITH (lists = 200);

-- Update match_messages function signature
CREATE OR REPLACE FUNCTION public.match_messages(
    query_embedding      VECTOR(768),
    match_count          INT              DEFAULT 5,
    similarity_threshold FLOAT            DEFAULT 0.75,
    filter_session_id    UUID             DEFAULT NULL
)
RETURNS TABLE (
    id            UUID,
    session_id    UUID,
    scientist_id  UUID,
    role          TEXT,
    content       TEXT,
    metadata      JSONB,
    parent_id     UUID,
    created_at    TIMESTAMPTZ,
    similarity    FLOAT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id, m.session_id, m.scientist_id, m.role, m.content,
        m.metadata, m.parent_id, m.created_at,
        1 - (m.content_vector <=> query_embedding) AS similarity
    FROM public.messages_log m
    WHERE
        m.content_vector IS NOT NULL
        AND (filter_session_id IS NULL OR m.session_id = filter_session_id)
        AND 1 - (m.content_vector <=> query_embedding) >= similarity_threshold
    ORDER BY m.content_vector <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Update match_scientists function signature
CREATE OR REPLACE FUNCTION public.match_scientists(
    query_embedding      VECTOR(768),
    match_count          INT   DEFAULT 3,
    similarity_threshold FLOAT DEFAULT 0.70
)
RETURNS TABLE (
    id          UUID,
    name        TEXT,
    role        TEXT,
    persona     JSONB,
    similarity  FLOAT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id, s.name, s.role, s.persona,
        1 - (s.embedding <=> query_embedding) AS similarity
    FROM public.scientists_core s
    WHERE
        s.is_active = TRUE
        AND s.embedding IS NOT NULL
        AND 1 - (s.embedding <=> query_embedding) >= similarity_threshold
    ORDER BY s.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
