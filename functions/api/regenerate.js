// functions/api/regenerate.js

// Tidak lagi memerlukan verifikasi token untuk fungsi ini
// import { verifyFirebaseToken, getGoogleAuthToken } from './_auth-firebase.js';

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
    1. Buat satu ide konten yang SANGAT BERBEDA dari ide yang sudah ada.
    2. Ide baru harus tetap sesuai dengan semua konteks (audiens, tujuan, suasana, platform).
    3. Jaga agar tanggal/hari ('day') tetap sama: "${itemToReplace.day}".
    4. Hasilkan dalam format JSON tunggal (bukan dalam array 'plan'), sesuai dengan skema yang diberikan.
    ${languageInstruction}`;
}

const singleIdeaSchema = { type: "OBJECT", properties: { day: { type: "STRING" }, platform: { type: "STRING" }, pillar: { type: "STRING" }, idea: { type: "STRING" }, caption_brief: { type: "STRING" }, visual_idea: { type: "STRING" }, hashtags: { type: "STRING" } }, required: ["day", "platform", "pillar", "idea", "caption_brief", "visual_idea", "hashtags"] };


export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        // Menghapus semua logika otentikasi untuk memungkinkan akses tanpa batas.

        const { itemToReplace, context: currentInputs } = await request.json();
        const prompt = buildRegeneratePrompt(itemToReplace, currentInputs);
        
        const allApiKeys = [
            env.GEMINI_API_KEY_PRIMARY, env.GEMINI_API_KEY_SECONDARY_1, env.GEMINI_API_KEY_SECONDARY_2,
            env.GEMINI_API_KEY_SECONDARY_3, env.GEMINI_API_KEY_SECONDARY_4, env.GEMINI_API_KEY_SECONDARY_5,
            env.GEMINI_API_KEY_SECONDARY_6, env.GEMINI_API_KEY_SECONDARY_7, env.GEMINI_API_KEY_SECONDARY_8,
            env.GEMINI_API_KEY_SECONDARY_9, env.GEMINI_API_KEY_SECONDARY_10, env.GEMINI_API_KEY_SECONDARY_11,
            env.GEMINI_API_KEY_SECONDARY_12, env.GEMINI_KEY_SECONDARY_13, env.GEMINI_KEY_SECONDARY_14,
            env.GEMINI_API_KEY_SECONDARY_15, env.GEMINI_API_KEY_SECONDARY_16, env.GEMINI_API_KEY_SECONDARY_17,
            env.GEMINI_API_KEY_SECONDARY_18, env.GEMINI_API_KEY_SECONDARY_19, env.GEMINI_API_KEY_SECONDARY_20,
            env.GEMINI_API_KEY_SECONDARY_21, env.GEMINI_API_KEY_SECONDARY_22, env.GEMINI_API_KEY_SECONDARY_23,
            env.GEMINI_API_KEY_SECONDARY_24, env.GEMINI_API_KEY_SECONDARY_25, env.GEMINI_API_KEY_SECONDARY_26,
            env.GEMINI_API_KEY_SECONDARY_27, env.GEMINI_API_KEY_SECONDARY_28, env.GEMINI_API_KEY_SECONDARY_29,
            env.GEMINI_API_KEY_SECONDARY_30, env.GEMINI_API_KEY_SECONDARY_31, env.GEMINI_API_KEY_SECONDARY_33,
            env.GEMINI_API_KEY_SECONDARY_34, env.GEMINI_API_KEY_SECONDARY_35,
        ].filter(key => key);

        if (allApiKeys.length === 0) {
            return new Response(JSON.stringify({ error: "Tidak ada Kunci API Gemini yang diatur di server." }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        let currentKeyIndex = lastUsedKeyIndex;
        let geminiApiKey;
        let geminiResponse;
        let attempts = 0;
        const maxAttempts = allApiKeys.length;

        while (attempts < maxAttempts) {
            geminiApiKey = allApiKeys[currentKeyIndex];
            const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;
            const geminiPayload = {
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: singleIdeaSchema
                }
            };

            geminiResponse = await fetch(geminiApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(geminiPayload)
            });

            if (geminiResponse.ok) {
                lastUsedKeyIndex = (currentKeyIndex + 1) % allApiKeys.length;
                break;
            }

            // Jika respons tidak berhasil, coba kunci berikutnya
            console.error(`Attempt ${attempts + 1} with key at index ${currentKeyIndex} failed: ${geminiResponse.status}`);
            currentKeyIndex = (currentKeyIndex + 1) % allApiKeys.length;
            attempts++;
        }

        if (!geminiResponse || !geminiResponse.ok) {
             const errorResult = await geminiResponse.json();
             throw new Error(errorResult.error?.message || "Terjadi kesalahan pada API Gemini.");
        }

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