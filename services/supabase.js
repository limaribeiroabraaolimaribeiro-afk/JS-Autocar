const { createClient } = require('@supabase/supabase-js');

const url  = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const svc  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon) {
  console.error('ERRO: SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórios no .env');
  process.exit(1);
}

// Cliente público (respeita Row Level Security)
const supabase = createClient(url, anon);

// Cliente de serviço (ignora RLS — use apenas no backend)
const supabaseAdmin = createClient(url, svc || anon);

module.exports = { supabase, supabaseAdmin };
