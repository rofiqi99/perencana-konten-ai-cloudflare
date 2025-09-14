// functions/api/create-tripay-transaction.js

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const { planId, amount, name, email, phone, userId } = await request.json();

        // 1. Verifikasi data masukan
        if (!planId || !amount || !name || !email) {
            return new Response(JSON.stringify({ error: "Data transaksi tidak lengkap." }), { status: 400 });
        }

        // 2. Siapkan data untuk Tripay API
        const merchantRef = `TX-${userId}-${Date.now()}`;
        
        // PERBAIKAN: Gunakan Web Crypto API untuk membuat tanda tangan
        const dataToHash = new TextEncoder().encode(`${env.TRIPAY_MERCHANT_CODE}${merchantRef}${amount}`);
        const hashBuffer = await crypto.subtle.digest('SHA-256', dataToHash);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        const payload = {
            method: "QRIS",
            merchant_ref: merchantRef,
            amount: amount,
            customer_name: name,
            customer_email: email,
            customer_phone: phone,
            callback_url: "https://perencana-konten-ai-cloudflare.pages.dev/api/tripay-webhook",
            order_items: [{
                sku: planId,
                name: "Upgrade Akun Premium",
                price: amount,
                quantity: 1
            }],
            signature: signature,
            custom_field: {
                userId: userId
            }
        };

        // 3. Kirim permintaan ke Tripay API
        const tripayResponse = await fetch(`${env.TRIPAY_API_URL}/v1/transaction/create`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.TRIPAY_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        if (!tripayResponse.ok) {
            const errorData = await tripayResponse.json();
            console.error("Tripay API Error:", errorData);
            return new Response(JSON.stringify({ error: errorData.message || 'Gagal membuat transaksi di Tripay.' }), { status: tripayResponse.status });
        }

        const tripayResult = await tripayResponse.json();

        return new Response(JSON.stringify({
            success: true,
            data: tripayResult.data
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error("Error in create-tripay-transaction:", error.message);
        return new Response(JSON.stringify({ error: error.message || 'Terjadi kesalahan internal server' }), { status: 500 });
    }
}