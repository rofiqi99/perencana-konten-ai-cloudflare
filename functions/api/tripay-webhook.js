import { getGoogleAuthToken } from './_auth-firebase.js';

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const signature = request.headers.get('X-Callback-Signature');
        const payload = await request.json();

        // PERBAIKAN: Gunakan Web Crypto API untuk memverifikasi tanda tangan
        const privateKeyData = new TextEncoder().encode(env.TRIPAY_PRIVATE_KEY);
        const dataToSign = new TextEncoder().encode(JSON.stringify(payload));
        const key = await crypto.subtle.importKey('raw', privateKeyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const signedBuffer = await crypto.subtle.sign('HMAC', key, dataToSign);
        const signedArray = Array.from(new Uint8Array(signedBuffer));
        const signedHex = signedArray.map(b => b.toString(16).padStart(2, '0')).join('');

        if (signature !== signedHex) {
            return new Response(JSON.stringify({ success: false, message: "Invalid signature" }), { status: 403 });
        }

        const { status, custom_field } = payload;

        if (status === 'PAID') {
            const userId = custom_field?.userId;
            if (!userId) {
                return new Response(JSON.stringify({ success: false, message: "User ID not found in webhook payload" }), { status: 400 });
            }

            // Dapatkan token autentikasi untuk Firestore
            const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY);
            const authToken = await getGoogleAuthToken(serviceAccount);
            const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${userId}`;

            const firestorePayload = {
                fields: {
                    isPremium: { booleanValue: true },
                    premiumActivatedAt: { timestampValue: new Date().toISOString() }
                }
            };
            
            const firestoreResponse = await fetch(firestoreUrl, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(firestorePayload)
            });

            if (!firestoreResponse.ok) {
                 return new Response(JSON.stringify({ success: false, message: "Failed to update user status" }), { status: 500 });
            }
        }

        return new Response(JSON.stringify({ success: true }), { status: 200 });

    } catch (error) {
        console.error("Webhook processing error:", error);
        return new Response(JSON.stringify({ success: false, message: error.message }), { status: 500 });
    }
}