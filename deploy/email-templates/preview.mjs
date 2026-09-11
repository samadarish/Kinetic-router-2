import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

// Local design preview only. Sample values are never used by the live template.
const template = new URL('./verification.en.html', import.meta.url);
const server = createServer(async (request, response) => {
  if (request.url !== '/' && request.url !== '/email') {
    response.writeHead(404).end();
    return;
  }
  try {
    const html = request.url === '/email'
      ? (await readFile(template, 'utf8'))
        .replaceAll('{{verification_code}}', '123456')
        .replaceAll('{{expires_in_minutes}}', '15')
      : `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>kineticRouter email preview</title>
<style>
body{margin:0;padding:32px 20px;background:#191918;color:#e8e7df;font:16px/1.5 Arial,Helvetica,sans-serif}
main{max-width:1030px;margin:auto}h1{font-size:24px;margin:0 0 8px}p{color:#a6a69f;margin:0 0 24px}
.previews{display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start}section{max-width:100%}
h2{font-size:13px;font-weight:400;color:#a6a69f}iframe{display:block;max-width:100%;border:1px solid #363634;border-radius:14px;background:#191918;box-sizing:border-box}
</style></head><body><main><h1>Verification email preview</h1><p>Desktop and mobile layouts. The code below is a sample and cannot verify an account.</p>
<div class="previews"><section><h2>Desktop · 600px</h2><iframe title="Desktop verification email" src="/email" width="600" height="800"></iframe></section>
<section><h2>Mobile · 360px</h2><iframe title="Mobile verification email" src="/email" width="360" height="800"></iframe></section></div>
</main></body></html>`;
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(html);
  } catch {
    response.writeHead(500).end('Unable to load the email template.');
  }
});

server.listen(5175, '127.0.0.1', () => {
  console.log('Email preview: http://127.0.0.1:5175');
});
