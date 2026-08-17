import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "https://cnqpzyanmmwspvemcfeb.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// Inicializar cliente apuntando al esquema 'storage'
const supabaseStorageDb = createClient(supabaseUrl, supabaseKey, {
  db: { schema: "storage" }
});

// Inicializar cliente estándar
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("=== CALCULANDO USO DE ALMACENAMIENTO EN SUPABASE ===");
  
  // Método A: Consultar la tabla de metadatos storage.objects (más rápido y exacto)
  try {
    const { data: objects, error } = await supabaseStorageDb
      .from("objects")
      .select("bucket_id, name, metadata");

    if (error) {
      throw error;
    }

    if (objects && objects.length > 0) {
      console.log("\n[Método A] Consulta de base de datos exitosa:");
      let totalSize = 0;
      const bucketSizes: Record<string, number> = {};
      const bucketCounts: Record<string, number> = {};

      for (const obj of objects) {
        const metadata = obj.metadata as any;
        const size = metadata?.size || 0;
        
        totalSize += size;
        bucketSizes[obj.bucket_id] = (bucketSizes[obj.bucket_id] || 0) + size;
        bucketCounts[obj.bucket_id] = (bucketCounts[obj.bucket_id] || 0) + 1;
      }

      printResults(totalSize, bucketSizes, bucketCounts);
      return;
    } else {
      console.log("No se encontraron objetos en storage.objects (o está vacío).");
    }
  } catch (e: any) {
    console.log(`\n[Método A] No se pudo consultar la tabla storage.objects directamente: ${e.message || String(e)}`);
    console.log("Intentando Método B (Listado recursivo de buckets)...");
  }

  // Método B: Listar de forma recursiva a través del Storage API
  try {
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    if (bucketError) throw bucketError;

    let totalSize = 0;
    const bucketSizes: Record<string, number> = {};
    const bucketCounts: Record<string, number> = {};

    for (const bucket of buckets) {
      console.log(`Escaneando bucket '${bucket.name}'...`);
      const { size, count } = await scanBucketFolder(bucket.name, "");
      bucketSizes[bucket.name] = size;
      bucketCounts[bucket.name] = count;
      totalSize += size;
    }

    printResults(totalSize, bucketSizes, bucketCounts);

  } catch (e: any) {
    console.error("❌ ERROR: No se pudo obtener el uso de almacenamiento:", e.message || String(e));
  }
}

async function scanBucketFolder(bucketName: string, folderPath: string): Promise<{ size: number; count: number }> {
  let size = 0;
  let count = 0;
  
  const { data: files, error } = await supabase.storage.from(bucketName).list(folderPath, {
    limit: 100,
    offset: 0
  });

  if (error) {
    console.warn(`  Error listando carpeta '${folderPath}' en bucket '${bucketName}':`, error.message);
    return { size, count };
  }

  if (!files) return { size, count };

  for (const file of files) {
    // Si no tiene id, es una carpeta (en Supabase Storage, las carpetas no tienen id)
    if (!file.id) {
      const subFolder = folderPath ? `${folderPath}/${file.name}` : file.name;
      const subResult = await scanBucketFolder(bucketName, subFolder);
      size += subResult.size;
      count += subResult.count;
    } else {
      const fileSize = file.metadata?.size || 0;
      size += fileSize;
      count++;
    }
  }

  return { size, count };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function printResults(totalSize: number, bucketSizes: Record<string, number>, bucketCounts: Record<string, number>) {
  console.log("\n========================================");
  console.log("📊 USO TOTAL DE ALMACENAMIENTO:");
  console.log("========================================");
  console.log(`Tamaño total ocupado: ${formatBytes(totalSize)} (${totalSize.toLocaleString()} bytes)`);
  console.log("========================================");
  console.log("Detalle por Buckets:");
  
  for (const bucketName in bucketSizes) {
    const size = bucketSizes[bucketName];
    const count = bucketCounts[bucketName] || 0;
    console.log(`📦 Bucket '${bucketName}':`);
    console.log(`   - Tamaño: ${formatBytes(size)}`);
    console.log(`   - Cantidad de archivos: ${count}`);
  }
  console.log("========================================\n");
}

run();
