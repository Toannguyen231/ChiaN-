import type { FastifyInstance } from 'fastify';
import { AppError } from '../utils/errors';

export function registerAndroidLinks(app: FastifyInstance, certificates?: string) {
  app.get('/.well-known/assetlinks.json', async (_request, reply) => {
    const fingerprints = certificates?.split(',').map(value => value.trim().toUpperCase());
    return reply.header('Cache-Control', 'no-cache').send(fingerprints?.length ? [{
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: 'com.chiane.app', sha256_cert_fingerprints: fingerprints },
    }] : []);
  });

  app.get('/moi/:inviteCode', async (request, reply) => {
    const { inviteCode } = request.params as { inviteCode: string };
    if (!/^[a-z0-9-]{1,80}$/i.test(inviteCode)) {
      throw new AppError(404, 'INVALID_INVITE', 'Mã mời không hợp lệ.');
    }
    const code = inviteCode.toLowerCase();
    return reply.type('text/html; charset=utf-8').header('Referrer-Policy', 'no-referrer').send(`<!doctype html>
<html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lời mời vào nhóm ChiaNè</title>
<style>body{font:18px/1.55 system-ui;background:#F7F8F2;color:#20392F;max-width:32rem;margin:12vh auto;padding:1.5rem}a{color:#173E32}a.open{display:inline-block;padding:.7rem 1.4rem;background:#D0F477;border-radius:1rem;text-decoration:none;font-weight:650}code{user-select:all}</style>
<main><h1>Vào nhóm ChiaNè</h1><p><a class="open" href="chiane://moi/${code}">Mở lời mời trong ChiaNè</a></p>
<p>Nếu vừa cài ứng dụng, hãy mở lại liên kết này hoặc nhập mã <code>${code}</code> trong mục tham gia nhóm.</p>
<a href="https://play.google.com/apps/testing/com.chiane.app">Tham gia bản thử nghiệm trên Google Play</a></main></html>`);
  });
}
