import { deflateSync } from 'node:zlib';

const DEMO_GROUP_NAME = 'Chuyến đi Đà Lạt (Demo)';

function parseArgs(argv) {
  const args = {
    apiUrl: process.env.API_URL ?? '',
    phone: process.env.REVIEWER_DEMO_PHONE ?? '',
    otp: process.env.REVIEWER_DEMO_OTP ?? '',
    allowHttp: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--api-url' && argv[i + 1]) {
      args.apiUrl = argv[++i];
    } else if (token === '--phone' && argv[i + 1]) {
      args.phone = argv[++i];
    } else if (token === '--otp' && argv[i + 1]) {
      args.otp = argv[++i];
    } else if (token === '--allow-http') {
      args.allowHttp = true;
    } else if (token === '--help' || token === '-h') {
      console.log(
        'Cách dùng: node scripts/release/seed-reviewer-demo.mjs --api-url <https://...> --phone <09xxxxxxxx> --otp <6-digits> [--allow-http]'
      );
      process.exit(0);
    }
  }

  return args;
}

function validateOrigin(rawUrl, allowHttp) {
  let url;
  try {
    url = new URL(rawUrl.trim().replace(/\/+$/, ''));
  } catch {
    throw new Error(`URL không hợp lệ: "${rawUrl}". Ví dụ đúng: https://chiane-api.onrender.com`);
  }

  if (!allowHttp && url.protocol !== 'https:') {
    throw new Error('URL API bắt buộc dùng HTTPS (hoặc thêm --allow-http nếu test local).');
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(
      `Vui lòng truyền origin gốc (không kèm "${url.pathname}"). Ví dụ đúng: ${url.origin}`
    );
  }
  return url.origin;
}

function normalizePhone(rawPhone) {
  const digits = rawPhone.replace(/[^\d+]/g, '');
  let subscriber = '';
  if (digits.startsWith('+84')) subscriber = digits.slice(3);
  else if (digits.startsWith('84') && digits.length === 11) subscriber = digits.slice(2);
  else if (digits.startsWith('0') && digits.length === 10) subscriber = digits.slice(1);
  else if (/^\d{9}$/.test(digits)) subscriber = digits;

  if (!/^[35789]\d{8}$/.test(subscriber)) {
    throw new Error(`Số điện thoại Việt Nam chưa hợp lệ: "${rawPhone}"`);
  }

  return {
    e164: `+84${subscriber}`,
    local: `0${subscriber}`,
    subscriber,
  };
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function createSampleReceiptPng(width = 64, height = 64) {
  const signature = Buffer.from('89504e470d0a1a0a', 'hex');
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = 1 + width * 4;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter None
    for (let x = 0; x < width; x += 1) {
      const idx = rowStart + 1 + x * 4;
      const isHeader = y < 12;
      const isLine = y >= 20 && y <= 50 && y % 8 < 2 && x >= 10 && x <= 53;
      if (isHeader || isLine) {
        // ChiaNe Forest (#173E32)
        raw[idx] = 23;
        raw[idx + 1] = 62;
        raw[idx + 2] = 50;
        raw[idx + 3] = 255;
      } else {
        // ChiaNe Cream (#FAF9F5)
        raw[idx] = 250;
        raw[idx + 1] = 249;
        raw[idx + 2] = 245;
        raw[idx + 3] = 255;
      }
    }
  }

  const idat = deflateSync(raw);
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
    signal: AbortSignal.timeout(30_000),
  });

  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  if (!response.ok) {
    const message = json?.error?.message || text || `HTTP ${response.status}`;
    throw new Error(`${options.method || 'GET'} ${url} thất bại (${response.status}): ${message}`);
  }

  return json;
}

