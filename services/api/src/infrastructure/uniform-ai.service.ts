// ═══════════════════════════════════════════════════════════════════
// INISTNT — Uniform Check AI Service
// Provider: Google Gemini 1.5 Flash (FREE tier)
//   - 15 requests/minute
//   - 1,500 requests/day
//   - 1 million tokens/minute
//   - Zero cost
//
// Setup: Get API key from https://aistudio.google.com/app/apikey
// Add to .env: GEMINI_API_KEY=your_key_here
//
// Flow:
//   1. Worker submits selfie URL at booking start
//   2. AI analyzes: wearing uniform? (orange tshirt + dark pants, or brand cap)
//   3. Returns COMPLIANT / NON_COMPLIANT / UNSURE
//   4. uniform-check.handler.ts applies bonus/penalty based on result
// ═══════════════════════════════════════════════════════════════════

import { logger } from '../../config/logger';

export interface UniformAIResult {
  result:       'COMPLIANT' | 'NON_COMPLIANT' | 'UNSURE';
  confidence:   number;   // 0.0 – 1.0
  reason:       string;   // Short explanation
  modelVersion: string;
}

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
const MODEL_VERSION  = 'gemini-1.5-flash-v1';

// ─── Uniform description (customize per brand) ────────────────────
const UNIFORM_PROMPT = `
You are a uniform compliance checker for Inistnt, a home services platform in India.

Analyze the provided image of a service worker and determine if they are wearing the official Inistnt uniform.

Official Inistnt uniform consists of:
- Branded t-shirt (orange/yellow color with Inistnt logo, OR any clean professional uniform shirt)
- Dark pants or dark trousers (black or navy blue)
- Optionally: Inistnt branded cap or ID card visible

Respond ONLY with a JSON object in this exact format (no markdown, no extra text):
{
  "result": "COMPLIANT" | "NON_COMPLIANT" | "UNSURE",
  "confidence": <number between 0.0 and 1.0>,
  "reason": "<brief reason in English, max 100 chars>"
}

Rules:
- COMPLIANT: Worker is clearly wearing a professional/branded uniform
- NON_COMPLIANT: Worker is in casual clothes, informal wear, or not in uniform
- UNSURE: Image is blurry, dark, face not visible, or cannot determine clothing
- If image quality is too low to determine, return UNSURE with low confidence
`.trim();

