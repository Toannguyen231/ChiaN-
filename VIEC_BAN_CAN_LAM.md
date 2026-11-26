# Checklist Những Việc Bạn Cần Tự Làm Để Đưa ChiaNè Lên Google Play

Tài liệu này gom gọn **đúng những việc cần thao tác từ phía chủ tài khoản** (đăng nhập, kích hoạt gói \$0, nhập thông tin vận hành, kiểm thử máy Android thật và đủ 12 tester/14 ngày). Toàn bộ mã nguồn, bộ ảnh Play Store và script tự động hóa 1 lệnh đã được chuẩn bị sẵn trong repo.

---

## Những gì đã được chuẩn bị sẵn tự động cho bạn

- **Mã nguồn & Tuân thủ Google Play**: Đã hoàn tất xóa tài khoản (`DELETE /api/v1/auth/me` + nút trong tab Tài khoản), 3 trang pháp lý HTML (`/legal/privacy`, `/legal/terms`, `/legal/delete-account` hỗ trợ cấu hình email `SUPPORT_EMAIL`), cơ chế đăng nhập Reviewer (`REVIEWER_DEMO_PHONE` + `REVIEWER_DEMO_OTP`), lưu ảnh hóa đơn Cloudflare R2 (`S3_*`), Android App Links (`/.well-known/assetlinks.json`), tắt quyền thừa `RECORD_AUDIO` và `READ_EXTERNAL_STORAGE`.
- **Liên kết Expo EAS**: Đã cài `eas-cli`, liên kết project `@baybay6161/chiane` (`projectId: 39de7ce0-7b13-4564-a5ef-75d8cc912eed`) trong [apps/mobile/app.json](apps/mobile/app.json).
- **Bộ ảnh Google Play Store**:
  - App Icon (`512×512`): `docs/play-store-assets/icon-512x512.png`
  - Feature Graphic (`1024×500`): `docs/play-store-assets/feature-graphic-1024x500.png`
- **2 Script chạy 1 lệnh**:
  - `scripts/release/seed-reviewer-demo.mjs` — kiểm tra server + R2 và tạo sẵn nhóm dữ liệu mẫu cho Google Reviewer.
  - `scripts/release/build-eas-android.ps1` — kiểm tra `/health`, nạp `EXPO_PUBLIC_API_URL` lên EAS cho cả `preview` & `production`, rồi xuất luôn file `.apk` và `.aab`.

---

## Bước 1 — Bật Cloudflare R2 & Tạo khóa lưu ảnh hóa đơn (~3 phút)

Cloudflare chặn các ứng dụng bên thứ 3 tự bật gói R2 lần đầu (`HTTP 403 code 10042`), nên bạn chỉ cần tự bấm 1 lần:

- [ ] Mở link tài khoản Cloudflare của bạn: `https://dash.cloudflare.com/91bd3971cecde4ddc0794bff40e37f56/r2/overview`
- [ ] Bấm **Enable R2** (hoặc **Purchase R2 Plan** → chọn gói **Free 10 GB/tháng = \$0**; nếu Cloudflare hỏi thẻ xác minh thì nhập thẻ Visa/Mastercard để kích hoạt gói \$0).
- [ ] *(Cách nhanh)* Sau khi bật R2 xong, bạn có thể gõ `"đã bật R2"` vào khung chat để trợ lý AI tự tạo bucket và trả về khóa. **Hoặc tự tạo trong 30 giây ngay trên web**:
  1. Vào **R2 Object Storage → Create bucket** → đặt tên chính xác là `chiane-receipts` → Location chọn **Asia-Pacific (APAC)** → bấm **Create bucket**.
  2. Quay ra màn hình **R2 Overview** → cột bên phải bấm **Manage R2 API Tokens** → **Create Account API token**:
     - **Token name**: `chiane-api-receipts`
     - **Permissions**: **Object Read & Write**
     - **Specify bucket(s)**: Chọn **Apply to specific buckets only** → tích `chiane-receipts`
     - Bấm **Create Account API Token**.
  3. Lưu lại ngay 2 chuỗi vừa hiện (chỉ hiện 1 lần):
     - **Access Key ID** (dùng cho `S3_ACCESS_KEY_ID`)
     - **Secret Access Key** (dùng cho `S3_SECRET_ACCESS_KEY`)
  4. Ghi chú 2 giá trị cố định đi kèm của tài khoản bạn:
     - `S3_ENDPOINT`: `https://91bd3971cecde4ddc0794bff40e37f56.r2.cloudflarestorage.com`
     - `S3_BUCKET`: `chiane-receipts`
     - `S3_REGION`: `auto`

---

