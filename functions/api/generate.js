// functions/api/generate.js

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function untuk inisialisasi Firebase Admin
function initializeFirebaseAdmin(env) {
  if (getApps().length > 0) {
    return;
  }
  try {
    const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY);
    initializeApp({
      credential: cert(serviceAccount),
    });
  } catch (e) {
    console.error("Firebase Admin initialization error:", e.message);
  }
}

export async function onRequestPost(context) {
    const { request, env } = context;
    initializeFirebaseAdmin(env);

    let geminiApiKey;
    let userId = 'anonymous'; // Default untuk pengguna yang tidak login
    let userKey = null;

    // Cek apakah ada token otentikasi
    const idToken = request.headers.get('Authorization')?.split('Bearer ')?.[1];
    if (idToken) {
        try {
            const decodedToken = await getAuth().verifyIdToken(idToken);
            userId = decodedToken.uid;
            
            // Lakukan query ke Firestore untuk mendapatkan kunci pengguna
            const db = getFirestore();
            const userKeyDoc = await db.collection('user_api_keys').doc(userId).get();
            if (userKeyDoc.exists) {
                userKey = userKeyDoc.data().geminiApiKey;
            }
        } catch (e) {
            console.error(`Token verification/Firestore query failed for token: ${idToken}`, e.message);
            // Jika token tidak valid, lanjutkan sebagai pengguna anonim
        }
    }

    if (userKey) {
        geminiApiKey = userKey;
        console.log(`Menggunakan kunci API pribadi untuk pengguna: ${userId}`);
    } else {
        console.log(`Pengguna ${userId} tidak punya kunci pribadi, menggunakan kunci bersama dari pool.`);
        const apiKeys = [
            env.GEMINI_API_KEY, env.GEMINI_API_KEY_2, env.GEMINI_API_KEY_3,
            env.GEMINI_API_KEY_4, env.GEMINI_API_KEY_5, env.GEMINI_API_KEY_6,
            env.GEMINI_API_KEY_7, env.GEMINI_API_KEY_8, env.GEMINI_API_KEY_9,
            env.GEMINI_API_KEY_10,
        ].filter(key => key);

        if (apiKeys.length === 0) {
            return new Response(JSON.stringify({ error: "Tidak ada Kunci API yang diatur di server." }), { status: 500 });
        }
        geminiApiKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];
    }

    // ... Sisa kode Anda sama persis dari sini
    try {
        const { prompt, isJson, schema } = await request.json();
        // ... (seluruh logika fetch, retry, dan parsing hasil tetap sama)
        const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
        if (isJson && schema) {
            payload.generationConfig = { responseMimeType: "application/json", responseSchema: schema };
        }
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;

        let geminiResponse;
        const maxRetries = 5;
        let attempt = 0;
        let delay = 1500;
        while (attempt < maxRetries) {
            attempt++;
            geminiResponse = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (geminiResponse.ok) break;
            if (geminiResponse.status === 429 || geminiResponse.status === 503) {
                await sleep(delay);
                delay *= 2;
                continue;
            }
            const errorResult = await geminiResponse.json();
            return new Response(JSON.stringify({ error: errorResult.error?.message || "Terjadi kesalahan pada API Gemini." }), { status: geminiResponse.status });
        }

        if (!geminiResponse || !geminiResponse.ok) {
            const errorMessage = userKey ? "Gagal terhubung menggunakan kunci pribadi Anda. Mungkin kuota Anda habis atau kunci tidak valid." : "Model AI sedang sibuk karena kuota bersama penuh. Silakan coba beberapa saat lagi.";
            return new Response(JSON.stringify({ error: errorMessage }), { status: 500 });
        }
        const geminiResult = await geminiResponse.json();
        const text = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        return new Response(text, { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
        return new Response(JSON.stringify({ error: "Terjadi kesalahan internal pada server." }), { status: 500 });
    }
}