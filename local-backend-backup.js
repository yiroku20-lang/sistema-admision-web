require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { pipeline } = require('stream/promises');

const app = express();
const PORT = process.env.PORT || 5000;

// Configuración Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'TU_SUPABASE_URL';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'TU_SUPABASE_SERVICE_KEY';
const supabase = createClient(supabaseUrl, supabaseKey);

// Ruta base en el disco H:
const BASE_DRIVE_PATH = 'H:\\FOTOS_ARHIVOS_ADMISION_CEPRU\\Documentos_Admision\\respaldo_nube';
const ROUTE_PREFIX = '/api/files/stream-document?path=respaldo_nube/';

// Asegurar que la carpeta base exista
if (!fs.existsSync(BASE_DRIVE_PATH)) {
    fs.mkdirSync(BASE_DRIVE_PATH, { recursive: true });
}

// Configuración de las tablas y columnas a respaldar
const TABLES_TO_BACKUP = [
    { table: 'expedientes_salida', columns: ['pdf_url'] },
    { table: 'renuncias', columns: ['informe_pdf', 'resolution_pdf'] },
    { table: 'reserva_vacantes_bloques', columns: ['resolution_pdf'] },
    { table: 'resolutions', columns: ['pdf_url'] },
    { table: 'padron_pagos', columns: ['resolution_pdf'] },
    { table: 'prestamos', columns: ['firma_url'] }
];

async function runBackup() {
    console.log(`[${new Date().toISOString()}] Iniciando proceso de respaldo de PDFs...`);
    
    // Calcular la fecha límite (hace 30 días)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateLimit = thirtyDaysAgo.toISOString();

    for (const config of TABLES_TO_BACKUP) {
        try {
            console.log(`Verificando tabla: ${config.table}`);
            
            // Buscar registros más antiguos que 30 días
            const { data: records, error } = await supabase
                .from(config.table)
                .select('*')
                .lt('created_at', dateLimit);

            if (error) throw error;
            if (!records || records.length === 0) continue;

            for (const record of records) {
                let updatedObj = {};
                let hasChanges = false;

                for (const col of config.columns) {
                    const originalUrl = record[col];
                    
                    // Solo procedemos si hay URL y no ha sido procesada aún
                    if (originalUrl && originalUrl.startsWith('http') && originalUrl.includes('supabase.co')) {
                        console.log(`Procesando archivo para ID ${record.id} en ${config.table} (${col})`);
                        
                        try {
                            // Extraer ruta del archivo del URL de Supabase
                            // Ejemplo URL: https://[PROYECTO].supabase.co/storage/v1/object/public/documentos/salidas/123_archivo.pdf
                            const storageUrlPart = '/storage/v1/object/public/';
                            if (!originalUrl.includes(storageUrlPart)) continue;
                            
                            const fullPathStr = originalUrl.split(storageUrlPart)[1];
                            const [bucketName, ...pathParts] = fullPathStr.split('/');
                            const filePathInBucket = decodeURIComponent(pathParts.join('/'));
                            const fileName = pathParts[pathParts.length - 1];

                            // Descargar y guardar
                            const response = await fetch(originalUrl);
                            if (!response.ok) throw new Error(`Fallo al descargar: ${response.statusText}`);

                            const folderPath = path.join(BASE_DRIVE_PATH, config.table);
                            if (!fs.existsSync(folderPath)) {
                                fs.mkdirSync(folderPath, { recursive: true });
                            }

                            const localFilePath = path.join(folderPath, fileName);
                            
                            // Streaming al disco local
                            const { Readable } = require('stream');
                            const fileStream = fs.createWriteStream(localFilePath);
                            
                            // Si response.body es un Web Stream (Node 18+ nativo):
                            if (response.body && typeof response.body.getReader === 'function') {
                                await pipeline(Readable.fromWeb(response.body), fileStream);
                            } else {
                                // Fallback para node-fetch u otros
                                await pipeline(response.body, fileStream);
                            }
                            
                            // Actualizar la base de datos
                            const relativePath = `${config.table}/${fileName}`;
                            const newDbUrl = `${ROUTE_PREFIX}${encodeURIComponent(relativePath)}`;
                            
                            updatedObj[col] = newDbUrl;
                            hasChanges = true;

                            // Eliminar el archivo de Supabase Storage
                            const { error: deleteError } = await supabase.storage
                                .from(bucketName)
                                .remove([filePathInBucket]);
                                
                            if (deleteError) {
                                console.error(`⚠️ Error al eliminar de Supabase Storage: ${filePathInBucket}`, deleteError);
                            } else {
                                console.log(`✅ Eliminado de Storage: ${filePathInBucket}`);
                            }
                            
                            console.log(`✅ Archivo guardado y respaldado: ${localFilePath}`);

                        } catch (fileError) {
                            console.error(`❌ Error procesando el archivo en ID ${record.id} (${col}):`, fileError);
                        }
                    }
                }

                if (hasChanges) {
                    const { error: updateError } = await supabase
                        .from(config.table)
                        .update(updatedObj)
                        .eq('id', record.id);
                        
                    if (updateError) {
                        console.error(`❌ Error actualizando la BD para ID ${record.id}:`, updateError);
                    } else {
                        console.log(`✅ Base de datos actualizada para ID ${record.id}`);
                    }
                }
            }

        } catch (tableError) {
            console.error(`❌ Error procesando la tabla ${config.table}:`, tableError);
        }
    }
    
    console.log(`[${new Date().toISOString()}] Proceso de respaldo finalizado.`);
}

// 1. Scheduler diario a las 2 AM
cron.schedule('0 2 * * *', () => {
    runBackup();
});

// 2. Endpoint manual
app.post('/api/files/run-backup', async (req, res) => {
    // Es recomendable añadir validación de token/secreto aquí
    runBackup(); // Async, no bloquea
    res.json({ message: "Proceso de respaldo iniciado en segundo plano." });
});

// 3. Endpoint para visualizar/servir el archivo PDF
app.get('/api/files/stream-document', (req, res) => {
    const relativePath = req.query.path;
    if (!relativePath) {
        return res.status(400).send('Falta el parámetro path.');
    }
    
    // Validar que la ruta comience con "respaldo_nube" para seguridad
    if (!relativePath.startsWith('respaldo_nube/')) {
        return res.status(403).send('Ruta no permitida.');
    }

    const cleanPath = relativePath.replace('respaldo_nube/', '');
    const fullPath = path.join(BASE_DRIVE_PATH, cleanPath);

    // Evitar directory traversal
    if (!fullPath.startsWith(BASE_DRIVE_PATH)) {
        return res.status(403).send('Intento de path traversal detectado.');
    }

    if (!fs.existsSync(fullPath)) {
        return res.status(404).send('Archivo no encontrado en el servidor local.');
    }

    const stat = fs.statSync(fullPath);
    res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Length': stat.size,
        'Content-Disposition': 'inline'
    });

    const readStream = fs.createReadStream(fullPath);
    readStream.pipe(res);
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor local Express ejecutándose en el puerto ${PORT}`);
});