## Bước 2 — Triển khai Backend & PostgreSQL trên Render (~5 phút)

- [ ] Mở `https://dashboard.render.com/blueprints` và đăng nhập bằng GitHub.
- [ ] Bấm **New Blueprint Instance** → chọn repository **`Toannguyen231/ChiaN-`** → nhánh **`main`** (Render sẽ tự đọc file `render.yaml`).
- [ ] Đặt tên Blueprint là `chiane` → bấm **Deploy Blueprint / Apply**.
  - *Lưu ý gói dịch vụ:* `render.yaml` mặc định cấu hình gói `free` để chạy thử nghiệm ban đầu (\$0). Web service `free` sẽ tự ngủ sau 15 phút không có request và PostgreSQL `free` hết hạn sau 30 ngày. Trước khi gửi bản chính thức cho Google Play xét duyệt, bạn nên nâng `chiane-api` + `chiane-postgres` lên gói trả phí thấp nhất để Reviewer test ổn định không bị timeout lúc khởi động.
- [ ] Vào service **`chiane-api` → Environment**, cập nhật các biến sau rồi bấm **Save, rebuild, and deploy**:

| Tên biến | Giá trị bạn điền | Ghi chú |
| --- | --- | --- |
| `SUPPORT_EMAIL` | `ngoctoann06@gmail.com` *(hoặc email hỗ trợ thật của bạn)* | Hiển thị trên `/legal/privacy` & `/legal/delete-account`. Phải trùng email trên Play Console. |
| `REVIEWER_DEMO_PHONE` | `09xxxxxxxx` *(1 SĐT VN riêng bạn kiểm soát)* | Dùng cho Google Reviewer đăng nhập (không gửi SMS thật). |
| `REVIEWER_DEMO_OTP` | `846291` *(mã 6 chữ số bí mật bạn tự đặt)* | Điền cùng mã này vào Play Console ở Bước 5. |
| `OTP_PROVIDER` | `console` *(hoặc giữ `esms` / `zalo_zns` nếu đã có key)* | **Quan trọng:** Nếu chưa đăng ký eSMS/Zalo ZNS doanh nghiệp, hãy đổi thành `console` để test không bị lỗi 500. Khi mở cho người dùng đại trà mới bật `esms` + điền `ESMS_*`. |
| `GEMINI_API_KEY` | Khóa Gemini API của bạn | Lấy trong file `apps/api/.env` ở máy bạn (hoặc tạo mới trên Google AI Studio) để bật quét hóa đơn AI. |
| `S3_ENDPOINT` | `https://91bd3971cecde4ddc0794bff40e37f56.r2.cloudflarestorage.com` | Copy nguyên dòng này. |
| `S3_BUCKET` | `chiane-receipts` | Tên bucket ở Bước 1. |
| `S3_ACCESS_KEY_ID` | *(Dán Access Key ID từ Bước 1)* | |
| `S3_SECRET_ACCESS_KEY` | *(Dán Secret Access Key từ Bước 1)* | |
| `S3_REGION` | `auto` | Bắt buộc là `auto` với Cloudflare R2. |
| `S3_PUBLIC_BASE_URL` | *(Để trống)* | API sẽ đọc/stream ảnh an toàn qua Bucket riêng. |
| `ANDROID_APP_SHA256` | *(Tạm để trống ở bước này)* | Sẽ quay lại dán ở **Bước 6** sau khi tải `.aab` lên Play Console. |

- [ ] Chờ deploy xong (trạng thái **Live** màu xanh) và copy URL gốc dạng **`https://<ten-service>.onrender.com`** (ví dụ `https://chiane-api.onrender.com`).

---

## Bước 3 — Chạy 1 lệnh kiểm tra API + tạo dữ liệu mẫu cho Reviewer (~1 phút)

- [ ] Mở PowerShell tại `D:\ChiaNe`, thay đúng URL Render, SĐT và mã OTP Reviewer bạn vừa cài ở Bước 2 rồi chạy:

```powershell
$env:Path = 'D:\nvm\v22.22.2;' + $env:Path
Set-Location D:\ChiaNe
node scripts/release/seed-reviewer-demo.mjs --api-url "https://<ten-service>.onrender.com" --phone "09xxxxxxxx" --otp "846291"
```

- [ ] Xác nhận script báo **HOÀN TẤT** ở cả 6 mục (`/health`, 3 trang pháp lý, đăng nhập Reviewer, tải/đọc thử ảnh hóa đơn trên R2, tạo nhóm mẫu `"Chuyến đi Đà Lạt (Demo)"` và tạo 2 khoản chi).
- [ ] Copy đoạn văn bản tiếng Anh **App access** mà script vừa in sẵn ra màn hình để dùng cho Bước 5.

