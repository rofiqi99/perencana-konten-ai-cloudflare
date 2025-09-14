// functions/api/tripay-webhook.js

import { getGoogleAuthToken } from './_auth-firebase.js';

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const signature = request.headers.get('X-Callback-Signature');
        const payload = await request.json();

        // Verifikasi tanda tangan menggunakan kunci privat Tripay
        const privateKey = env.TRIPAY_PRIVATE_KEY;
        const hmac = crypto.createHmac('sha256', privateKey);
        const signed = hmac.update(JSON.stringify(payload)).digest('hex');

        if (signature !== signed) {
            return new Response(JSON.stringify({ success: false, message: "Invalid signature" }), { status: 403 });
        }

        const { reference, status, custom_field, total_amount } = payload;

        if (status === 'PAID') {
            const userId = custom_field.userId; 

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