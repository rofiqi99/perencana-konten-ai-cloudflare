// functions/api/_auth-firebase.js

import { createRemoteJWKSet, jwtVerify } from 'jose';

// URL tempat Google menyimpan kunci publik untuk verifikasi token
const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken.google.com'));

/**
 * Memverifikasi Firebase ID Token menggunakan library 'jose' yang ramah edge.
 * @param {string} idToken - Token JWT yang dikirim dari klien.
 * @param {string} projectId - Firebase Project ID Anda dari environment variables.
 * @returns {Promise<object>} Payload token yang terverifikasi.
 */
async function verifyFirebaseToken(idToken, projectId) {
  if (!idToken) {
    throw new Error('No token provided.');
  }
  if (!projectId) {
    throw new Error('Firebase Project ID is not configured.');
  }

  try {
    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    return payload;
  } catch (error) {
    console.error("Token verification failed:", error.message);
    throw new Error('Invalid authentication token.');
  }
}

// ▼▼▼ PERUBAHAN DIMULAI DI SINI ▼▼▼

// Objek sederhana untuk menyimpan token yang valid sementara
const tokenCache = {
    token: null,
    expiresAt: 0,
};

/**
 * Mendapatkan Google OAuth2 Access Token dari Service Account dengan mekanisme Caching.
 * Token ini digunakan untuk mengotentikasi permintaan ke Firestore REST API.
 * @param {object} serviceAccount - Objek service account dari environment variables.
 * @returns {Promise<string>} Access token.
 */
async function getGoogleAuthToken(serviceAccount) {
    // Cek apakah token di cache masih valid (masih berlaku untuk 5 menit ke depan)
    if (tokenCache.token && tokenCache.expiresAt > Date.now() + 5 * 60 * 1000) {
        return tokenCache.token;
    }

    const { client_email, private_key } = serviceAccount;
    const scope = 'https://www.googleapis.com/auth/datastore';
    const aud = 'https://oauth2.googleapis.com/token';

    const jwtPayload = {
        iss: client_email,
        scope: scope,
        aud: aud,
        exp: Math.floor(Date.now() / 1000) + 3600, // Token berlaku 1 jam
        iat: Math.floor(Date.now() / 1000),
    };
    
    const privateKeyImported = await crypto.subtle.importKey(
        "pkcs8",
        pemToBinary(private_key),
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const payload = btoa(JSON.stringify(jwtPayload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const dataToSign = new TextEncoder().encode(`${header}.${payload}`);

    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKeyImported, dataToSign);
    const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

    const signedJwt = `${header}.${payload}.${signatureB64}`;

    const tokenResponse = await fetch(aud, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signedJwt}`,
    });

    if (!tokenResponse.ok) {
        // Jika gagal, bersihkan cache untuk memastikan percobaan berikutnya membuat token baru
        tokenCache.token = null;
        tokenCache.expiresAt = 0;
        throw new Error('Failed to fetch Google Auth Token');
    }
    const tokenData = await tokenResponse.json();
    
    // Simpan token dan waktu kedaluwarsa ke cache
    tokenCache.token = tokenData.access_token;
    tokenCache.expiresAt = Date.now() + (tokenData.expires_in * 1000);

    return tokenCache.token;
}

// ▲▲▲ PERUBAHAN BERAKHIR DI SINI ▲▲▲

// Helper untuk mengubah kunci PEM menjadi format yang bisa dibaca Web Crypto API
function pemToBinary(pem) {
    const base64 = pem.replace(/-+BEGIN PRIVATE KEY-+\s*|\s*-+END PRIVATE KEY-+/g, '');
    const binaryDer = atob(base64);
    const buffer = new ArrayBuffer(binaryDer.length);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < binaryDer.length; i++) {
        view[i] = binaryDer.charCodeAt(i);
    }
    return buffer;
}


export { verifyFirebaseToken, getGoogleAuthToken };