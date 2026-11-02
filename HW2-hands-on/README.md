# HTTP Hands-on: Internet Engineering, Fall 1405

AI use: I used Claude to help write the proxy code and to improve the wording of the answers below. I can explain every line of the code in the in-person session. Also,

## 1. Running a service only on the internal network

The service should not be reachable from outside, so nothing from the internet can connect to its port. A few ways to do this, and in practice more than one is used at the same time:

- **Bind address.** A server listens on an IP address, not only a port. If it listens on `0.0.0.0` it accepts connections on every interface, including the public one. If it listens on `127.0.0.1` only processes on the same machine can reach it, and if it listens on the private address of the internal interface (for example `10.0.0.5`) only machines on that network can.
- **Firewall.** With `iptables`, `nftables` or `ufw` on the server, drop incoming traffic to the service port unless it comes from the internal range, e.g. `ufw allow from 10.0.0.0/8 to any port 8081` and deny the rest. Cloud providers have the same thing as security groups.
- **Private addressing and NAT.** Internal machines get addresses from the private ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), which are not routed on the internet. Outside users can only reach them if the router has a port forward for them, so you just don't add one.
- **Docker.** A container port is only reachable from the host if it is published with `ports:`. Leave that out and the container can only be reached by other containers on the same Docker network. A network created with `internal: true` goes further and has no route to the outside at all. If the port has to be published for local testing, publish it on loopback only: `127.0.0.1:8081:8080`.

In this project httpbin has no `ports` section and is only attached to an `internal: true` network. The proxy is the only container on both networks, so it is the only way in.

## 2. TLS termination

TLS termination means the HTTPS connection from the client ends at the proxy (or a load balancer) instead of at the application. The proxy holds the certificate and private key, decrypts the request, and forwards it as plain HTTP to the service on the internal network. The response goes back the same way and gets encrypted by the proxy before it leaves.

Why do it this way:

- Legacy services often can't speak TLS at all, or only support old versions and ciphers that shouldn't be used anymore. Changing the old code is risky or impossible. Putting TLS in front of it gives clients a modern HTTPS connection without touching the service.
- Certificates and keys live in one place. Renewing a certificate (for example with Let's Encrypt every 90 days) is done once on the proxy instead of on every backend, and the private key is not copied to many machines.
- The proxy can see the decrypted request. That's what lets it read the `Authorization` header and check the JWT, do routing based on path or headers, log requests, cache, or block bad traffic. With end-to-end encryption to the backend the proxy would only see bytes.
- Encryption has a CPU cost. The proxy can be tuned for it (session resumption, hardware support), and the backends don't have to spend resources on it.

It also matters for JWT itself. A JWT is a bearer token: whoever has it can use it. Over plain HTTP anyone on the path can read the token and replay it until it expires, so JWT authentication on the public side is only safe if it runs over TLS.

The tradeoff is that traffic between the proxy and the backend is unencrypted. That's fine when the internal network is trusted and isolated, like in question 1. If it isn't, the proxy can open a new TLS connection to the backend (TLS re-encryption / bridging), or use mutual TLS so the backend also checks that the request really comes from the proxy.


## 3. JWT authentication proxy

The proxy is a small Node.js server with no external packages ([`proxy/server.js`](proxy/server.js)). For every request it:

1. Reads the `Authorization: Bearer <token>` header. If it's missing, it answers `401`.
2. Verifies the token ([`proxy/jwt.js`](proxy/jwt.js)): three parts, `alg` must be `HS256` (so a token with `alg: none` is rejected), the HMAC-SHA256 signature must match the secret (compared with `timingSafeEqual`), and `exp` must be in the future. `nbf` is checked if present.
3. If the token is valid, forwards the request to httpbin with the same method, path, query and body. The `Authorization` header is removed and `X-Forwarded-For`, `X-Forwarded-Host`, `X-Forwarded-Proto` and `X-Authenticated-User` (the `sub` claim) are added.
4. Streams httpbin's response back to the client. If httpbin is down it returns `502`.

The setup is in [`docker-compose.yml`](docker-compose.yml):

```
internet --:80--> proxy (public + internal networks) --:8081--> httpbin (internal network only)
```

The proxy listens on 8080 inside its container (it runs as the non-root `node` user) and Docker maps host port 80 to it. httpbin is started with `PORT=8081`.

### Running it

```
cp .env.example .env          # then put a long random value in JWT_SECRET
docker compose up --build -d
```

Getting a token (it uses the same secret, so it's for testing only; in a real setup tokens come from a login service):

```
docker compose exec proxy node token.js alice 3600
```

The second argument is the lifetime in seconds.

### Testing

```
# no token -> 401
curl -i http://localhost/get

# valid token -> 200, httpbin's response
TOKEN=$(docker compose exec -T proxy node token.js alice)
curl -i -H "Authorization: Bearer $TOKEN" http://localhost/get
curl -i -H "Authorization: Bearer $TOKEN" -X POST -d 'hello' http://localhost/anything

# expired token -> 401 token expired
OLD=$(docker compose exec -T proxy node token.js alice -10)
curl -i -H "Authorization: Bearer $OLD" http://localhost/get

# httpbin itself is not reachable from the host
curl -i http://localhost:8081/get
```

In the `/get` response, `headers` shows `X-Authenticated-User: alice` and no `Authorization` header, which confirms the request went through the proxy.

### Files

```
HW2-hands-on/
├── docker-compose.yml
├── .env.example
└── proxy/
    ├── Dockerfile
    ├── jwt.js       # HS256 sign and verify
    ├── server.js    # the reverse proxy
    └── token.js     # CLI to issue test tokens
```

