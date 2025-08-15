// functions/api/regenerate.js

import { verifyFirebaseToken, getGoogleAuthToken } from './_auth-firebase.js';

// Ambil kunci API dari environment, sama seperti di generate.js
// Variabel ini akan melacak kunci mana yang terakhir digunakan.
let lastUsedKeyIndex = 0;

const buildRegeneratePrompt = (itemToReplace, contextInputs) => {
    const audienceDescription = `Usia dari ${contextInputs.audience.age_from || 'tidak spesifik'} sampai ${contextInputs.audience.age_to || 'tidak spesifik'}, Jenis Kelamin ${contextInputs.audience.gender || 'semua'}, dengan minat pada ${contextInputs.audience.interests || 'tidak spesifik'}.`;
    const baseInfo = contextInputs.isProductFocus 
        ? `untuk produk "${contextInputs.productName}" (${contextInputs.productDescription})` 
        : `untuk bisnis "${contextInputs.businessName}" di industri "${contextInputs.industry}"`;

    const languageInstruction = "ATURAN MUTLAK: Seluruh teks dalam respons JSON yang Anda hasilkan HARUS dalam Bahasa Indonesia.";

    return `Anda adalah ahli strategi sosial media. Saya butuh satu ide konten BARU untuk menggantikan ide yang sudah ada.

    Konteks Bisnis: ${baseInfo}
    Target Audiens: ${audienceDescription}
    Tujuan Konten: ${contextInputs.businessStage}
    Suasana Konten: ${contextInputs.contentMood}
    Platform: ${itemToReplace.platform}

    Ide yang akan diganti adalah: "${itemToReplace.idea}" (Pilar: ${itemToReplace.pillar}).

    Tugas Anda:
    1. Buat satu ide konten yang SANGAT BERBEDA dari ide yang akan diganti.
    2. Ide baru harus tetap sesuai dengan semua konteks (audiens, tujuan, suasana, platform).
    3. Jaga agar tanggal/hari ('day') tetap sama: "${itemToReplace.day}".
    4. Hasilkan dalam format JSON tunggal (bukan dalam array 'plan'), sesuai dengan skema yang diberikan.
    ${languageInstruction}`;
}

const singleIdeaSchema = { type: "OBJECT", properties: { day: { type: "STRING" }, platform: { type: "STRING" }, pillar: { type: "STRING" }, idea: { type: "STRING" }, caption_brief: { type: "STRING" }, visual_idea: { type: "STRING" }, hashtags: { type: "STRING" } }, required: ["day", "platform", "pillar", "idea", "caption_brief", "visual_idea", "hashtags"] };


export async function onRequestPost(context) {
    const { request, env } = context;
    const REGENERATION_DAILY_LIMIT = 3;

    try {
        // 1. Verifikasi Token Pengguna
        const idToken = request.headers.get('Authorization')?.split('Bearer ')?.[1];
        const projectId = env.FIREBASE_PROJECT_ID;
        const decodedToken = await verifyFirebaseToken(idToken, projectId);
        const userId = decodedToken.uid;

        // Jangan proses jika pengguna anonim
        if (decodedToken.provider_id === 'anonymous') {
             return new Response(JSON.stringify({ error: 'Fitur ini memerlukan login.' }), { status: 403 });
        }

        // 2. Dapatkan token akses untuk Firestore
        const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY);
        const authToken = await getGoogleAuthToken(serviceAccount);

        // 3. Baca data penggunaan dari Firestore
        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/user_usage/${userId}`;
        const usageResponse = await fetch(firestoreUrl, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        let usageData = { regenerationCount: 0, lastResetDate: '' };
        if (usageResponse.ok) {
            const firestoreDoc = await usageResponse.json();
            usageData.regenerationCount = firestoreDoc.fields.regenerationCount?.integerValue || 0;
            usageData.lastResetDate = firestoreDoc.fields.lastResetDate?.stringValue || '';
        }

        // 4. Logika Pengecekan Batas
        const today = new Date().toISOString().split('T')[0]; // Format YYYY-MM-DD
        if (usageData.lastResetDate !== today) {
            usageData.regenerationCount = 0; // Reset jika hari berbeda
        }

        if (usageData.regenerationCount >= REGENERATION_DAILY_LIMIT) {
            const errorMessage = `Anda telah menggunakan fitur ini ${usageData.regenerationCount} dari ${REGENERATION_DAILY_LIMIT} kali hari ini. Upgrade ke premium untuk penggunaan tanpa batas.`;
            return new Response(JSON.stringify({ error: errorMessage }), { status: 429 });
        }

        // 5. Jika OK, panggil API Gemini
        const { itemToReplace, context: currentInputs } = await request.json();
        const prompt = buildRegeneratePrompt(itemToReplace, currentInputs);

        const allApiKeys = [env.GEMINI_API_KEY_PRIMARY, /* ...tambahkan kunci lainnya jika ada */].filter(key => key);
        const geminiApiKey = allApiKeys[lastUsedKeyIndex];
        lastUsedKeyIndex = (lastUsedKeyIndex + 1) % allApiKeys.length;

        const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`;
        const geminiPayload = {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: singleIdeaSchema
            }
        };

        const geminiResponse = await fetch(geminiApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiPayload)
        });

        if (!geminiResponse.ok) {
            const errorResult = await geminiResponse.json();
            throw new Error(errorResult.error?.message || "Terjadi kesalahan pada API Gemini.");
        }

        // 6. Update hitungan di Firestore SETELAH berhasil
        const newCount = parseInt(usageData.regenerationCount) + 1;
        const updatePayload = {
            fields: {
                regenerationCount: { integerValue: newCount },
                lastResetDate: { stringValue: today }
            }
        };

        await fetch(firestoreUrl, {
            method: 'PATCH', // Menggunakan PATCH untuk membuat atau menimpa dokumen
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updatePayload)
        });

        // 7. Kembalikan hasil ke frontend
        const geminiResult = await geminiResponse.json();
        const text = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

        return new Response(text, {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error("Error in regenerate function:", error.message);
        return new Response(JSON.stringify({ error: error.message || 'Terjadi kesalahan internal server' }), { status: 500 });
    }
}