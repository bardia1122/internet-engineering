# HTTP Assignment - Internet Engineering, Fall 1405

## Question 1

**HTTP/0.9:** only GET, a request is a single line, no headers, no status codes, the response is just the HTML document, and the connection closes after it.

**HTTP/1.0:** headers added for requests and responses, status codes, version number in the request line, POST and HEAD methods, Content-Type (so you can send images and other files, not only HTML), simple caching with Expires/Last-Modified. By default every request opens a new TCP connection.

**HTTP/1.1:** persistent connections by default (keep-alive), Host header is required (so many sites can share one IP), pipelining, chunked transfer encoding, range requests (resuming downloads), better caching with Cache-Control and ETag, more methods like PUT, DELETE and OPTIONS. Still text based.

**HTTP/2:** binary framing instead of text, multiplexing (many requests at the same time over one TCP connection), header compression with HPACK, stream priorities, server push (browsers have mostly dropped it now). The meaning of methods/headers/status codes is the same as 1.1. It fixes head-of-line blocking at the HTTP level but not at the TCP level.

**HTTP/3:** runs on QUIC, which runs on UDP. TLS 1.3 is built in so it's always encrypted, handshake is faster (1-RTT, or 0-RTT when reconnecting), streams are independent so there's no head-of-line blocking in the transport, connections can survive an IP change (connection migration, using a connection ID), and QPACK for headers.

**Why UDP in HTTP/3?**

The main problem with HTTP/2 was TCP itself. TCP sees everything as one ordered byte stream, so if one packet is lost, all the streams on that connection have to wait until it's retransmitted, even the ones that had nothing to do with the lost packet. You can't fix this without changing TCP, and changing TCP is basically impossible because it's implemented in OS kernels and lots of middleboxes (firewalls, NATs) inspect it and drop anything they don't recognize. A completely new transport protocol like SCTP has the same problem.

UDP gets through almost every network and does almost nothing on its own, so QUIC can be built on top of it in user space and handle reliability, ordering and congestion control per stream. Being in user space also means it can be updated with the browser instead of waiting for OS updates. Other benefits: the transport and TLS handshakes are combined into one (fewer round trips), and since connections are identified by a connection ID instead of IP and port, switching from Wi-Fi to mobile data doesn't kill the connection.

## Question 2

**a)** In stateless communication the server doesn't remember anything about earlier requests. Each request has to include everything the server needs, and it's handled on its own. This keeps servers simple and easy to scale, because any server can answer any request. In stateful communication the server keeps information about the client (a session) between requests, so what happens in one request depends on the ones before it, like in FTP or a database connection. That's convenient, but scaling and recovering from crashes gets harder.

**b)** HTTP is stateless. By itself the server can't tell that two requests come from the same user, which is a problem for things like logins, shopping carts and settings. The usual fix is to send the state along with each request:

- Cookies: the server sends a `Set-Cookie` header and the browser sends the value back in the `Cookie` header on every later request to that site.
- Sessions: the cookie only contains a random session ID, and the real data (who the user is, what's in the cart) is kept on the server, for example in Redis or a database.
- Tokens like JWT: the user's info is put in a signed token that the client sends in the `Authorization: Bearer ...` header. The server just checks the signature, so it doesn't need to store sessions.
- Older ways: putting the ID in the URL, or hidden form fields.

## Question 3

**a)** In HTTP the server can only answer, it can never start the conversation. But in chat, alerts or webhooks the server is the one that knows when something new happened. The client has no way to find out except asking again and again. If it asks too often, most answers are "nothing new" and bandwidth, server load and battery are wasted. If it asks less often, messages arrive late.

**b)**

*Short polling:* the client sends a request every few seconds asking if there's anything new. It's very easy to build and works everywhere, but most of the requests are useless and the delay can be as long as the polling interval.

*Long polling:* the client sends a request and the server doesn't answer until there's new data (or a timeout). When the answer comes the client sends the next request right away. New data arrives almost immediately and there are far fewer empty responses, but every message still needs a new request and the server has to keep a lot of open connections waiting.

