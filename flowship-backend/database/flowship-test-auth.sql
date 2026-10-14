CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
    id uuid PRIMARY KEY,
    aud text,
    role text,
    email text,
    encrypted_password text,
    email_confirmed_at timestamptz,
    raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
    raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    is_sso_user boolean DEFAULT false,
    is_anonymous boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.flowship_user_profiles (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id),
    tenant_id uuid NOT NULL REFERENCES public.flowship_tenants(id),
    display_name text,
    role text NOT NULL,
    status text NOT NULL
);
