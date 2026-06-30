-- Tighten technology ownership updates/publishing.

CREATE OR REPLACE FUNCTION public.technology_owned_by_current_user(p_metadata JSONB)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
    SELECT
        auth.role() = 'service_role'
        OR (
            auth.role() = 'authenticated'
            AND COALESCE(p_metadata->>'created_by', p_metadata->>'created_by_user') = auth.uid()::text
        );
$$;

DROP POLICY IF EXISTS "Authenticated users can update their own" ON public.technologies;

CREATE POLICY "Authenticated users can update their own"
    ON public.technologies FOR UPDATE
    USING (public.technology_owned_by_current_user(metadata))
    WITH CHECK (public.technology_owned_by_current_user(metadata));
