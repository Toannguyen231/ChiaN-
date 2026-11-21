# Hướng Dẫn Triển Khai ChiaNè Lên Cloud (Production)

Tài liệu này hướng dẫn từng bước để bạn đưa hệ thống **ChiaNè** từ môi trường máy cá nhân lên Cloud (Render + PostgreSQL + SMS/Zalo OTP + Expo Push + Mobile APK/IPA) sử dụng cấu hình đã chuẩn bị sẵn trong repo.

---

## 1. Cấu trúc hạ tầng đã chuẩn bị sẵn trong mã nguồn

| Thành phần | File cấu hình sẵn | Ghi chú |
| --- | --- | --- |
| **PostgreSQL Schema** | [schema.postgres.prisma](../apps/api/prisma/schema.postgres.prisma) | Tự động đồng bộ bảng lên Cloud PostgreSQL (Render, Supabase, Neon, Railway). |
| **Docker Production Build** | [Dockerfile](../apps/api/Dockerfile) | Build `@chiane/shared`, generate Prisma PostgreSQL client, compile `@chiane/api`, chạy `prisma db push` & `node dist/server.js`. |
| **Render Blueprint 1-Click** | [render.yaml](../render.yaml) | Khai báo PostgreSQL Singapore (`chiane-postgres`) + Fastify Web Service (`chiane-api`) kèm Healthcheck `/health`. |
| **SMS / Zalo ZNS OTP** | [otp.service.ts](../apps/api/src/services/otp.service.ts) | Hỗ trợ `OTP_PROVIDER="esms"` (eSMS.vn) và `OTP_PROVIDER="zalo_zns"` (Zalo OA ZNS). |
| **Push Notification (Expo)** | [push.service.ts](../apps/api/src/services/push.service.ts) | Endpoint `POST /api/v1/auth/me/push-token` + gửi thông báo qua `https://exp.host/--/api/v2/push/send`. |

---

## 2. Triển khai API & Database PostgreSQL lên Render (10 phút)

1. Push mã nguồn ChiaNè lên repository GitHub riêng của bạn (`git push`).
2. Đăng nhập [https://dashboard.render.com](https://dashboard.render.com) bằng tài khoản GitHub.
3. Chọn **New -> Blueprint** và trỏ vào repository của bạn. Render sẽ tự đọc file [render.yaml](../render.yaml).
4. Điền các biến bí mật (`sync: false`) trong Render Environment:
   - `GEMINI_API_KEY`: API key lấy tại Google AI Studio để quét hóa đơn AI.
   - Nếu bật SMS OTP qua **eSMS.vn**:
     - `OTP_PROVIDER=esms`
     - `ESMS_API_KEY=...`
     - `ESMS_SECRET_KEY=...`
     - `ESMS_BRANDNAME=...` *(để trống nếu chưa đăng ký Brandname riêng)*
   - Hoặc nếu bật OTP qua **Zalo ZNS**:
     - `OTP_PROVIDER=zalo_zns`
     - `ZALO_ZNS_ACCESS_TOKEN=...`
     - `ZALO_ZNS_TEMPLATE_ID=...`
   - Tuỳ chọn `EXPO_ACCESS_TOKEN`: token từ tài khoản Expo để tăng giới hạn gửi Push Notification.
5. Nhấn **Apply**. Khi hoàn tất, Render cấp URL công khai dạng `https://chiane-api.onrender.com`. Kiểm tra `https://chiane-api.onrender.com/health` trả về `{"status":"ok"}`.

> **Mẹo kiểm thử nhanh khi chưa mua gói SMS:**
> Có thể tạm đặt `OTP_PROVIDER=console`, nhưng lưu ý môi trường `NODE_ENV=production` chặn `OTP_DEV_ECHO=true` vì lý do bảo mật, nên cần dùng `esms` hoặc `zalo_zns` khi mở cho người dùng thật.

---

## 3. Kích hoạt Push Notification (FCM / APNs)

1. Tạo tài khoản tại [https://expo.dev](https://expo.dev) và đăng nhập CLI trong `apps/mobile`:
   ```bash
   npx expo login
   ```
2. Khởi tạo Project ID cho EAS:
   ```bash
   cd apps/mobile
   npx eas init
   ```
3. Với **Android**: tạo project Firebase tại Console -> tải `google-services.json` -> cấu hình FCM V1 service account trong trang Project Settings trên `expo.dev` (mục *Credentials -> Android -> FCM V1*).
4. Với **iOS**: cần tài khoản **Apple Developer Program** (\$99/năm) để `eas credentials` tự động cấp Push Notifications Key (APNs `.p8`).

---

## 4. Build File Cài Đặt Mobile (`.apk` / TestFlight `.ipa`)

1. Trỏ Mobile App về server Cloud bằng biến môi trường lúc build:
   ```bash
   EXPO_PUBLIC_API_URL=https://chiane-api.onrender.com
   ```
2. Cài đặt EAS CLI (nếu chưa có):
   ```bash
   npm install -g eas-cli
   ```
3. Build file **Android APK** gửi thẳng bạn bè cài thử (không cần CH Play):
   ```bash
   cd apps/mobile
   eas build -p android --profile preview
   ```
4. Build bản **Production lên CH Play / App Store (TestFlight)**:
   ```bash
   eas build -p android --profile production
   eas build -p ios --profile production
   eas submit -p ios
   ```
