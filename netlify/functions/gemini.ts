import { GoogleGenAI } from '@google/genai';

export const handler = async (event: any) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { input, model, config } = body;

    if (!input) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Input is required" })
      };
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No se configuró la clave de API de Gemini (GEMINI_API_KEY) en Netlify o el servidor." })
      };
    }

    const ai = new GoogleGenAI({ 
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    // Map model names safely to public ones (gemini-3.5-flash or gemini-3.0-pro are not public models, map them to gemini-2.5-flash)
    let selectedModel = model || 'gemini-2.5-flash';
    if (
      selectedModel.includes('3.5-flash') || 
      selectedModel.includes('3.0-pro') || 
      selectedModel.includes('3.0') || 
      selectedModel.includes('3.5')
    ) {
      selectedModel = 'gemini-2.5-flash';
    }

    const requestOptions: any = {
      model: selectedModel,
      contents: input,
    };

    if (config) {
      requestOptions.config = config;
    }

    const response = await ai.models.generateContent(requestOptions);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text: response.text })
    };

  } catch (error: any) {
    console.error("Gemini Netlify Function Error:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ error: error.message || "Error al conectar con la IA de Gemini." })
    };
  }
};
