// Anda perlu cara untuk menginisialisasi Firebase Admin di Cloudflare Functions
// Ini adalah contoh konseptual, penyiapan `admin` mungkin perlu disesuaikan
// import { initializeApp, cert } from 'firebase-admin/app';
// import { getFirestore } from 'firebase-admin/firestore';

// const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY);
// if (!admin.apps.length) {
//   initializeApp({ credential: cert(serviceAccount) });
// }
// const db = getFirestore();

export async function onRequestPost(context) {
    // FUNGSI INI HANYA MENANGANI METODE POST
    try {
        // 1. Verifikasi Token Pengguna (Langkah Keamanan Krusial)
        // const idToken = context.request.headers.get('Authorization')?.split('Bearer ')?.[1];
        // if (!idToken) {
        //     return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
        // }
        // const decodedToken = await admin.auth().verifyIdToken(idToken);
        // const userId = decodedToken.uid;
        const userId = "USER_ID_DARI_TOKEN_YANG_DIVERIFIKASI"; // Placeholder

        const { apiKey } = await context.request.json();
        if (!apiKey || typeof apiKey !== 'string') {
            return new Response(JSON.stringify({ error: 'Invalid API Key' }), { status: 400 });
        }

        // 2. Simpan Kunci ke Firestore Terenkripsi
        // Dokumen dinamai sesuai UID pengguna untuk kemudahan pengambilan
        // await db.collection('user_api_keys').doc(userId).set({
        //     geminiApiKey: apiKey, // Firestore mengenkripsi data saat disimpan
        //     updatedAt: new Date()
        // });

        return new Response(JSON.stringify({ message: 'API Key saved successfully' }), { status: 200 });

    } catch (error) {
        // Jika token tidak valid, akan error di sini
        return new Response(JSON.stringify({ error: 'Authentication failed' }), { status: 401 });
    }
}