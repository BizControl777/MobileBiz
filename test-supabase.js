import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('--- Testando Conexão Supabase ---');
console.log('URL:', supabaseUrl);
console.log('Chave configurada:', supabaseKey ? 'Sim (mascarada)' : 'Não');

if (!supabaseUrl || !supabaseKey) {
  console.error('Erro: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não definidos no .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  try {
    // Tenta buscar algo simples. Se a tabela 'licenses' existir (como sugerido no server.js), tentamos ela.
    // Caso contrário, tentamos uma consulta genérica.
    const { data, error } = await supabase.from('licenses').select('count', { count: 'exact', head: true });

    if (error) {
      if (error.code === 'PGRST116' || error.message.includes('not found')) {
        console.log('✓ Conexão estabelecida com sucesso!');
        console.log('Nota: A tabela "licenses" não foi encontrada, mas a autenticação funcionou.');
      } else {
        throw error;
      }
    } else {
      console.log('✓ Conexão estabelecida com sucesso!');
      console.log('✓ Tabela "licenses" acessível.');
    }
  } catch (err) {
    console.error('✗ Erro na conexão:', err.message);
  }
}

testConnection();
