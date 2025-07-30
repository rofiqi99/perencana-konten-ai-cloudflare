// functions/api/save-key.js

import { verifyFirebaseToken, getGoogleAuthToken } from './_auth-firebase.js';

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        // 1. Verifikasi Token Pengguna menggunakan metode baru yang ramah Cloudflare
        const idToken = request.headers.get('Authorization')?.split('Bearer ')?.[1];
        const projectId = env.FIREBASE_PROJECT_ID;
        const decodedToken = await verifyFirebaseToken(idToken, projectId);
        const userId = decodedToken.uid;

        const { apiKey } = await request.json();
        if (!apiKey || typeof apiKey !== 'string' || !apiKey.startsWith('AIza')) {
            return new Response(JSON.stringify({ error: 'Invalid API Key format' }), { status: 400 });
        }

        // 2. Dapatkan token akses untuk "menelepon" Firestore
        const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY);
        const authToken = await getGoogleAuthToken(serviceAccount);

        // 3. Simpan Kunci ke Firestore menggunakan REST API
        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/user_api_keys/${userId}`;
        
        const firestorePayload = {
            fields: {
                geminiApiKey: { stringValue: apiKey },
                updatedAt: { timestampValue: new Date().toISOString() }
            }
        };

        const firestoreResponse = await fetch(firestoreUrl, {
            method: 'PATCH', // Menggunakan PATCH untuk membuat atau menimpa dokumen
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(firestorePayload)
        });

        if (!firestoreResponse.ok) {
            const errorData = await firestoreResponse.json();
            console.error("Firestore error:", errorData);
            throw new Error('Failed to save key to database.');
        }

        return new Response(JSON.stringify({ message: 'API Key saved successfully' }), { status: 200 });

    } catch (error) {
        console.error("Error in save-key:", error.message);
        return new Response(JSON.stringify({ error: error.message || 'Authentication failed or server error' }), { status: 401 });
    }
}