*Server-Sent Events (SSE):* the client opens one request and the server never finishes the response; it keeps writing events into it whenever something happens (`Content-Type: text/event-stream`). Browsers support it with `EventSource`, which also reconnects automatically. It only works from server to client and only for text, which is fine for notifications and alerts.

*WebSocket:* starts as a normal HTTP request with an `Upgrade: websocket` header. The server replies `101 Switching Protocols`, and after that it's a two-way connection where both sides can send messages whenever they want, with very little overhead. This is what most chat apps and online games use. The downside is that these long-lived connections are harder to scale and to pass through some proxies.

*Webhooks:* this is for server to server communication, and the trick is to swap roles. The side that wants notifications runs its own HTTP endpoint and gives its URL to the provider. When something happens (say a payment goes through), the provider sends a POST to that URL, so the provider is now the client. It's still plain HTTP, but the receiver has to be reachable from the internet, should check a signature to make sure the request is real, and the provider needs to retry if delivery fails.

Some other options: WebTransport over HTTP/3, gRPC streaming, and push services like FCM/APNs (Web Push), where the platform keeps one connection open to the device and delivers notifications even when the app isn't running. HTTP/2 server push sounds related but it was only for sending page resources early, not for messages, and browsers have removed it.

## Question 4

`ss://asghar:1234!!@ss.myproxy.com:1234#shadowSocks1`

- Scheme: `ss` (Shadowsocks)
- User info: `asghar:1234!!`, which is username `asghar` and password `1234!!` (`!` is allowed in this part of the URL)
- Host: `ss.myproxy.com` (subdomain `ss`, domain `myproxy`, TLD `com`)
- Port: `1234`
- Path: empty
- Query: none
- Fragment: `shadowSocks1`. In Shadowsocks links this is just the name shown for the server in the client app. The fragment is never sent to the server.

The user info, host and port together are the authority part. (In real Shadowsocks links the user info is usually base64 of `method:password`, here it's written plainly.)

## Question 5

1. Database is broken, logins don't work: **503 Service Unavailable**. It's the server's fault, so a 5xx code, and 503 says the problem is temporary and lets you add a `Retry-After` header. If we don't know what went wrong, 500 is also fine.
2. Username doesn't exist, login failed: **401 Unauthorized**, because authentication failed. I wouldn't use 404 because then an attacker can tell which usernames exist. It's better to return the same code and the same message ("wrong username or password") as for a wrong password.
3. Website moved to another domain: **308 Permanent Redirect** with the new address in `Location`. 301 also means moved permanently, but clients are allowed to turn a POST into a GET after a 301, and for an API that breaks things. 308 keeps the method and body. For normal page links 301 is fine.
4. Too many requests from this user: **429 Too Many Requests**, with `Retry-After`. This code exists for rate limiting.
5. JWT refresh worked and the new token is in a header: **204 No Content** if nothing is in the body, since the request succeeded and there's nothing else to send. If the API also returns a body, then 200 OK.
6. User is from a banned (sanctioned) IP range: **451 Unavailable For Legal Reasons**. The request is refused because of a legal requirement, which is what 451 was made for. 403 Forbidden would also be correct, but 451 tells the client the actual reason.

## Question 6

1. University servers used instead of the main servers for apt packages: a **forward proxy with caching** (basically a mirror/cache). It's on the client side, in the university network. The first time a package is requested it's downloaded and kept, and after that everyone in the university gets it from the local copy, which is faster and saves bandwidth. Examples: apt-cacher-ng, Squid.
2. Splitting requests based on where they come from: a **reverse proxy used as a load balancer**. It's in front of the servers and sends each request to a server or region depending on the client's location (often together with GeoDNS or a CDN).
3. Adding authentication to a very old service: a **reverse proxy**, used as an authentication gateway. You put it in front of the old service, it checks the login (Basic auth, OAuth/SSO, e.g. Nginx with oauth2-proxy) and only passes on requests that are authenticated. The old service doesn't need any changes.

## Use of AI tools

I already knew this material from the Computer Networks course with Dr. Sabaei. I used an AI assitant to write the answers to rewrite them in a simpler style. I went through every answer, checked it against what I learned in that course, and I can explain each part, including why I chose each status code in Question 5.