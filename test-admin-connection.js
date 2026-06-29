import { createClient } from '@supabase/supabase-js';

// Dados configurados no app.js
const SUPABASE_URL = "https://fumeskdjohvhclnltlnv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_f6pHS3QKnc6g4IO2VTR9sQ_ZLTHl7Di";

console.log('--- Testando Conexão do Admin Portal (Simulação de Browser) ---');
console.log('URL:', SUPABASE_URL);
console.log('Chave Pública:', SUPABASE_ANON_KEY);

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testAdminAccess() {
  try {
    // 1. Testar leitura pública (deve funcionar por causa da política SELECT para anon)
    const { data, error } = await supabase
      .from('licenses')
      .select('license_key')
      .limit(1);

    if (error) {
      console.error('✗ Erro ao tentar ler licenças com chave pública:', error.message);
      if (error.message.includes('permission denied')) {
        console.log('Dica: Verifique se as políticas de RLS foram aplicadas no SQL Editor.');
      }
    } else {
      console.log('✓ Conexão com chave pública OK!');
      console.log('✓ Leitura de licenças (Modo Público) funcionando.');
    }

    // 2. Testar se o Auth está respondendo
    const { data: authData, error: authError } = await supabase.auth.getSession();
    if (authError) {
      console.error('✗ Erro no serviço de Autenticação:', authError.message);
    } else {
      console.log('✓ Serviço de Autenticação (Auth) respondendo corretamente.');
    }

  } catch (err) {
    console.error('✗ Erro inesperado no teste:', err.message);
  }
}

testAdminAccess();
