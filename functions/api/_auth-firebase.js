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
    // [FIXED] Pesan kesalahan yang lebih umum untuk alasan keamanan
    throw new Error('Invalid authentication token.');
  }
}

/**
 * Mendapatkan Google OAuth2 Access Token dari Service Account.
 * Token ini digunakan untuk mengotentikasi permintaan ke Firestore REST API.
 * @param {object} serviceAccount - Objek service account dari environment variables.
 * @returns {Promise<string>} Access token.
 */
async function getGoogleAuthToken(serviceAccount) {
    const { client_email, private_key } = serviceAccount;
    const scope = 'https://www.googleapis.com/auth/datastore';
    const aud = 'https://oauth2.googleapis.com/token';

    const jwtPayload = {
        iss: client_email,
        scope: scope,
        aud: aud,
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
    };
    
    // Kita tidak bisa menggunakan 'crypto' Node.js, jadi kita harus membuat JWT secara manual
    // dan menandatanganinya menggunakan Web Crypto API yang tersedia di Cloudflare Workers.
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
        throw new Error('Failed to fetch Google Auth Token');
    }
    const tokenData = await tokenResponse.json();
    return tokenData.access_token;
}

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