import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "⚠️ Variables Supabase manquantes. Vérifie que VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY sont bien définies dans ton fichier .env (en local) ou dans les variables d'environnement Vercel (en production)."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
