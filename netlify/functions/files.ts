export const handler = async (event: any) => {
  // Sólo permitimos peticiones GET para servir/transmitir archivos
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const pathParam = event.queryStringParameters?.path;
  if (!pathParam) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Falta el parámetro path" })
    };
  }

  try {
    // VITE_API_URL contiene la URL del túnel público de Cloudflare en producción
    const baseUrl = process.env.VITE_API_URL || "http://localhost:5000";
    const targetUrl = `${baseUrl.replace(/\/$/, '')}/api/files/stream-document?path=${encodeURIComponent(pathParam)}`;
    
    console.log(`[Netlify Proxy] Solicitando archivo local a través del túnel: ${targetUrl}`);
    
    const response = await fetch(targetUrl);
    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: "Error al obtener archivo del servidor local a través del túnel" })
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/pdf',
        'Content-Disposition': 'inline'
      },
      body: base64,
      isBase64Encoded: true
    };
  } catch (error: any) {
    console.error("[Netlify Proxy] Error al obtener el archivo:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || "Error interno del proxy de Netlify" })
    };
  }
};