---

## Bước 4 — Chạy 1 lệnh build `.apk` & `.aab` và test trên Android thật (~15–20 phút)

- [ ] Mở PowerShell tại `D:\ChiaNe` và chạy:

```powershell
Set-Location D:\ChiaNe
.\scripts\release\build-eas-android.ps1 -ApiUrl "https://<ten-service>.onrender.com" -Profile all
```

- [ ] Trong lúc chạy lần đầu cho profile `production`, nếu EAS hỏi **`Generate a new Android Keystore?`** → nhấn **`Y`** (Yes).
- [ ] Sau khi build `preview` xong:
  - Mở link **Install** do EAS in ra → tải **`.apk`** cài trực tiếp lên điện thoại Android thật của bạn.
  - Tắt Wi-Fi, bật **4G/5G** để thử thực tế: đăng nhập, tạo nhóm, thêm chi tiêu, đính kèm ảnh từ thư viện, bấm **Hủy** rồi chọn lại ảnh, quét hóa đơn AI, mở link mời `/moi/...`, xem VietQR, và tạo 1 tài khoản phụ test nút **Xóa tài khoản vĩnh viễn**.
  - **Chụp lại 4 ảnh màn hình đẹp trên điện thoại Android** (1. Tổng quan các nhóm, 2. Chi tiết nhóm & công nợ, 3. Thêm khoản chi / Quét hóa đơn AI, 4. Đề xuất chuyển khoản & mã VietQR) để upload lên Play Console ở Bước 5.
- [ ] Sau khi build `production` xong:
  - Tải file **`.aab`** về máy tính để nộp ở Bước 6.

---

## Bước 5 — Điền Google Play Console chuẩn chính sách (~15 phút)

Mở `https://play.google.com/console` → bấm **Create app**:
- **App name**: `ChiaNè – Chia tiền nhóm`
- **Default language**: `Vietnamese (vi-VN)` · **App or game**: `App` · **Free or paid**: `Free`

### 5.1. Main store listing (*Grow users → Store presence → Main store listing*)

- [ ] **App name**: `ChiaNè – Chia tiền nhóm`
- [ ] **Short description** (copy nguyên văn):
  > Chia tiền nhóm, quét hóa đơn và theo dõi ai đã trả sau mỗi cuộc vui.
- [ ] **Full description** (copy nguyên văn):
  > Đi du lịch, ăn uống hay ở ghép cùng bạn bè? ChiaNè giúp cả nhóm ghi lại ai đã trả, mỗi người góp bao nhiêu và những khoản nào đã thanh toán.
  >
  > Tạo nhóm, mời bạn bằng liên kết hoặc mã QR rồi thêm khoản chi. Chia đều, nhập số tiền riêng hoặc chia theo tỷ lệ. Khi có hóa đơn, bạn có thể đính kèm ảnh và dùng AI gợi ý số tiền, món ăn để kiểm tra trước khi lưu.
  >
  > Xem số dư của từng người, gợi ý chuyển khoản và mã VietQR khi người nhận đã thêm tài khoản ngân hàng. Ghi nhận tiền mặt hoặc xác nhận sau khi nhận tiền. Tất cả thao tác chuyển tiền thực tế được thực hiện trong ứng dụng ngân hàng của bạn.
  >
  > Thành viên chưa cài app vẫn có thể được ghi phần chi tiêu. Khi vào nhóm, bạn chọn tên có sẵn để tiếp tục dùng lịch sử và số dư của mình.
- [ ] **App icon**: Tải lên `D:\ChiaNe\docs\play-store-assets\icon-512x512.png`
- [ ] **Feature graphic**: Tải lên `D:\ChiaNe\docs\play-store-assets\feature-graphic-1024x500.png`
- [ ] **Phone screenshots**: Tải lên 2–4 ảnh màn hình Android thật bạn vừa chụp ở Bước 4.
- [ ] **Store listing contact details → Email address**: Điền **đúng email `SUPPORT_EMAIL`** bạn đã đặt ở Bước 2 (ví dụ `ngoctoann06@gmail.com`).

### 5.2. Hoàn tất tất cả thẻ trong *Policy and programs → App content*

