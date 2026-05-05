-- Matadora Core — Migration 002: Marketplace & Currency
-- Run against your Supabase project SQL editor

-- ---------------------------------------------------------------------------
-- 1. Technologies (patent-like inventions created by scientists)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.technologies (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    title            TEXT        NOT NULL,
    description      TEXT        NOT NULL,
    summary          TEXT        DEFAULT '',
    category         TEXT        NOT NULL DEFAULT 'general',
    status           TEXT        NOT NULL DEFAULT 'draft'
                                 CHECK (status IN ('draft','published','sold','archived')),
    inventor_ids     UUID[]      DEFAULT '{}',
    session_id       UUID        REFERENCES public.sessions(id) ON DELETE SET NULL,
    price_mtd        NUMERIC(18,4) NOT NULL DEFAULT 0,
    content_vector   vector(768),
    metadata         JSONB       DEFAULT '{}',
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS technologies_status_idx   ON public.technologies(status);
CREATE INDEX IF NOT EXISTS technologies_category_idx ON public.technologies(category);
CREATE INDEX IF NOT EXISTS technologies_vector_idx
    ON public.technologies USING ivfflat (content_vector vector_cosine_ops) WITH (lists = 50);

ALTER TABLE public.technologies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone can read published technologies"
    ON public.technologies FOR SELECT USING (status = 'published' OR auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can insert"
    ON public.technologies FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can update their own"
    ON public.technologies FOR UPDATE USING (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- 2. Matadora Wallets (one per user)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.matadora_wallets (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    balance    NUMERIC(18,4) NOT NULL DEFAULT 100,   -- new users get 100 MTD
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.matadora_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own wallet"
    ON public.matadora_wallets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role manages wallets"
    ON public.matadora_wallets FOR ALL USING (auth.role() = 'service_role');

-- Auto-create wallet on new user signup
CREATE OR REPLACE FUNCTION public.create_wallet_for_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.matadora_wallets (user_id) VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_wallet ON auth.users;
CREATE TRIGGER on_auth_user_created_wallet
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.create_wallet_for_new_user();

-- ---------------------------------------------------------------------------
-- 3. Matadora Transactions (ledger)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.matadora_transactions (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id      UUID        NOT NULL REFERENCES public.matadora_wallets(id) ON DELETE CASCADE,
    type           TEXT        NOT NULL
                               CHECK (type IN ('deposit','purchase','refund','reward','withdrawal')),
    amount         NUMERIC(18,4) NOT NULL,
    technology_id  UUID        REFERENCES public.technologies(id) ON DELETE SET NULL,
    description    TEXT        DEFAULT '',
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS transactions_wallet_idx ON public.matadora_transactions(wallet_id);

ALTER TABLE public.matadora_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own transactions"
    ON public.matadora_transactions FOR SELECT
    USING (wallet_id IN (SELECT id FROM public.matadora_wallets WHERE user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. Technology Purchases
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.technology_purchases (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    technology_id  UUID        NOT NULL REFERENCES public.technologies(id) ON DELETE CASCADE,
    price_paid_mtd NUMERIC(18,4) NOT NULL,
    purchased_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, technology_id)
);

ALTER TABLE public.technology_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own purchases"
    ON public.technology_purchases FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Authenticated users can purchase"
    ON public.technology_purchases FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 5. RPC: buy_technology (atomic debit + purchase record)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.buy_technology(
    p_user_id      UUID,
    p_technology_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_price        NUMERIC(18,4);
    v_balance      NUMERIC(18,4);
    v_wallet_id    UUID;
    v_title        TEXT;
BEGIN
    SELECT price_mtd, title INTO v_price, v_title
    FROM public.technologies
    WHERE id = p_technology_id AND status = 'published';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Technology not found or not published');
    END IF;

    -- Check already purchased
    IF EXISTS (SELECT 1 FROM public.technology_purchases WHERE user_id = p_user_id AND technology_id = p_technology_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Already purchased');
    END IF;

    SELECT id, balance INTO v_wallet_id, v_balance
    FROM public.matadora_wallets WHERE user_id = p_user_id;

    IF v_balance < v_price THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient MTD balance',
            'required', v_price, 'available', v_balance);
    END IF;

    -- Debit wallet
    UPDATE public.matadora_wallets SET balance = balance - v_price, updated_at = NOW()
    WHERE id = v_wallet_id;

    -- Record transaction
    INSERT INTO public.matadora_transactions (wallet_id, type, amount, technology_id, description)
    VALUES (v_wallet_id, 'purchase', -v_price, p_technology_id, 'Purchased: ' || v_title);

    -- Record purchase
    INSERT INTO public.technology_purchases (user_id, technology_id, price_paid_mtd)
    VALUES (p_user_id, p_technology_id, v_price);

    RETURN jsonb_build_object('success', true, 'price_paid', v_price,
        'new_balance', v_balance - v_price, 'technology', v_title);
END;
$$;
