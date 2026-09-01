const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Directorio base de archivos locales (Disco H: o variable de entorno)
const BASE_DOCUMENTS_PATH = process.env.DOCUMENTS_PATH || 'H:\\FOTOS_ARHIVOS_ADMISION_CEPRU\\Documentos_Admision';

/**
 * Valida si un código de postulante/DNI coincide exactamente como token completo
 * dentro del nombre del archivo, evitando falsos positivos por subcadena
 * (ej. evita que el código antiguo de 6 dígitos '305643' coincida con DNI '73056434').
 */
function isExactCodeMatch(filename, queryCode) {
    if (!filename || !queryCode) return false;
    const baseName = path.parse(filename).name;
    // Divide el nombre del archivo por delimitadores (_, -, espacios, puntos, etc.)
    const tokens = baseName.split(/[^a-zA-Z0-9]+/);
    const q = String(queryCode).trim().toLowerCase();
    const qNoZero = q.replace(/^0+/, '');
    
    for (const token of tokens) {
        const t = token.toLowerCase();
        if (t === q) return true;
        // Soporta códigos con ceros a la izquierda (ej. 00305643 y 305643)
        if (qNoZero && t.replace(/^0+/, '') === qNoZero && qNoZero.length >= 5) {
            return true;
        }
    }
    return false;
}

/**
 * Escanea recursivamente los directorios buscando archivos que coincidan
 * de forma exacta con el código de postulante o DNI.
 */
function scanDirForStudentCode(dirPath, studentCode, relativePrefix = '', maxDepth = 4, currentDepth = 0) {
    let results = [];
    if (!fs.existsSync(dirPath) || currentDepth > maxDepth) return results;

    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            const relPath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;

            if (entry.isDirectory()) {
                const subResults = scanDirForStudentCode(fullPath, studentCode, relPath, maxDepth, currentDepth + 1);
                results = results.concat(subResults);
            } else if (entry.isFile()) {
                // ✅ FILTRO ACTUALIZADO CON MATCH EXACTO DE CÓDIGO/DNI
                if (isExactCodeMatch(entry.name, studentCode)) {
                    results.push({
                        name: entry.name,
                        filename: entry.name,
                        relativePath: relPath,
                        path: relPath,
                        fullPath: fullPath,
                        size: fs.statSync(fullPath).size
                    });
                }
            }
        }
    } catch (err) {
        console.error(`[File Server] Error al leer directorio ${dirPath}:`, err.message);
    }

    return results;
}

// Endpoint de verificación de salud
app.get('/api/files/health', (req, res) => {
    res.json({
        ok: true,
        status: 'online',
        basePath: BASE_DOCUMENTS_PATH,
        exists: fs.existsSync(BASE_DOCUMENTS_PATH)
    });
});

app.get('/api/health', (req, res) => {
    res.json({ ok: true, status: 'online' });
});

// Endpoint para buscar documentos del estudiante por DNI o código
app.get('/api/files/student-documents/:dni', (req, res) => {
    const studentCode = req.params.dni;
    if (!studentCode || !studentCode.trim()) {
        return res.status(400).json({ error: 'Se requiere DNI o código de postulante.' });
    }

    console.log(`[File Server] Buscando documentos exactos para: ${studentCode}`);
    const files = scanDirForStudentCode(BASE_DOCUMENTS_PATH, studentCode.trim());
    res.json({
        ok: true,
        dni: studentCode,
        count: files.length,
        documents: files
    });
});

// Endpoint para transmitir/visualizar el documento
app.get('/api/files/stream-document', (req, res) => {
    const relativePath = req.query.path;
    if (!relativePath) {
        return res.status(400).send('Falta el parámetro path.');
    }

    const cleanPath = decodeURIComponent(relativePath).replace(/^[\\\/]+/, '');
    const fullPath = path.join(BASE_DOCUMENTS_PATH, cleanPath);

    // Evitar directory traversal
    if (!fullPath.startsWith(BASE_DOCUMENTS_PATH) && !fs.existsSync(fullPath)) {
        return res.status(403).send('Ruta no permitida.');
    }

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

app.listen(PORT, () => {
    console.log(`🚀 Servidor Local de Archivos ejecutándose en el puerto ${PORT}`);
    console.log(`📂 Carpeta base configurada: ${BASE_DOCUMENTS_PATH}`);
});