- [ ] **Privacy policy**: Dán `https://<ten-service>.onrender.com/legal/privacy`
- [ ] **App access**: Chọn **All or some functionality is restricted** → **Add instructions** → dán đúng đoạn hướng dẫn tiếng Anh đã được `seed-reviewer-demo.mjs` in ra ở Bước 3.
- [ ] **Ads**: Chọn **No, my app does not contain ads**.
- [ ] **Content ratings**: Bấm **Start questionnaire** → nhập email của bạn → chọn nhóm **Utility, Productivity, Communication, or Other** → chọn **No** cho toàn bộ câu hỏi nhạy cảm / cờ bạc / trao đổi tiền mặt thật.
- [ ] **Target audience and content**: Chỉ tích **`18 and over`** · câu hỏi *Could your store listing unintentionally appeal to children?* → chọn **`No`**.
- [ ] **Advertising ID**: Chọn **`No`** (ứng dụng không dùng AD_ID để quảng cáo).
- [ ] **Financial features**: Tích **`My app doesn't provide any financial features`** *(bắt buộc chọn mục này vì ChiaNè chỉ ghi sổ và tạo mã QR chuyển khoản P2P, không giữ tiền hay làm trung gian thanh toán)*.
- [ ] **News apps / Government apps / Health apps**: Chọn **`No`** ở tất cả các mục này.
- [ ] **Data safety**:
  1. *Does your app collect or share any of the required user data types?* → **Yes**
  2. *Is all of the user data collected by your app encrypted in transit?* → **Yes**
  3. *Do you provide a way for users to request that their data is deleted?* → **Yes** → Dán `https://<ten-service>.onrender.com/legal/delete-account`
  4. **Data types** (mở rộng từng nhóm và tích đúng):
     - **Personal info**: Tích **Name**, **Phone number**, **User IDs** *(Collected = Yes, Not shared for ads, Required = Yes/Optional tùy dòng — SĐT bắt buộc cho tài khoản chính, luồng khách không cần, Purpose: App functionality + Account management)*.
     - **Financial info**: Tích **User payment info** *(Số tài khoản ngân hàng & tên chủ TK — Users can choose whether this data is collected, Purpose: App functionality)* và **Other financial info** *(Khoản chi tiêu, số dư nhóm — Collected, Purpose: App functionality)*.
     - **Photos and videos**: Tích **Photos** *(Ảnh hóa đơn — Users can choose whether this data is collected, Purpose: App functionality; note xử lý tạm qua Gemini API nếu người dùng tự bấm quét AI)*.
     - **Device or other IDs**: Tích **Device or other IDs** *(nếu bật Push Token thông báo — Optional, Purpose: App functionality)*.

---

## Bước 6 — Tải `.aab`, cấu hình App Links (`ANDROID_APP_SHA256`) và chạy Closed Testing

- [ ] Mở **Test and release → Testing → Closed testing → Create track** (hoặc **Production → Create new release** nếu tài khoản Play Console của bạn là tài khoản Tổ chức / Cá nhân tạo trước `13/11/2023`).
- [ ] Chọn quốc gia phát hành (**Vietnam** hoặc toàn cầu), bấm **Create new release** → đồng ý **Use Google-generated key (Play App Signing)** nếu được hỏi → tải file **`.aab`** từ Bước 4 lên → nhập Release notes (ví dụ: `Phiên bản đầu tiên của ChiaNè – chia tiền nhóm và đối soát VietQR.`) → bấm **Save / Review release → Start rollout**.
- [ ] **Gắn `ANDROID_APP_SHA256` để bấm link QR `/moi/...` mở thẳng app Android**:
  1. Trong Play Console, vào **Test and release → Setup → App integrity → App signing**.
  2. Copy chuỗi **SHA-256 certificate fingerprint** ở mục **App signing key certificate**.
  3. Quay lại Render (`chiane-api → Environment`), thêm biến `ANDROID_APP_SHA256` = chuỗi SHA-256 vừa copy → lưu & redeploy.
  4. Mở trình duyệt kiểm tra `https://<ten-service>.onrender.com/.well-known/assetlinks.json` đã trả về đúng `"package_name": "com.chiane.app"` và mã SHA-256 của bạn.
- [ ] **Nếu tài khoản Play Console là tài khoản Cá nhân tạo sau 13/11/2023 (luật 12 tester / 14 ngày của Google)**:
  1. Trong **Closed testing → Testers**, nhập danh sách ít nhất **15–20 địa chỉ Gmail** bạn bè/người thân (dư ra để phòng người quên bấm) và bấm **Save changes**.
  2. Khi bản Closed test được Google duyệt (**Available on Google Play**), copy **Join on Android / Opt-in link** gửi cho bạn bè.
  3. Nhờ tối thiểu **12 người** bấm **Become a tester → Tải app từ Google Play** và giữ cài đặt liên tục **đủ 14 ngày** (nhắc mọi người mở app dùng thử vài lần để Google ghi nhận tương tác thật).
  4. Đủ 14 ngày → nút **Apply for production access** trên Dashboard sẽ mở khóa → điền form ngắn mô tả cách test và gửi duyệt lên **Production**!
