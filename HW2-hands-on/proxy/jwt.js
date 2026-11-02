// Minimal HS256 JWT sign/verify using only Node's crypto module.
const crypto = require("crypto");

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function hmac(data, secret) {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

function sign(payload, secret) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  return `${header}.${body}.${hmac(`${header}.${body}`, secret)}`;
}

// Returns the payload if the token is valid, otherwise throws an Error
// with a short reason that is safe to show to the client.
function verify(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const [header, body, signature] = parts;

  let decodedHeader, payload;
  try {
    decodedHeader = JSON.parse(Buffer.from(header, "base64url").toString());
    payload = JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    throw new Error("malformed token");
  }

  // Only accept HS256. Trusting the alg field blindly allows "alg: none" attacks.
  if (decodedHeader.alg !== "HS256") throw new Error("unsupported algorithm");

  const expected = Buffer.from(hmac(`${header}.${body}`, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw new Error("invalid signature");
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number") throw new Error("token has no exp claim");
  if (now >= payload.exp) throw new Error("token expired");
  if (typeof payload.nbf === "number" && now < payload.nbf) throw new Error("token not active yet");

  return payload;
}

module.exports = { sign, verify };
