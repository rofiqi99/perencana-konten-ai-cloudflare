// functions/api/generate.js

// [FIXED] Pindahkan variabel ini ke luar fungsi agar persisten.
let lastUsedKeyIndex = 0;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function onRequestPost(context) {
    const { request, env } = context;

    // Menggabungkan semua kunci menjadi satu tim yang solid.
    const allApiKeys = [
        env.GEMINI_API_KEY_PRIMARY,
        env.GEMINI_API_KEY_SECONDARY_1,
        env.GEMINI_API_KEY_SECONDARY_2,
        env.GEMINI_API_KEY_SECONDARY_3,
        env.GEMINI_API_KEY_SECONDARY_4,
        env.GEMINI_API_KEY_SECONDARY_5,
        env.GEMINI_API_KEY_SECONDARY_6,
        env.GEMINI_API_KEY_SECONDARY_7,
        env.GEMINI_API_KEY_SECONDARY_8,
        env.GEMINI_API_KEY_SECONDARY_9,
        env.GEMINI_API_KEY_SECONDARY_10,
        env.GEMINI_API_KEY_SECONDARY_11,
        env.GEMINI_API_KEY_SECONDARY_12,
        env.GEMINI_API_KEY_SECONDARY_13,
        env.GEMINI_API_KEY_SECONDARY_14,
        env.GEMINI_API_KEY_SECONDARY_15,
        env.GEMINI_API_KEY_SECONDARY_16,
        env.GEMINI_API_KEY_SECONDARY_17,
        env.GEMINI_API_KEY_SECONDARY_18,
        env.GEMINI_API_KEY_SECONDARY_19,
        env.GEMINI_API_KEY_SECONDARY_20,
        env.GEMINI_API_KEY_SECONDARY_21,
        env.GEMINI_API_KEY_SECONDARY_22,
        env.GEMINI_API_KEY_SECONDARY_23,
        env.GEMINI_API_KEY_SECONDARY_24,
        env.GEMINI_API_KEY_SECONDARY_25,
        env.GEMINI_API_KEY_SECONDARY_26,
        env.GEMINI_API_KEY_SECONDARY_27,
        env.GEMINI_API_KEY_SECONDARY_28,
        env.GEMINI_API_KEY_SECONDARY_29,
        env.GEMINI_API_KEY_SECONDARY_30,
        env.GEMINI_API_KEY_SECONDARY_31,
        env.GEMINI_API_KEY_SECONDARY_33,
        env.GEMINI_API_KEY_SECONDARY_34,
        env.GEMINI_API_KEY_SECONDARY_35,

    ].filter(key => key); // Memastikan hanya kunci yang ada yang masuk ke pool

    if (allApiKeys.length === 0) {
        return new Response(JSON.stringify({ error: "Tidak ada Kunci API Gemini yang diatur di server." }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const { prompt, isJson, schema } = await request.json();

        if (!prompt) {
            return new Response(JSON.stringify({ error: "Prompt tidak boleh kosong." }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        
        // Pilih kunci berikutnya dari pool secara bergiliran.
        const geminiApiKey = allApiKeys[lastUsedKeyIndex];
        console.log(`Menggunakan API Key dari pool (indeks: ${lastUsedKeyIndex})`);
        lastUsedKeyIndex = (lastUsedKeyIndex + 1) % allApiKeys.length;

        const payload = {
            contents: [{ role: "user", parts: [{ text: prompt }] }]
        };
        if (isJson && schema) {
            payload.generationConfig = {
                responseMimeType: "application/json",
                responseSchema: schema
            };
        }

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`;

        let geminiResponse;
        const maxRetries = 5;
        let attempt = 0;
        let delay = 1500;

        while (attempt < maxRetries) {
            attempt++;
            try {
                geminiResponse = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (geminiResponse.ok) break;

                if (geminiResponse.status === 429 || geminiResponse.status === 503) {
                    await sleep(delay);
                    delay *= 2;
                    continue;
                }
                
                const errorResult = await geminiResponse.json();
                return new Response(JSON.stringify({ error: errorResult.error?.message || "Terjadi kesalahan pada API Gemini." }), {
                    status: geminiResponse.status,
                    headers: { 'Content-Type': 'application/json' },
                });

            } catch (networkError) {
                 await sleep(delay);
                 delay *= 2;
            }
        }

        if (!geminiResponse || !geminiResponse.ok) {
             return new Response(JSON.stringify({ error: "Model AI sedang sibuk. Silakan coba beberapa saat lagi." }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        
        const geminiResult = await geminiResponse.json();
        const text = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        
        return new Response(text, {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: "Terjadi kesalahan internal pada server." }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}