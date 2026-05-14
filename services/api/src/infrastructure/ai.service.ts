// ═══════════════════════════════════════════════════════════════════
// INISTNT — AI Service (Groq)
// Provider: Groq (https://groq.com) — FREE tier
//
// Models used:
//   Vision (uniform + face): meta-llama/llama-4-scout-17b-16e-instruct
//   Text analysis:           llama-3.3-70b-versatile
//
// Free tier: 30 req/min, 14,400 req/day (more than enough)
//
// Install: pnpm add groq-sdk
//
// .env:
//   GROQ_API_KEY=gsk_xxxxxxxxxxxx
//   (Get free at: https://console.groq.com/keys)
// ═══════════════════════════════════════════════════════════════════

import Groq from 'groq-sdk';
import { logger } from '../../config/logger';

// ─── Client ───────────────────────────────────────────────────────
let groqClient: Groq | null = null;

function getGroq(): Groq {
  if (!groqClient) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY not set');
    groqClient = new Groq({ apiKey });
  }
  return groqClient;
}

// Vision model — supports image input
const VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
const MODEL_VERSION = 'groq-llama4-scout-v1';

// ─── Fetch image → base64 ─────────────────────────────────────────
async function toBase64(url: string): Promise<{ data: string; mediaType: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Image fetch failed (${res.status}): ${url.slice(0, 80)}`);
  const buf       = await res.arrayBuffer();
  const data      = Buffer.from(buf).toString('base64');
  const mediaType = (res.headers.get('content-type') ?? 'image/jpeg').split(';')[0];
  return { data, mediaType };
}

// ─── Parse JSON from Groq response ───────────────────────────────
function parseJson(text: string): any {
  const clean = text.replace(/```json|```/g, '').trim();
  // Find first { ... } block
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON found in response');
  return JSON.parse(match[0]);
}

// ═══════════════════════════════════════════════════════════════════
// UNIFORM CHECK
// ═══════════════════════════════════════════════════════════════════

export interface UniformAIResult {
  result:       'COMPLIANT' | 'NON_COMPLIANT' | 'UNSURE';
  confidence:   number;
  reason:       string;
  modelVersion: string;
}

const UNIFORM_PROMPT = `You are a uniform compliance checker for Inistnt, an Indian home services platform.

Analyze this image of a service worker and determine if they are wearing the official Inistnt uniform.

Official uniform: Branded t-shirt (orange/yellow with Inistnt logo OR clean professional uniform shirt) + dark pants (black or navy) + optionally branded cap.

Respond ONLY with valid JSON (no markdown):
{"result":"COMPLIANT"|"NON_COMPLIANT"|"UNSURE","confidence":0.0-1.0,"reason":"brief reason max 100 chars"}

Rules:
- COMPLIANT: Clearly professional/branded uniform
- NON_COMPLIANT: Casual clothes, informal wear
- UNSURE: Blurry image, face not visible, cannot determine clothing`;

export async function analyzeUniformPhotoRateLimited(imageUrl: string): Promise<UniformAIResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    logger.warn('[UniformAI] GROQ_API_KEY not set — returning UNSURE');
    return { result: 'UNSURE', confidence: 0, reason: 'AI service not configured', modelVersion: MODEL_VERSION };
  }

  try {
    const image = await toBase64(imageUrl);

    const completion = await getGroq().chat.completions.create({
      model: VISION_MODEL,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: UNIFORM_PROMPT },
          { type: 'image_url', image_url: { url: `data:${image.mediaType};base64,${image.data}` } },
        ],
      }],
      temperature:      0.1,
      max_tokens:       150,
      response_format:  { type: 'json_object' },
    });

    const raw    = completion.choices[0]?.message?.content ?? '{}';
    const parsed = parseJson(raw);

    const validResults = ['COMPLIANT', 'NON_COMPLIANT', 'UNSURE'];
    const result       = validResults.includes(parsed.result) ? parsed.result : 'UNSURE';
    const confidence   = Math.max(0, Math.min(1, parseFloat(parsed.confidence) || 0));

    logger.info({ result, confidence }, '[UniformAI] Analysis complete');
    return { result, confidence, reason: (parsed.reason ?? '').slice(0, 100), modelVersion: MODEL_VERSION };

  } catch (err: any) {
    logger.error({ err: err.message }, '[UniformAI] Failed');
    return { result: 'UNSURE', confidence: 0, reason: `AI failed: ${err.message?.slice(0, 50)}`, modelVersion: MODEL_VERSION };
  }
}

// Keep old name for backward compat
export const analyzeUniformPhoto = analyzeUniformPhotoRateLimited;

// ═══════════════════════════════════════════════════════════════════
// FACE MATCH — Selfie vs ID photo comparison
// ═══════════════════════════════════════════════════════════════════

export interface FaceMatchResult {
  result:       'MATCH' | 'NO_MATCH' | 'UNSURE';
  confidence:   number;
  reason:       string;
  modelVersion: string;
}

const FACE_MATCH_PROMPT = `You are a face verification system for Inistnt, an Indian home services platform.

You will see TWO images:
1. Selfie: taken by the service worker at the job site
2. ID photo: worker's official ID (Aadhaar/PAN/license)

Determine if BOTH images show the SAME person.

Respond ONLY with valid JSON (no markdown):
{"result":"MATCH"|"NO_MATCH"|"UNSURE","confidence":0.0-1.0,"reason":"brief reason max 120 chars"}

Rules:
- MATCH: >0.7 confidence same person
- NO_MATCH: >0.7 confidence different people  
- UNSURE: unclear images, obscured face, cannot determine
- Older ID photos may look younger — focus on facial structure
- Beards/haircuts/glasses may differ — look at bone structure`;

export async function compareFaceWithId(selfieUrl: string, idPhotoUrl: string): Promise<FaceMatchResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { result: 'UNSURE', confidence: 0, reason: 'AI service not configured', modelVersion: MODEL_VERSION };
  }

  try {
    const [selfie, idPhoto] = await Promise.all([toBase64(selfieUrl), toBase64(idPhotoUrl)]);

    const completion = await getGroq().chat.completions.create({
      model: VISION_MODEL,
      messages: [{
        role: 'user',
        content: [
          { type: 'text',      text: FACE_MATCH_PROMPT },
          { type: 'text',      text: 'Image 1 — Worker selfie at job site:' },
          { type: 'image_url', image_url: { url: `data:${selfie.mediaType};base64,${selfie.data}` } },
          { type: 'text',      text: 'Image 2 — Worker official ID photo:' },
          { type: 'image_url', image_url: { url: `data:${idPhoto.mediaType};base64,${idPhoto.data}` } },
        ],
      }],
      temperature: 0.05,
      max_tokens:  150,
      response_format: { type: 'json_object' },
    });

    const raw    = completion.choices[0]?.message?.content ?? '{}';
    const parsed = parseJson(raw);

    const validResults = ['MATCH', 'NO_MATCH', 'UNSURE'];
    const result       = validResults.includes(parsed.result) ? parsed.result : 'UNSURE';
    const confidence   = Math.max(0, Math.min(1, parseFloat(parsed.confidence) || 0));

    logger.info({ result, confidence }, '[FaceMatch] Complete');
    return { result, confidence, reason: (parsed.reason ?? '').slice(0, 120), modelVersion: MODEL_VERSION };

  } catch (err: any) {
    logger.error({ err: err.message }, '[FaceMatch] Failed');
    return { result: 'UNSURE', confidence: 0, reason: `Face match failed: ${err.message?.slice(0, 60)}`, modelVersion: MODEL_VERSION };
  }
}

// ─── Full face check: fetch worker's stored ID photo then compare ─
export async function runFaceMatchForBooking(workerId: string, selfieUrl: string): Promise<FaceMatchResult> {
  // Import db lazily to avoid circular deps
  const { db } = await import('../infrastructure/database');

  const selfieDoc = await db.workerDocument.findFirst({
    where:   { workerId, type: 'SELFIE', status: 'APPROVED' },
    orderBy: { createdAt: 'desc' },
    select:  { fileUrl: true },
  });

  const idDoc = selfieDoc ?? await db.workerDocument.findFirst({
    where:   { workerId, type: 'AADHAAR_FRONT', status: 'APPROVED' },
    orderBy: { createdAt: 'desc' },
    select:  { fileUrl: true },
  });

  if (!idDoc) {
    logger.warn({ workerId }, '[FaceMatch] No approved ID photo found — skipping');
    return { result: 'UNSURE', confidence: 0, reason: 'No approved ID photo on file', modelVersion: MODEL_VERSION };
  }

  return compareFaceWithId(selfieUrl, idDoc.fileUrl);
}

// ═══════════════════════════════════════════════════════════════════
// TEXT ANALYSIS — Dispute categorization, review fraud detection
// ═══════════════════════════════════════════════════════════════════

const TEXT_MODEL = 'llama-3.3-70b-versatile';

export async function categorizeDispute(description: string): Promise<{
  category: string; priority: 'low' | 'medium' | 'high' | 'critical'; summary: string;
}> {
  if (!process.env.GROQ_API_KEY) return { category: 'other', priority: 'medium', summary: description.slice(0, 100) };

  try {
    const completion = await getGroq().chat.completions.create({
      model: TEXT_MODEL,
      messages: [{
        role: 'user',
        content: `Categorize this customer dispute for an Indian home services platform. Respond ONLY with JSON.

Dispute: "${description.slice(0, 500)}"

JSON format:
{"category":"quality"|"no_show"|"overcharge"|"damage"|"behavior"|"fraud"|"other","priority":"low"|"medium"|"high"|"critical","summary":"one line summary in English max 80 chars"}`,
      }],
      temperature:     0.2,
      max_tokens:      100,
      response_format: { type: 'json_object' },
    });

    const raw    = completion.choices[0]?.message?.content ?? '{}';
    const parsed = parseJson(raw);
    return {
      category: parsed.category ?? 'other',
      priority: parsed.priority ?? 'medium',
      summary:  (parsed.summary ?? description.slice(0, 80)),
    };
  } catch {
    return { category: 'other', priority: 'medium', summary: description.slice(0, 80) };
  }
}

export async function detectReviewFraud(review: {
  text: string; rating: number; workerName: string;
}): Promise<{ isSuspicious: boolean; reason: string; confidence: number }> {
  if (!process.env.GROQ_API_KEY) return { isSuspicious: false, reason: '', confidence: 0 };

  try {
    const completion = await getGroq().chat.completions.create({
      model: TEXT_MODEL,
      messages: [{
        role: 'user',
        content: `Analyze if this review for a home service worker is fake/fraudulent. Respond ONLY with JSON.

Review: "${review.text.slice(0, 300)}" (Rating: ${review.rating}/5, Worker: ${review.workerName})

JSON: {"isSuspicious":true|false,"reason":"brief reason","confidence":0.0-1.0}

Suspicious signs: generic text, impossible claims, rating doesn't match text sentiment, copy-paste patterns.`,
      }],
      temperature:     0.2,
      max_tokens:      100,
      response_format: { type: 'json_object' },
    });

    const raw    = completion.choices[0]?.message?.content ?? '{}';
    const parsed = parseJson(raw);
    return {
      isSuspicious: Boolean(parsed.isSuspicious),
      reason:       parsed.reason ?? '',
      confidence:   parseFloat(parsed.confidence) || 0,
    };
  } catch {
    return { isSuspicious: false, reason: '', confidence: 0 };
  }
}
