import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();

// Directorio base predeterminado
const BASE_DOCUMENTS_PATH = process.env.DOCUMENTS_PATH || 'H:\\FOTOS_ARHIVOS_ADMISION_CEPRU\\Documentos_Admision';

/**
 * Valida si un código de postulante/DNI coincide exactamente como token completo
 * dentro del nombre del archivo, evitando falsos positivos por subcadena.
 */
export function isExactCodeMatch(filename: string, queryCode: string): boolean {
  if (!filename || !queryCode) return false;
  const baseName = path.parse(filename).name;
  const tokens = baseName.split(/[^a-zA-Z0-9]+/);
  const q = String(queryCode).trim().toLowerCase();
  const qNoZero = q.replace(/^0+/, '');
  
  for (const token of tokens) {
    const t = token.toLowerCase();
    if (t === q) return true;
    if (qNoZero && t.replace(/^0+/, '') === qNoZero && qNoZero.length >= 5) {
      return true;
    }
  }
  return false;
}

/**
 * Busca recursivamente en la estructura de carpetas (Periodo / Concurso / Archivos)
 * aplicando coincidencia exacta sobre el DNI o código del postulante.
 */
export function searchDniInBaseDir(baseDir: string, dni: string): Array<any> {
  const results: any[] = [];
  if (!fs.existsSync(baseDir)) return results;
  
  try {
    const periodDirs = fs.readdirSync(baseDir, { withFileTypes: true }).filter(d => d.isDirectory());
    for (const periodDir of periodDirs) {
      const periodPath = path.join(baseDir, periodDir.name);
      const concursoDirs = fs.readdirSync(periodPath, { withFileTypes: true }).filter(d => d.isDirectory());
      for (const concursoDir of concursoDirs) {
        const concursoPath = path.join(periodPath, concursoDir.name);
        
        // ✅ FILTRO ACTUALIZADO CON MATCH EXACTO:
        const files = fs.readdirSync(concursoPath, { withFileTypes: true })
          .filter(f => f.isFile() && isExactCodeMatch(f.name, dni));
          
        for (const file of files) {
          const fullPath = path.join(concursoPath, file.name);
          const relativePath = `${periodDir.name}/${concursoDir.name}/${file.name}`;
          results.push({
            name: file.name,
            filename: file.name,
            periodo: periodDir.name,
            concurso: concursoDir.name,
            relativePath: relativePath,
            path: relativePath,
            fullPath: fullPath,
            size: fs.statSync(fullPath).size
          });
        }
      }
    }
  } catch (e) {
    console.error("[File Service] Error al escanear directorio: ", e);
  }
  return results;
}

// Endpoint de verificación de salud
router.get('/health', (req: Request, res: Response) => {
  res.json({
    ok: true,
    status: 'online',
    basePath: BASE_DOCUMENTS_PATH,
    exists: fs.existsSync(BASE_DOCUMENTS_PATH)
  });
});

// Endpoint para buscar documentos del estudiante por DNI o código
router.get('/student-documents/:dni', (req: Request, res: Response) => {
  const dni = String(req.params.dni || '');
  if (!dni || !dni.trim()) {
    return res.status(400).json({ error: 'Se requiere DNI o código de postulante.' });
  }

  const results = searchDniInBaseDir(BASE_DOCUMENTS_PATH, dni.trim());
  res.json({
    ok: true,
    dni,
    count: results.length,
    documents: results
  });
});

// Endpoint para transmitir/visualizar el documento
router.get('/stream-document', (req: Request, res: Response) => {
  const relativePath = req.query.path as string;
  if (!relativePath) {
    return res.status(400).send('Falta el parámetro path.');
  }

  const cleanPath = decodeURIComponent(relativePath).replace(/^[\\\/]+/, '');
  const fullPath = path.join(BASE_DOCUMENTS_PATH, cleanPath);

  if (!fs.existsSync(fullPath)) {
    return res.status(404).send('Archivo no encontrado.');
  }

  const ext = path.extname(fullPath).toLowerCase();
  let contentType = 'application/octet-stream';
  if (ext === '.pdf') contentType = 'application/pdf';
  else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
  else if (ext === '.png') contentType = 'image/png';
  else if (ext === '.webp') contentType = 'image/webp';

  const stat = fs.statSync(fullPath);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stat.size,
    'Content-Disposition': 'inline; filename="' + path.basename(fullPath) + '"'
  });

  const readStream = fs.createReadStream(fullPath);
  readStream.pipe(res);
});

export default router;
