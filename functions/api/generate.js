// functions/api/generate.js

import { verifyFirebaseToken, getGoogleAuthToken } from './_auth-firebase.js';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function onRequestPost(context) {
    const { request, env } = context;

    let geminiApiKey;
    let userId = 'anonymous';
    let userKey = null;

    try {
        // 1. Cek token otentikasi
        const idToken = request.headers.get('Authorization')?.split('Bearer ')?.[1];
        if (idToken) {
            const projectId = env.FIREBASE_PROJECT_ID;
            const decodedToken = await verifyFirebaseToken(idToken, projectId);
            userId = decodedToken.uid;
            
            // 2. Jika pengguna terotentikasi, coba ambil kunci pribadinya dari Firestore via REST API
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
        // Jika token tidak valid atau gagal mengambil data, lanjutkan sebagai anonim
        console.error(`Auth/Firestore query failed for token. Proceeding as anonymous. Error: ${e.message}`);
    }

    // 3. Logika pemilihan kunci API (tetap sama)
    if (userKey) {
        geminiApiKey = userKey;
        console.log(`Using private API key for user: ${userId}`);
    } else {
        console.log(`User ${userId} has no private key, using shared pool.`);
        const apiKeys = [
            env.GEMINI_API_KEY, env.GEMINI_API_KEY_2, env.GEMINI_API_KEY_3,
            env.GEMINI_API_KEY_4, env.GEMINI_API_KEY_5, env.GEMINI_API_KEY_6,
            env.GEMINI_API_KEY_7, env.GEMINI_API_KEY_8, env.GEMINI_API_KEY_9,
            env.GEMINI_API_KEY_10,
        ].filter(key => key);

        if (apiKeys.length === 0) {
            return new Response(JSON.stringify({ error: "No API Keys configured on the server." }), { status: 500 });
        }
        geminiApiKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];
    }

    // 4. Panggil Gemini API (tetap sama)
    try {
        const { prompt, isJson, schema } = await request.json();
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
            return new Response(JSON.stringify({ error: errorResult.error?.message || "Gemini API error." }), { status: geminiResponse.status });
        }

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
