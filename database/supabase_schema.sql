-- ====================================================
-- JS AutoCar - Supabase Schema
-- Execute este SQL no SQL Editor do Supabase
-- ====================================================

-- Serviços
CREATE TABLE IF NOT EXISTS services (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  price       DECIMAL(10,2),
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  image_url   TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Agendamentos
CREATE TABLE IF NOT EXISTS appointments (
  id              SERIAL PRIMARY KEY,
  customer        JSONB NOT NULL,
  vehicle         JSONB NOT NULL,
  service         JSONB NOT NULL,
  scheduled_date  DATE NOT NULL,
  scheduled_time  TIME NOT NULL,
  status          TEXT NOT NULL DEFAULT 'novo',
  notes           TEXT,
  seen_by_admin   BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Clientes
CREATE TABLE IF NOT EXISTS customers (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  phone          TEXT NOT NULL,
  email          TEXT,
  vehicle_plate  TEXT,
  vehicle_model  TEXT,
  metadata       JSONB,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- Mensagens de contato
CREATE TABLE IF NOT EXISTS messages (
  id             SERIAL PRIMARY KEY,
  customer_name  TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  content        TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'novo',
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Galeria
CREATE TABLE IF NOT EXISTS gallery (
  id          SERIAL PRIMARY KEY,
  title       TEXT,
  description TEXT,
  image_url   TEXT NOT NULL,
  category    TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Configurações (chave-valor)
CREATE TABLE IF NOT EXISTS settings (
  id         SERIAL PRIMARY KEY,
  key        TEXT NOT NULL UNIQUE,
  value      JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Horários disponíveis (para o calendário de agendamento)
CREATE TABLE IF NOT EXISTS time_slots (
  id         SERIAL PRIMARY KEY,
  date       DATE NOT NULL,
  time       TIME NOT NULL,
  blocked    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(date, time)
);

-- ─────────────────────────────────────────────────────
-- Índices para performance
-- ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_appointments_date     ON appointments(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status   ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_time_slots_date       ON time_slots(date);
CREATE INDEX IF NOT EXISTS idx_customers_phone       ON customers(phone);

-- ─────────────────────────────────────────────────────
-- Trigger: atualiza updated_at automaticamente
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER services_updated_at     BEFORE UPDATE ON services     FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER appointments_updated_at BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER customers_updated_at    BEFORE UPDATE ON customers    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER gallery_updated_at      BEFORE UPDATE ON gallery      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER settings_updated_at     BEFORE UPDATE ON settings     FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────
-- Dados iniciais: configurações
-- ─────────────────────────────────────────────────────
INSERT INTO settings (key, value) VALUES
  ('whatsapp_numero',       '"5547999999999"'),
  ('endereco',              '"Endereço não configurado"'),
  ('horario_funcionamento', '"Seg-Sex 8h às 18h | Sáb 8h às 14h"'),
  ('instagram',             '"@jsautocar"'),
  ('texto_chamada',         '"Agende seu serviço de lavação agora!"'),
  ('maps_url',              '""')
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────
-- Dados iniciais: serviços
-- ─────────────────────────────────────────────────────
INSERT INTO services (name, description, price, duration_minutes, is_active) VALUES
  ('Limpeza Pesada Interna e Externa', 'Limpeza completa interna e externa do veículo, incluindo aspiração e higienização.',             120.00, 120, true),
  ('Limpeza Detalhada',                'Detalhamento profissional completo com produtos premium.',                                        200.00, 180, true),
  ('Polimento de Faróis',              'Recuperação e polimento profissional dos faróis para melhorar visibilidade.',                      80.00,  60, true),
  ('Enceramento',                      'Enceramento protetor da pintura para brilho duradouro e proteção contra raios UV.',               90.00,  90, true),
  ('Sistema Leva e Traz',              'Buscamos e devolvemos seu veículo no endereço desejado (disponível para região central).',        30.00,  30, true)
ON CONFLICT DO NOTHING;
