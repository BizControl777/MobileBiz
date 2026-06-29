-- ==========================================
-- ESTRUTURA ATUALIZADA - BIZCONTROL
-- SISTEMA DE LICENCIAMENTO COM LOGIN OFFLINE
-- ==========================================

-- 1. Criação/Atualização da Tabela
CREATE TABLE IF NOT EXISTS public.licenses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  license_key text NOT NULL,
  company_name text NOT NULL,
  
  -- Novos campos de identificação e autenticação
  owner_name text NULL,
  phone text NULL,
  login_email text NULL,
  login_password text NULL,
  
  device_id text NULL,
  plan text NULL DEFAULT 'monthly'::text,
  status text NULL DEFAULT 'pending'::text,
  version text NULL,
  last_ip text NULL,
  notes text NULL,
  total_employees integer DEFAULT 0,
  created_at timestamp with time zone NULL DEFAULT CURRENT_TIMESTAMP,
  activated_at timestamp with time zone NULL,
  expires_at timestamp with time zone NULL,
  last_validation_at timestamp with time zone NULL,
  next_validation_at timestamp with time zone NULL,
  
  CONSTRAINT licenses_pkey PRIMARY KEY (id),
  CONSTRAINT licenses_license_key_key UNIQUE (license_key),
  CONSTRAINT licenses_plan_check CHECK (plan = ANY (ARRAY['monthly'::text, 'yearly'::text])),
  CONSTRAINT licenses_status_check CHECK (status = ANY (ARRAY['active'::text, 'blocked'::text, 'expired'::text, 'pending'::text]))
) TABLESPACE pg_default;

-- 2. Habilitar Row Level Security (RLS)
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

-- 3. POLÍTICAS DE SEGURANÇA (RLS)

-- A) ADMIN: Controle total (Portal Online)
DROP POLICY IF EXISTS "Admin tem controle total" ON public.licenses;
CREATE POLICY "Admin tem controle total" 
ON public.licenses 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- B) ERP CLIENTE: Leitura (Para o sistema offline buscar a licença e dados de login)
DROP POLICY IF EXISTS "Clientes podem ler licenças para validar" ON public.licenses;
CREATE POLICY "Clientes podem ler licenças para validar" 
ON public.licenses 
FOR SELECT 
TO anon 
USING (true);

-- C) ERP CLIENTE: Ativação (Para o sistema offline gravar o Device ID)
DROP POLICY IF EXISTS "Clientes podem atualizar para ativação" ON public.licenses;
CREATE POLICY "Clientes podem atualizar para ativação" 
ON public.licenses 
FOR UPDATE 
TO anon 
USING (true)
WITH CHECK (true);

-- 4. Índices para Performance
CREATE INDEX IF NOT EXISTS idx_licenses_key ON public.licenses(license_key);
CREATE INDEX IF NOT EXISTS idx_licenses_device ON public.licenses(device_id);
CREATE INDEX IF NOT EXISTS idx_licenses_email ON public.licenses(login_email);
