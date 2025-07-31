// functions/api/generate.js

import { verifyFirebaseToken, getGoogleAuthToken } from './_auth-firebase.js';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// NOTE: Dalam lingkungan serverless sejati, state ini mungkin tidak bertahan di antara pemanggilan yang terisolasi.
// Namun, pada banyak platform edge, instance dapat digunakan kembali untuk beberapa permintaan, membuat pendekatan ini cukup efektif.
let sharedKeyIndex = 0;

export async function onRequestPost(context) {
    const { request, env } = context;

    let geminiApiKey;
    let userId = 'anonymous';
    let userKey = null;

    try {
        const idToken = request.headers.get('Authorization')?.split('Bearer ')?.[1];
        if (idToken) {
            const projectId = env.FIREBASE_PROJECT_ID;
            const decodedToken = await verifyFirebaseToken(idToken, projectId);
            userId = decodedToken.uid;
            
            const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY);
            const authToken = await getGoogleAuthToken(serviceAccount);
            const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/user_api_keys/${userId}`;

            const firestoreResponse = await fetch(firestoreUrl, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });

            if (firestoreResponse.ok) {
                const docData = await firestoreResponse.json();
                userKey = docData.fields?.geminiApiKey?.stringValue;
            }
        }
    } catch (e) {
        console.error(`Auth/Firestore query failed for token. Proceeding as anonymous. Error: ${e.message}`);
    }

    // ▼▼▼ PERUBAHAN UTAMA: LOGIKA ROTASI KUNCI API ▼▼▼

    const sharedApiKeys = [
        env.GEMINI_API_KEY, env.GEMINI_API_KEY_2, env.GEMINI_API_KEY_3,
        env.GEMINI_API_KEY_4, env.GEMINI_API_KEY_5, env.GEMINI_API_KEY_6,
        env.GEMINI_API_KEY_7, env.GEMINI_API_KEY_8, env.GEMINI_API_KEY_9,
        env.GEMINI_API_KEY_10,
    ].filter(key => key);

    if (sharedApiKeys.length === 0 && !userKey) {
        return new Response(JSON.stringify({ error: "No API Keys configured on the server." }), { status: 500 });
    }

    try {
        const { prompt, isJson, schema } = await request.json();
        const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
        if (isJson && schema) {
            payload.generationConfig = { responseMimeType: "application/json", responseSchema: schema };
        }

        let geminiResponse;
        const maxRetries = userKey ? 3 : sharedApiKeys.length; // Coba setiap kunci bersama sekali
        let attempt = 0;

        while (attempt < maxRetries) {
            attempt++;
            
            if (userKey) {
                geminiApiKey = userKey;
                console.log(`Attempt ${attempt} with private key for user: ${userId}`);
            } else {
                geminiApiKey = sharedApiKeys[sharedKeyIndex];
                console.log(`Attempt ${attempt} with shared key index: ${sharedKeyIndex}`);
                // Pindahkan indeks untuk permintaan berikutnya
                sharedKeyIndex = (sharedKeyIndex + 1) % sharedApiKeys.length;
            }

            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;
            geminiResponse = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

            if (geminiResponse.ok) {
                break; // Berhasil, keluar dari loop
            }

            // Jika kunci pribadi gagal (selain karena kuota), coba lagi beberapa kali dengan jeda.
            if (userKey && geminiResponse.status !== 429) {
                await sleep(1000);
                continue;
            }

            // Jika kuota habis (429), jangan tunggu, langsung coba kunci berikutnya (jika bukan kunci pengguna).
            if (geminiResponse.status === 429 && !userKey) {
                continue; 
            }
            
            // Untuk error lainnya, kembalikan pesan kesalahan
            const errorResult = await geminiResponse.json();
            return new Response(JSON.stringify({ error: errorResult.error?.message || "Gemini API error." }), { status: geminiResponse.status });
        }

        // ▲▲▲ AKHIR DARI PERUBAHAN LOGIKA ROTASI KUNCI ▲▲▲

        if (!geminiResponse || !geminiResponse.ok) {
            const errorMessage = userKey ? "Failed to connect with your private key. It might be invalid or out of quota." : "The AI model is busy due to a full shared quota. Please try again later.";
            return new Response(JSON.stringify({ error: errorMessage }), { status: 500 });
        }
        
        const geminiResult = await geminiResponse.json();
        const text = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        return new Response(text, { status: 200, headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
        return new Response(JSON.stringify({ error: "Internal server error." }), { status: 500 });
    }
}