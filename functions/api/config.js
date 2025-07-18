// functions/config.js
export default {
  async fetch(request, env, ctx) {
    const clientConfig = {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    };

    return new Response(JSON.stringify(clientConfig), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};