-- Tighten technology ownership updates/publishing.

DROP POLICY IF EXISTS "Authenticated users can update their own" ON public.technologies;

CREATE POLICY "Authenticated users can update their own"
    ON public.technologies FOR UPDATE
    USING (
        auth.role() = 'service_role'
        OR (
            auth.role() = 'authenticated'
            AND COALESCE(metadata->>'created_by', metadata->>'created_by_user') = auth.uid()::text
        )
    )
    WITH CHECK (
        auth.role() = 'service_role'
        OR (
            auth.role() = 'authenticated'
            AND COALESCE(metadata->>'created_by', metadata->>'created_by_user') = auth.uid()::text
        )
    );
