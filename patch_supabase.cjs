const fs = require('fs');
let content = fs.readFileSync('lib/supabaseClient.ts', 'utf8');
content = content.replace(/process\.env\.SUPABASE_URL/g, 'import.meta.env.VITE_SUPABASE_URL');
content = content.replace(/process\.env\.SUPABASE_ANON_KEY/g, 'import.meta.env.VITE_SUPABASE_ANON_KEY');
fs.writeFileSync('lib/supabaseClient.ts', content);
