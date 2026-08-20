import { Handler } from '@netlify/functions';
import fetch from 'node-fetch';

export const handler: Handler = async (event, context) => {
  try {
    // Determine target URL: VITE_API_URL points to the Cloudflare tunnel (e.g. https://my-tunnel.trycloudflare.com)
    const baseUrl = process.env.VITE_API_URL || 'https://june-entertainment-thanks-include.trycloudflare.com';
    
    // Extracted path from the event, usually we append what's after /api/files
    // Or we can just forward the entire URL if the backend handles /api/files/...
    const requestPath = event.path; // e.g. /api/files/stream-document
    const queryString = event.rawQuery ? `?${event.rawQuery}` : '';
    
    const targetUrl = `${baseUrl}${requestPath}${queryString}`;
    console.log(`Proxying file request to: ${targetUrl}`);

    const response = await fetch(targetUrl, {
      method: event.httpMethod,
      headers: {
        ...event.headers,
        host: new URL(targetUrl).host // override host header for cloudflare tunnel
      },
      // body: event.body ? event.body : undefined // Handle POST if needed (like run-backup)
    });

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: await response.text()
      };
    }

    // Convert fetch response buffer to base64 for Netlify Function binary response
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const headers = {
      'Content-Type': response.headers.get('content-type') || 'application/pdf',
      'Content-Disposition': response.headers.get('content-disposition') || 'inline',
    };

    return {
      statusCode: 200,
      headers,
      body: buffer.toString('base64'),
      isBase64Encoded: true
    };
  } catch (error: any) {
    console.error('File proxy error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error while proxying file' })
    };
  }
};
