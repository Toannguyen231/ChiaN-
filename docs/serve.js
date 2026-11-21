const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = 3333;
const HTML_FILE = path.join(__dirname, 'PRODUCT_ANALYSIS_DASHBOARD.html');

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  fs.createReadStream(HTML_FILE).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Product analysis dashboard running at http://localhost:${PORT}`);
});