// ─── Main analysis function ───────────────────────────────────────
export async function analyzeUniformPhoto(imageUrl: string): Promise<UniformAIResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    logger.warn('[UniformAI] GEMINI_API_KEY not set — returning UNSURE');
    return {
      result:       'UNSURE',
      confidence:   0,
      reason:       'AI service not configured',
      modelVersion: MODEL_VERSION,
    };
  }

  try {
    // ── Fetch image and convert to base64 ─────────────────────
    const imageResponse = await fetch(imageUrl, { signal: AbortSignal.timeout(10_000) });
    if (!imageResponse.ok) throw new Error(`Image fetch failed: ${imageResponse.status}`);

    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString('base64');
    const mimeType    = imageResponse.headers.get('content-type') ?? 'image/jpeg';

    // ── Call Gemini Vision API ────────────────────────────────
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      signal:  AbortSignal.timeout(30_000),
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: UNIFORM_PROMPT },
            {
              inline_data: {
                mime_type: mimeType,
                data:      base64Image,
              },
            },
          ],
        }],
        generationConfig: {
          temperature:     0.1,   // Low temp = deterministic output
          maxOutputTokens: 150,
          topP:            0.8,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${errBody.slice(0, 200)}`);
    }

    const geminiResponse = await response.json() as any;

    // ── Parse Gemini response ─────────────────────────────────
    const rawText = geminiResponse?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    // Strip any markdown fences if present
    const cleanText = rawText.replace(/```json|```/g, '').trim();
    const parsed    = JSON.parse(cleanText);

    const validResults = ['COMPLIANT', 'NON_COMPLIANT', 'UNSURE'];
    const result = validResults.includes(parsed.result) ? parsed.result : 'UNSURE';
    const confidence = Math.max(0, Math.min(1, parseFloat(parsed.confidence) || 0));

    logger.info({ result, confidence, reason: parsed.reason }, '[UniformAI] Analysis complete');

    return {
      result,
      confidence,
      reason:       parsed.reason?.slice(0, 100) ?? '',
      modelVersion: MODEL_VERSION,
    };

  } catch (err: any) {
    logger.error({ err: err.message, imageUrl: imageUrl.slice(0, 80) }, '[UniformAI] Analysis failed');

    // Graceful degradation — don't penalize worker if AI fails
    return {
      result:       'UNSURE',
      confidence:   0,
      reason:       `AI analysis failed: ${err.message?.slice(0, 50)}`,
      modelVersion: MODEL_VERSION,
    };
  }
}

// ─── Rate limit guard ─────────────────────────────────────────────
// Gemini free tier: 15 RPM — simple in-memory queue
let requestsThisMinute = 0;
let minuteResetAt      = Date.now() + 60_000;

export async function analyzeUniformPhotoRateLimited(imageUrl: string): Promise<UniformAIResult> {
  const now = Date.now();
  if (now >= minuteResetAt) {
    requestsThisMinute = 0;
    minuteResetAt      = now + 60_000;
  }

  if (requestsThisMinute >= 14) {  // Keep 1 buffer
    logger.warn('[UniformAI] Rate limit reached — returning UNSURE');
    return {
      result:       'UNSURE',
      confidence:   0,
      reason:       'AI rate limit reached, will retry later',
      modelVersion: MODEL_VERSION,
    };
  }

  requestsThisMinute++;
  return analyzeUniformPhoto(imageUrl);
}

// ═══════════════════════════════════════════════════════════════════
// FACE MATCH — Selfie vs ID Photo Comparison
//
// Uses Gemini 1.5 Flash vision to compare two photos:
//   1. selfieUrl   — Photo taken at booking start (selfie)
//   2. idPhotoUrl  — Worker's verified ID/Aadhaar photo from DB
//
// Returns: MATCH | NO_MATCH | UNSURE + confidence + reason
// Called from: booking start flow (after uniform check)
// ═══════════════════════════════════════════════════════════════════

export interface FaceMatchResult {
  result:      'MATCH' | 'NO_MATCH' | 'UNSURE';
  confidence:  number;
  reason:      string;
  modelVersion: string;
}

const FACE_MATCH_PROMPT = `
You are a face verification system for Inistnt, a home services platform in India.

You will be given TWO images:
1. First image: A selfie taken by the service worker at the job site (could be from phone camera)
2. Second image: The worker's official ID photo (Aadhaar, PAN card, or driver's license photo)

Your task: Determine if BOTH images show the SAME person.

Respond ONLY with a JSON object (no markdown, no extra text):
{
  "result": "MATCH" | "NO_MATCH" | "UNSURE",
  "confidence": <number between 0.0 and 1.0>,
  "reason": "<brief reason in English, max 120 chars>"
}

Rules:
- MATCH: High confidence (>0.7) that both images are the same person
- NO_MATCH: High confidence (>0.7) that these are different people
- UNSURE: Images unclear, face obscured, different angles, or cannot determine

Important notes:
- Older ID photos may look different (younger) — focus on facial structure not age
- Beards, haircuts, glasses may differ — look at facial features
- If either image has no clear face, return UNSURE
- ID photo may be a photo of a card — face within the card is what matters
`.trim();

async function fetchImageAsBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Image fetch failed (${res.status}): ${url.slice(0, 60)}`);
  const buf      = await res.arrayBuffer();
  const base64   = Buffer.from(buf).toString('base64');
  const mimeType = res.headers.get('content-type') ?? 'image/jpeg';
  return { base64, mimeType };
}

