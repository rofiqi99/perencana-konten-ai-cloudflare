// functions/api/save-key.js

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

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

    try {
        // 1. Verifikasi Token Pengguna
        const idToken = request.headers.get('Authorization')?.split('Bearer ')?.[1];
        if (!idToken) {
            return new Response(JSON.stringify({ error: 'Unauthorized: No token provided' }), { status: 401 });
        }
        
        const decodedToken = await getAuth().verifyIdToken(idToken);
        const userId = decodedToken.uid;

        const { apiKey } = await request.json();
        if (!apiKey || typeof apiKey !== 'string' || !apiKey.startsWith('AIza')) {
            return new Response(JSON.stringify({ error: 'Invalid API Key format' }), { status: 400 });
        }

        // 2. Simpan Kunci ke Firestore
        const db = getFirestore();
        await db.collection('user_api_keys').doc(userId).set({
            geminiApiKey: apiKey,
            updatedAt: new Date(),
        });

        return new Response(JSON.stringify({ message: 'API Key saved successfully' }), { status: 200 });

    } catch (error) {
        console.error("Error in save-key:", error);
        return new Response(JSON.stringify({ error: 'Authentication failed or server error' }), { status: 401 });
    }
}