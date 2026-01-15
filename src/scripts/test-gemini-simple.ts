/**
 * Test Gemini API without tools (simple chat)
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config, setupAdkEnvironment } from '../config';

setupAdkEnvironment();

async function main() {
  console.log('=== Test Gemini Simple Chat (Sin Tools) ===\n');
  
  const apiKey = process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    console.error('ERROR: No API key found');
    return;
  }
  
  console.log('API Key (primeros 10 chars):', apiKey.substring(0, 10) + '...');
  
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  
  console.log('\nEnviando pregunta: "¿Qué es un PDF? Responde en 1 oración."\n');
  
  try {
    const result = await model.generateContent('¿Qué es un PDF? Responde en 1 oración.');
    const response = result.response;
    console.log('✅ RESPUESTA:', response.text());
  } catch (error: any) {
    console.error('❌ ERROR:', error.message);
  }
}

main();
