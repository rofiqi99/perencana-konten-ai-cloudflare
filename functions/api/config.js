// functions/api/config.js

// Fungsi onRequest adalah format yang benar untuk Cloudflare Pages
export async function onRequest(context) {
  // 'context.env' berisi environment variables Anda
  const { env } = context;

  const clientConfig = {
    apiKey: env.FIREBASE_API_KEY,
    authDomain: env.FIREBASE_AUTH_DOMAIN,
    projectId: env.FIREBASE_PROJECT_ID,
    storageBucket: env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID,
    appId: env.FIREBASE_APP_ID,
  };

  // Mengembalikan Response baru, sama seperti sebelumnya
  return new Response(JSON.stringify(clientConfig), {
    headers: { 'Content-Type': 'application/json' },
  });
}