'use strict';
/** Aleatoriedade criptográfica disponível em Node >= 20 e nos navegadores (Web Crypto). */
function randomBytes(n) {
  const a = new Uint8Array(n);
  globalThis.crypto.getRandomValues(a);
  return a;
}
const randomHex = (n) => Array.from(randomBytes(n), (b) => b.toString(16).padStart(2, '0')).join('');

/** Hash SHA-256 síncrono não existe na Web Crypto; para tokens de sessão usamos o próprio token aleatório longo. */
function safeEqual(a, b) {
  a = String(a || '');
  b = String(b || '');
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
module.exports = { randomBytes, randomHex, safeEqual };
