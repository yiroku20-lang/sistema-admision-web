import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

async function run() {
  // Let's page to get all departments
  let allRows: any[] = [];
  let from = 0;
  let to = 999;
  while (true) {
    const { data, error } = await supabase.from('ubigeos').select('ubigeo, departamento').range(from, to);
    if (error) {
      console.error(error);
      break;
    }
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    from += 1000;
    to += 1000;
  }

  const deptPrefixes: Record<string, Set<string>> = {};
  allRows.forEach((row: any) => {
    const dept = row.departamento;
    const u = row.ubigeo;
    if (dept && u) {
      const padded = u.padStart(6, '0');
      const prefix = padded.slice(0, 2);
      if (!deptPrefixes[dept]) {
        deptPrefixes[dept] = new Set();
      }
      deptPrefixes[dept].add(prefix);
    }
  });

  console.log("Department prefixes in database:");
  for (const [dept, prefixes] of Object.entries(deptPrefixes).sort()) {
    console.log(`- ${dept}: ${Array.from(prefixes).join(', ')}`);
  }
}

run();