async function checkPublicEndpoint(origin, pathname, expectedText) {
  const url = `${origin}${pathname}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`GET ${url} trả về HTTP ${response.status}`);
  }
  const body = await response.text();
  if (expectedText && !body.includes(expectedText)) {
    throw new Error(`GET ${url} không chứa nội dung kỳ vọng: "${expectedText}"`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.apiUrl || !args.phone || !args.otp) {
    throw new Error(
      'Thiếu tham số bắt buộc. Ví dụ:\n' +
        'node scripts/release/seed-reviewer-demo.mjs --api-url "https://chiane-api.onrender.com" --phone "09xxxxxxxx" --otp "846291"'
    );
  }
  if (!/^\d{6}$/.test(args.otp.trim())) {
    throw new Error('Mã OTP Reviewer phải gồm đúng 6 chữ số.');
  }

  const origin = validateOrigin(args.apiUrl, args.allowHttp);
  const phone = normalizePhone(args.phone);
  const otp = args.otp.trim();

  console.log(`1/6. Kiểm tra sức khỏe server tại ${origin}/health ...`);
  const health = await requestJson(`${origin}/health`);
  if (health?.status !== 'ok') {
    throw new Error(`/health trả về bất thường: ${JSON.stringify(health)}`);
  }
  console.log('   -> /health OK');

  console.log('2/6. Kiểm tra các route pháp lý & Android App Links ...');
  await checkPublicEndpoint(origin, '/legal/privacy', 'Chính sách quyền riêng tư');
  await checkPublicEndpoint(origin, '/legal/terms', 'Điều khoản sử dụng');
  await checkPublicEndpoint(origin, '/legal/delete-account', 'Hướng dẫn xóa tài khoản');
  await checkPublicEndpoint(origin, '/.well-known/assetlinks.json');
  console.log('   -> /legal/* và /.well-known/assetlinks.json OK (200)');

  console.log(`3/6. Đăng nhập tài khoản Reviewer (${phone.local}) ...`);
  await requestJson(`${origin}/api/v1/auth/otp/request`, {
    method: 'POST',
    body: JSON.stringify({ phone: phone.e164 }),
  });
  const verify = await requestJson(`${origin}/api/v1/auth/otp/verify`, {
    method: 'POST',
    body: JSON.stringify({ phone: phone.e164, code: otp }),
  });
  const authHeader = { Authorization: `Bearer ${verify.accessToken}` };
  console.log('   -> Đăng nhập Reviewer OK');

  console.log('4/6. Cập nhật hồ sơ mẫu & tài khoản VietQR cho Reviewer ...');
  await requestJson(`${origin}/api/v1/auth/me`, {
    method: 'PATCH',
    headers: authHeader,
    body: JSON.stringify({
      displayName: 'An Nguyễn',
      bankBin: '970436',
      bankName: 'Vietcombank',
      bankAccountNumber: '0123456789',
      bankAccountHolder: 'NGUYEN VAN AN',
    }),
  });
  console.log('   -> Hồ sơ & VietQR OK');

  console.log('5/6. Kiểm tra nhóm mẫu cho Reviewer ...');
  const existing = await requestJson(`${origin}/api/v1/groups`, { headers: authHeader });
  const found = (existing?.groups ?? []).find((group) => group.name === DEMO_GROUP_NAME);

  if (found) {
    console.log(`   -> Đã có sẵn nhóm "${DEMO_GROUP_NAME}" (id: ${found.id}), bỏ qua bước tạo trùng.`);
  } else {
    const createdGroup = await requestJson(`${origin}/api/v1/groups`, {
      method: 'POST',
      headers: authHeader,
      body: JSON.stringify({ name: DEMO_GROUP_NAME, category: 'TRAVEL' }),
    });
    const groupId = createdGroup.group.id;
    const myMemberId = createdGroup.group.myMemberId;

    const minh = await requestJson(`${origin}/api/v1/groups/${groupId}/members`, {
      method: 'POST',
      headers: authHeader,
      body: JSON.stringify({ displayName: 'Minh' }),
    });
    const lan = await requestJson(`${origin}/api/v1/groups/${groupId}/members`, {
      method: 'POST',
      headers: authHeader,
      body: JSON.stringify({ displayName: 'Lan' }),
    });
    const splitMembers = [
      { memberId: myMemberId },
      { memberId: minh.member.id },
      { memberId: lan.member.id },
    ];

    console.log('6/6. Tải thử ảnh hóa đơn lên storage (R2/local) & tạo 2 khoản chi mẫu ...');
    const pngBase64 = createSampleReceiptPng().toString('base64');
    const uploaded = await requestJson(`${origin}/api/v1/uploads/receipt`, {
      method: 'POST',
      headers: authHeader,
      body: JSON.stringify({ imageBase64: pngBase64, mimeType: 'image/png' }),
    });
    const receiptFullUrl = new URL(uploaded.receiptImageUrl, origin).href;
    const readBack = await fetch(receiptFullUrl, { signal: AbortSignal.timeout(30_000) });
    if (!readBack.ok) {
      throw new Error(`Không đọc lại được ảnh hóa đơn tại ${receiptFullUrl} (HTTP ${readBack.status})`);
    }
    await readBack.body?.cancel();

    await requestJson(`${origin}/api/v1/groups/${groupId}/expenses`, {
      method: 'POST',
      headers: authHeader,
      body: JSON.stringify({
        title: 'Lẩu gà lá é Tao Ngộ',
        amountVnd: 450000,
        category: 'FOOD',
        splitMethod: 'EQUAL',
        paidByMemberId: myMemberId,
        receiptImageUrl: uploaded.receiptImageUrl,
        splits: splitMembers,
      }),
    });

    await requestJson(`${origin}/api/v1/groups/${groupId}/expenses`, {
      method: 'POST',
      headers: authHeader,
      body: JSON.stringify({
        title: 'Homestay Đà Lạt 2 đêm',
        amountVnd: 1200000,
        category: 'STAY',
        splitMethod: 'EQUAL',
        paidByMemberId: myMemberId,
        splits: splitMembers,
      }),
    });

    console.log(`   -> Đã tạo xong nhóm "${DEMO_GROUP_NAME}" và kiểm tra ảnh hóa đơn (${receiptFullUrl})`);
  }

  console.log('\n============================================================');
  console.log('HOÀN TẤT KIỂM TRA API & KHỞI TẠO DỮ LIỆU REVIEWER!');
  console.log('Dán đoạn tiếng Anh dưới đây vào Google Play Console -> App access -> Add instructions:\n');
  console.log(`Instruction name: ChiaNe review account`);
  console.log(`Phone number: ${phone.local}`);
  console.log(`Verification code: ${otp}`);
  console.log('Open ChiaNe and tap the phone sign-in button. The country code +84 is already selected.');
  console.log(`Enter ${phone.subscriber} and request a code.`);
  console.log('Enter the verification code above. No SIM card or incoming SMS is needed.');
  console.log('Open the demo group to review expenses, balances and receipts. If the challenge');
  console.log('expires, request a new one and enter the same code. No payment is required.');
  console.log('============================================================\n');
}

main().catch((err) => {
  console.error('\nLỖI:', err instanceof Error ? err.message : err);
  process.exit(1);
});
