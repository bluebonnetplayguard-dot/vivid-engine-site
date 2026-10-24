import { api } from '@/api/client';
import solvePublicProof from '@/lib/publicProof';

const STORAGE_KEY = 've-public-rate-client-v1';
let memoryToken;
function readToken() {
  try { return localStorage.getItem(STORAGE_KEY) || memoryToken; }
  catch { return memoryToken; }
}
function saveToken(token) {
  memoryToken = token;
  try {
    if (token) localStorage.setItem(STORAGE_KEY, token);
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* Keep the visitor identity in memory when storage is unavailable. */ }
}

// Bounded handshake: old token -> challenge -> proof -> token -> action.
export default async function invokePublicFunction(name, payload) {
  if (!['submitInquiry', 'chatAssistant'].includes(name)) throw new Error('Unsupported public request.');
  let proof;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await api.functions.invoke(name, { ...payload, rateLimitToken: readToken(), rateLimitProof: proof });
    } catch (error) {
      const data = error.data || error.response?.data;
      const status = error.status || error.response?.status;
      if (attempt < 3 && status === 428 && data?.code === 'PUBLIC_CLIENT_CHALLENGE') {
        proof = await solvePublicProof(data.challenge);
        continue;
      }
      if (attempt < 3 && status === 428 && data?.code === 'PUBLIC_CLIENT_REQUIRED' && typeof data.rateLimitToken === 'string') {
        saveToken(data.rateLimitToken);
        proof = undefined;
        continue;
      }
      if (data?.code === 'PUBLIC_CLIENT_INVALID') {
        saveToken(undefined);
        proof = undefined;
        if (attempt === 0) continue;
      }
      throw error;
    }
  }
}