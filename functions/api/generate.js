// functions/api/generate.js

let lastUsedKeyIndex = 0; // TAMBAHKAN baris ini

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Gunakan onRequestPost untuk hanya menangani metode POST
export async function onRequestPost(context) {
    // request dan env sekarang didapat dari 'context'
    const { request, env } = context;

    const apiKeys = [
        env.GEMINI_API_KEY,
        env.GEMINI_API_KEY_2,
        env.GEMINI_API_KEY_3,
	env.GEMINI_API_KEY_4,
	env.GEMINI_API_KEY_5,
	env.GEMINI_API_KEY_6,
	env.GEMINI_API_KEY_7,
	env.GEMINI_API_KEY_8,
	env.GEMINI_API_KEY_9,
	env.GEMINI_API_KEY_10,
    ].filter(key => key);

    if (apiKeys.length === 0) {
        return new Response(JSON.stringify({ error: "Tidak ada Kunci API Gemini yang diatur di server." }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // --- AWAL PERUBAHAN LOGIKA ---
    // Ganti baris di bawah ini
    // const geminiApiKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];

    // Menjadi seperti ini
    const geminiApiKey = apiKeys[lastUsedKeyIndex];
    lastUsedKeyIndex = (lastUsedKeyIndex + 1) % apiKeys.length;
    // --- AKHIR PERUBAHAN LOGIKA ---

    try {
        const { prompt, isJson, schema } = await request.json();
        if (!prompt) {
            return new Response(JSON.stringify({ error: "Prompt tidak boleh kosong." }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const payload = {
            contents: [{ role: "user", parts: [{ text: prompt }] }]
        };
        if (isJson && schema) {
            payload.generationConfig = {
                responseMimeType: "application/json",
                responseSchema: schema
            };
        }

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;

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