export async function compareFaceWithId(
  selfieUrl: string,
  idPhotoUrl: string
): Promise<FaceMatchResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    logger.warn('[FaceMatch] GEMINI_API_KEY not set — returning UNSURE');
    return { result: 'UNSURE', confidence: 0, reason: 'AI service not configured', modelVersion: MODEL_VERSION };
  }

  try {
    const [selfie, idPhoto] = await Promise.all([
      fetchImageAsBase64(selfieUrl),
      fetchImageAsBase64(idPhotoUrl),
    ]);

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      signal:  AbortSignal.timeout(30_000),
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: FACE_MATCH_PROMPT },
            { text: 'Image 1 — Worker selfie at job site:' },
            { inline_data: { mime_type: selfie.mimeType, data: selfie.base64 } },
            { text: 'Image 2 — Worker official ID photo:' },
            { inline_data: { mime_type: idPhoto.mimeType, data: idPhoto.base64 } },
          ],
        }],
        generationConfig: {
          temperature:     0.05,  // Very deterministic
          maxOutputTokens: 150,
          topP:            0.8,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${errBody.slice(0, 200)}`);
    }

    const geminiResponse = await response.json() as any;
    const rawText        = geminiResponse?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const cleanText      = rawText.replace(/```json|```/g, '').trim();
    const parsed         = JSON.parse(cleanText);

    const validResults   = ['MATCH', 'NO_MATCH', 'UNSURE'];
    const result         = validResults.includes(parsed.result) ? parsed.result : 'UNSURE';
    const confidence     = Math.max(0, Math.min(1, parseFloat(parsed.confidence) || 0));

    logger.info({ result, confidence, reason: parsed.reason }, '[FaceMatch] Comparison complete');

    return {
      result:       result as FaceMatchResult['result'],
      confidence,
      reason:       parsed.reason?.slice(0, 120) ?? '',
      modelVersion: MODEL_VERSION,
    };

  } catch (err: any) {
    logger.error({ err: err.message }, '[FaceMatch] Comparison failed');
    return {
      result:       'UNSURE',
      confidence:   0,
      reason:       `Face match failed: ${err.message?.slice(0, 60)}`,
      modelVersion: MODEL_VERSION,
    };
  }
}

// ─── Convenience: fetch worker's ID photo URL from DB ─────────────
export async function getWorkerIdPhotoUrl(workerId: string): Promise<string | null> {
  // Prefer SELFIE document type (onboarding selfie), fallback to Aadhaar front
  const { db } = await import('../infrastructure/database');

  const doc = await db.workerDocument.findFirst({
    where: {
      workerId,
      type:   { in: ['SELFIE', 'AADHAAR_FRONT'] },
      status: 'APPROVED',
    },
    orderBy: [
      { type: 'asc' }, // AADHAAR_FRONT comes first alphabetically, SELFIE after — we want SELFIE first
      { createdAt: 'desc' },
    ],
    select: { fileUrl: true, type: true },
  });

  // Re-query to get SELFIE specifically first
  const selfieDoc = await db.workerDocument.findFirst({
    where:   { workerId, type: 'SELFIE', status: 'APPROVED' },
    orderBy: { createdAt: 'desc' },
    select:  { fileUrl: true },
  });

  if (selfieDoc) return selfieDoc.fileUrl;
  return doc?.fileUrl ?? null;
}

// ─── Full face check: selfie URL → compare with stored ID photo ────
export async function runFaceMatchForBooking(
  workerId:  string,
  selfieUrl: string
): Promise<FaceMatchResult> {
  const idPhotoUrl = await getWorkerIdPhotoUrl(workerId);

  if (!idPhotoUrl) {
    logger.warn({ workerId }, '[FaceMatch] No ID photo found for worker — returning UNSURE');
    return {
      result:       'UNSURE',
      confidence:   0,
      reason:       'No approved ID photo on file',
      modelVersion: MODEL_VERSION,
    };
  }

  return compareFaceWithId(selfieUrl, idPhotoUrl);
}
