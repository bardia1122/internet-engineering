// Reverse proxy that only forwards requests carrying a valid JWT.
const http = require("http");
const { verify } = require("./jwt");

const PORT = Number(process.env.PORT || 80);
const UPSTREAM = new URL(process.env.UPSTREAM || "http://httpbin:8081");
const SECRET = process.env.JWT_SECRET;

if (!SECRET) {
  console.error("JWT_SECRET is not set");
  process.exit(1);
}

function reject(res, status, message) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "WWW-Authenticate": `Bearer error="invalid_token", error_description="${message}"`,
  });
  res.end(JSON.stringify({ error: message }));
}

function authenticate(req) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) throw new Error("missing bearer token");
  return verify(token, SECRET);
}

const server = http.createServer((req, res) => {
  let claims;
  try {
    claims = authenticate(req);
  } catch (err) {
    console.log(`${req.method} ${req.url} -> 401 (${err.message})`);
    return reject(res, 401, err.message);
  }

  const headers = { ...req.headers };
  // The legacy service has no use for the token, so it doesn't need to see it.
  delete headers.authorization;
  headers["x-forwarded-for"] = req.socket.remoteAddress;
  headers["x-forwarded-host"] = req.headers.host || "";
  headers["x-forwarded-proto"] = "http";
  headers["x-authenticated-user"] = String(claims.sub || "");

  const upstreamReq = http.request(
    {
      hostname: UPSTREAM.hostname,
      port: UPSTREAM.port,
      method: req.method,
      path: req.url,
      headers,
    },
    (upstreamRes) => {
      console.log(`${req.method} ${req.url} -> ${upstreamRes.statusCode} (user: ${claims.sub})`);
      res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
      upstreamRes.pipe(res);
    }
  );

  upstreamReq.on("error", (err) => {
    console.error(`upstream error: ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json" });
    }
    res.end(JSON.stringify({ error: "upstream unavailable" }));
  });

  req.pipe(upstreamReq);
});

server.listen(PORT, () => {
  console.log(`proxy listening on :${PORT}, forwarding to ${UPSTREAM.origin}`);
});
