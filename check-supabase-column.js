import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("ERRO: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados no .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkColumn() {
  console.log("--- Verificando Estrutura da Tabela 'licenses' ---");
  
  // Tentar buscar uma linha para ver as colunas retornadas
  const { data, error } = await supabase
    .from('licenses')
    .select('*')
    .limit(1);

  if (error) {
    console.error("Erro ao consultar tabela:", error.message);
    return;
  }

  if (data && data.length >= 0) {
    const columns = data.length > 0 ? Object.keys(data[0]) : [];
    console.log("Colunas encontradas:", columns);
    
    if (columns.includes('total_employees')) {
      console.log("✅ A coluna 'total_employees' JÁ EXISTE no Supabase.");
    } else {
      console.log("❌ A coluna 'total_employees' NÃO FOI ENCONTRADA.");
      console.log("Por favor, execute o comando SQL no painel do Supabase:");
      console.log("ALTER TABLE public.licenses ADD COLUMN total_employees integer DEFAULT 0;");
    }
  }
}

checkColumn();
