import type { FastifyInstance } from 'fastify';

function renderLegalPage(options: {
  title: string;
  eyebrow: string;
  updatedAt: string;
  bodyHtml: string;
}): string {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${options.title} — ChiaNè</title>
  <style>
    :root {
      --forest: #173E32;
      --lime: #D0F477;
      --ink: #20392F;
      --muted: #66766D;
      --paper: #F7F8F2;
      --white: #FFFFFF;
      --line: #E3E8DE;
      --lavender: #EAE5FC;
      --purple: #6E55A5;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--paper);
      color: var(--ink);
      line-height: 1.65;
      -webkit-font-smoothing: antialiased;
    }
    .header {
      background-color: var(--forest);
      color: var(--white);
      padding: 28px 20px 32px;
    }
    .container {
      max-width: 720px;
      margin: 0 auto;
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(208, 244, 119, 0.16);
      color: var(--lime);
      padding: 5px 12px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.3px;
      margin-bottom: 12px;
    }
    h1 {
      margin: 0 0 6px;
      font-size: 26px;
      line-height: 1.25;
      color: var(--white);
    }
    .meta {
      margin: 0;
      font-size: 13px;
      color: rgba(255, 255, 255, 0.78);
    }
    .main {
      padding: 20px 16px 48px;
    }
    .card {
      background: var(--white);
      border: 1px solid var(--line);
      border-radius: 20px;
      padding: 24px 20px;
      box-shadow: 0 2px 10px rgba(23, 62, 50, 0.04);
    }
    h2 {
      margin: 22px 0 8px;
      font-size: 17px;
      color: var(--forest);
    }
    h2:first-child { margin-top: 0; }
    p { margin: 0 0 12px; font-size: 15px; }
    ul { margin: 0 0 14px; padding-left: 20px; font-size: 15px; }
    li { margin-bottom: 6px; }
    .callout {
      background: var(--lavender);
      color: var(--purple);
      border-radius: 14px;
      padding: 14px 16px;
      margin: 16px 0;
      font-size: 14px;
      font-weight: 500;
    }
    .nav {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid var(--line);
    }
    .nav a {
      display: inline-block;
      padding: 8px 14px;
      border-radius: 999px;
      background: var(--paper);
      border: 1px solid var(--line);
      color: var(--forest);
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
    }
    .nav a:hover {
      background: var(--lime);
    }
    .footer {
      text-align: center;
      margin-top: 22px;
      color: var(--muted);
      font-size: 12px;
    }
  </style>
</head>
<body>
  <header class="header">
    <div class="container">
      <div class="brand">ChiaNè · ${options.eyebrow}</div>
      <h1>${options.title}</h1>
      <p class="meta">Cập nhật lần cuối: ${options.updatedAt}</p>
    </div>
  </header>
  <main class="main">
    <div class="container">
      <div class="card">
        ${options.bodyHtml}
        <nav class="nav" aria-label="Liên kết pháp lý ChiaNè">
          <a href="/legal/privacy">Chính sách quyền riêng tư</a>
          <a href="/legal/terms">Điều khoản sử dụng</a>
          <a href="/legal/delete-account">Hướng dẫn xóa tài khoản</a>
        </nav>
      </div>
      <p class="footer">ChiaNè — Nói như bạn bè. Không phán xét.</p>
    </div>
  </main>
</body>
</html>`;
}

export async function registerLegalRoutes(app: FastifyInstance): Promise<void> {
  app.get('/legal/privacy', async (_request, reply) => {
    const html = renderLegalPage({
      title: 'Chính sách quyền riêng tư',
      eyebrow: 'Bảo mật & Dữ liệu',
      updatedAt: '26/11/2026',
      bodyHtml: `
        <h2>1. Dữ liệu chúng tôi thu thập</h2>
        <p>Để giúp bạn và hội bạn chia tiền nhóm sòng phẳng, ChiaNè chỉ thu thập đúng những thông tin tối thiểu cần thiết:</p>
        <ul>
          <li><strong>Số điện thoại:</strong> Dùng để xác thực đăng nhập bằng mã OTP và giúp bạn không bị mất nhóm khi đổi máy.</li>
          <li><strong>Tên hiển thị:</strong> Tên bạn tự chọn để bạn bè nhận ra bạn trong nhóm chi tiêu.</li>
          <li><strong>Thông tin tài khoản ngân hàng (tùy chọn):</strong> Mã ngân hàng (BIN), số tài khoản và tên chủ tài khoản do bạn chủ động nhập để tạo mã VietQR cho bạn bè quét trả tiền.</li>
          <li><strong>Dữ liệu chi tiêu & ảnh hóa đơn:</strong> Các khoản chi, chia phần và ảnh hóa đơn do bạn tự chụp/tải lên trong nhóm.</li>
        </ul>

        <h2>2. Cách chúng tôi bảo vệ dữ liệu</h2>
        <ul>
          <li>Toàn bộ kết nối giữa ứng dụng và máy chủ đều được mã hóa qua HTTPS.</li>
          <li>Mã xác thực OTP và token đăng nhập được băm bảo mật một chiều trên máy chủ.</li>
          <li>Ứng dụng sử dụng bộ chọn ảnh hệ thống, <strong>không</strong> tự ý quét thư viện ảnh hay thu thập danh bạ của bạn.</li>
        </ul>

        <div class="callout">
          Cam kết minh bạch: ChiaNè KHÔNG bán dữ liệu người dùng, KHÔNG dùng số điện thoại cho quảng cáo và KHÔNG giữ tiền của người dùng.
        </div>

        <h2>3. Quyền của bạn</h2>
        <p>Bạn có toàn quyền chỉnh sửa tên hiển thị, xóa thông tin ngân hàng bất kỳ lúc nào trong tab <strong>Tài khoản</strong>, hoặc yêu cầu xóa vĩnh viễn tài khoản theo hướng dẫn tại trang <a href="/legal/delete-account">Xóa tài khoản</a>.</p>
      `,
    });

    return reply.status(200).header('Content-Type', 'text/html; charset=utf-8').send(html);
  });

  app.get('/legal/terms', async (_request, reply) => {
    const html = renderLegalPage({
      title: 'Điều khoản sử dụng',
      eyebrow: 'Thỏa thuận người dùng',
      updatedAt: '26/11/2026',
      bodyHtml: `
        <h2>1. Bản chất dịch vụ ChiaNè</h2>
        <p><strong>ChiaNè</strong> là công cụ ghi chép chi tiêu nhóm, tối ưu số lần chuyển khoản và tạo mã VietQR chuẩn NAPAS 24/7 giúp bạn bè tự đối soát với nhau.</p>

        <div class="callout">
          Quan trọng: ChiaNè KHÔNG phải là ví điện tử, ngân hàng hay tổ chức trung gian thanh toán. Mọi giao dịch chuyển tiền thực tế diễn ra trực tiếp giữa ứng dụng ngân hàng của người gửi và người nhận.
        </div>

        <h2>2. Trách nhiệm khi sử dụng</h2>
        <ul>
          <li><strong>Kiểm tra thông tin trước khi chuyển:</strong> Người chuyển tiền có trách nhiệm kiểm tra đúng tên chủ tài khoản, ngân hàng và số tiền hiển thị trên ứng dụng ngân hàng trước khi xác nhận giao dịch.</li>
          <li><strong>Xác nhận thanh toán trung thực:</strong> Chỉ bấm xác nhận đã nhận tiền khi tiền thực tế đã vào tài khoản ngân hàng hoặc bạn đã nhận đủ tiền mặt.</li>
          <li><strong>Tính năng Quét hóa đơn AI:</strong> Kết quả nhận diện từ ảnh hóa đơn chỉ mang tính gợi ý nhanh; bạn cần kiểm tra lại tổng tiền và từng món trước khi lưu khoản chi.</li>
        </ul>

        <h2>3. Quyền sở hữu & Chấm dứt sử dụng</h2>
        <p>Bạn có thể ngừng sử dụng và xóa tài khoản bất cứ lúc nào ngay trong ứng dụng sau khi đã tất toán số dư các nhóm đang tham gia.</p>
      `,
    });

    return reply.status(200).header('Content-Type', 'text/html; charset=utf-8').send(html);
  });

  app.get('/legal/delete-account', async (_request, reply) => {
    const html = renderLegalPage({
      title: 'Hướng dẫn xóa tài khoản',
      eyebrow: 'Quyền xóa dữ liệu',
      updatedAt: '26/11/2026',
      bodyHtml: `
        <h2>1. Cách xóa tài khoản trực tiếp trong ứng dụng</h2>
        <ul>
          <li>Mở ứng dụng <strong>ChiaNè</strong> và chuyển sang tab <strong>Tài khoản</strong>.</li>
          <li>Cuộn xuống cuối màn hình và chọn <strong>Xóa tài khoản vĩnh viễn</strong>.</li>
          <li>Đọc kỹ thông báo và bấm <strong>Xóa vĩnh viễn</strong> để xác nhận.</li>
        </ul>

        <div class="callout">
          Điều kiện trước khi xóa: Bạn cần tất toán hết số dư khác 0 ₫ (hoặc lưu trữ các nhóm đang hoạt động) để không làm ảnh hưởng công nợ của bạn bè trong nhóm.
        </div>

        <h2>2. Dữ liệu nào bị xóa và dữ liệu nào được giữ lại?</h2>
        <ul>
          <li><strong>Xóa vĩnh viễn ngay lập tức:</strong> Hồ sơ tài khoản, số điện thoại, tên hiển thị, thông tin ngân hàng nhận VietQR, mã OTP, push token và toàn bộ phiên đăng nhập.</li>
          <li><strong>Ẩn danh hóa trong sổ chung:</strong> Các khoản chi tiêu cũ trong nhóm vẫn được giữ nguyên số tiền để sổ của các thành viên còn lại không bị lệch, nhưng tên thành viên của bạn sẽ được đổi thành <em>"Tài khoản đã xóa"</em> và gỡ hoàn toàn liên kết với tài khoản cá nhân.</li>
        </ul>

        <h2>3. Nếu bạn đã gỡ ứng dụng</h2>
        <p>Bạn có thể cài lại ChiaNè, đăng nhập bằng số điện thoại cũ để thực hiện thao tác xóa ngay lập tức, hoặc gửi email yêu cầu hỗ trợ xóa thủ công kèm số điện thoại đăng ký về địa chỉ: <strong>support@chiane.app</strong> (xử lý trong vòng 7 ngày làm việc).</p>
      `,
    });

    return reply.status(200).header('Content-Type', 'text/html; charset=utf-8').send(html);
  });
}
