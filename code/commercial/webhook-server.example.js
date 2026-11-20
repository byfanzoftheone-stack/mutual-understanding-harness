// webhook-server.example.js - minimal zero-dependency example. NOT started automatically; nothing here listens on import.
// Run by hand only when you mean to:  node code/commercial/webhook-server.example.js   (needs STRIPE_WEBHOOK_SECRET, price env vars)
const http = require('http');
const { handleStripeWebhook } = require('./webhook');
function createServer() {
  return http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/api/stripe/webhook') { res.writeHead(404).end(); return; }
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > 1e6) { res.writeHead(413).end(); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      const out = handleStripeWebhook(Buffer.concat(chunks), req.headers['stripe-signature']); // raw bytes, never JSON.parse first
      res.writeHead(out.status, { 'Content-Type': 'application/json' }).end(JSON.stringify(out.body));
    });
  });
}
module.exports = { createServer };
if (require.main === module) createServer().listen(Number(process.env.PORT) || 8787, '127.0.0.1', () => console.log('listening on 127.0.0.1 (put TLS/proxy in front)'));
