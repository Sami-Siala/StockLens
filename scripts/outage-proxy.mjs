/**
 * Outage drill (Step 6b): a CONNECT proxy you can switch off, to see what happens when Yahoo stops answering.
 *
 *   node scripts/outage-proxy.mjs                      # listens on 127.0.0.1:8899
 *   npm run build && NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:8899 NO_PROXY=localhost,127.0.0.1 \
 *     NEXT_PUBLIC_DATA_MODE=live npx next start -p 3111
 *   curl localhost:8899/block   # every outbound HTTPS tunnel is refused (Yahoo, Gemini and Groq too)
 *   curl localhost:8899/allow   # back to normal;  curl localhost:8899/status shows counters and hosts
 *
 * Warm a few routes, block, wait past the soft TTLs (quote 45 s, 1H chart 60 s, 1D chart 2 min), then probe:
 * cached routes must answer 200 with meta.stale=true, uncached ones a clean 502, /api/health "down".
 * Send API calls with an `Origin: http://localhost:3111` header. Node 24+ (NODE_USE_ENV_PROXY).
 */
import http from "node:http";
import net from "node:net";

let blocked = false;
let tunnels = 0;
let refused = 0;
const hosts = new Set();

const server = http.createServer((req, res) => {
  if (req.url === "/block") blocked = true;
  if (req.url === "/allow") blocked = false;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ blocked, tunnels, refused, hosts: [...hosts] }));
});

server.on("connect", (req, clientSocket, head) => {
  const [host, port] = req.url.split(":");
  hosts.add(host);
  if (blocked) {
    refused++;
    clientSocket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    return;
  }
  tunnels++;
  const upstream = net.connect(Number(port) || 443, host, () => {
    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    upstream.write(head);
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });
  const done = () => {
    upstream.destroy();
    clientSocket.destroy();
  };
  upstream.on("error", done);
  clientSocket.on("error", done);
});

server.listen(8899, "127.0.0.1", () => console.log("proxy on 8899"));
