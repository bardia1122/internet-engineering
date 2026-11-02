// Issues a test token: node token.js <username> [lifetime in seconds]
const { sign } = require("./jwt");

const secret = process.env.JWT_SECRET;
if (!secret) {
  console.error("JWT_SECRET is not set");
  process.exit(1);
}

const sub = process.argv[2] || "student";
const lifetime = Number(process.argv[3] || 3600);
const now = Math.floor(Date.now() / 1000);

console.log(sign({ sub, iat: now, exp: now + lifetime }, secret));
