-- =============================================================================
-- MATADORA CORE — Phase 2: pgvector RPC functions
-- Apply after 20250501000000_schema.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.match_messages(
    query_embedding      VECTOR(1536),
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

COMMENT ON FUNCTION public.match_messages IS
    'Cosine-similarity nearest-neighbour search over messages_log.content_vector.';

-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.match_scientists(
    query_embedding      VECTOR(1536),
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

COMMENT ON FUNCTION public.match_scientists IS
    'Route a query to the most domain-relevant scientist agents using cosine similarity.';
