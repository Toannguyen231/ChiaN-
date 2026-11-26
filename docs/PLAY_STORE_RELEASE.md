# Phát hành ChiaNè trên Google Play

Thực hiện từ trên xuống. Thay `<api-domain>` bằng tên miền thật của **đúng môi trường**. APK preview dùng để cài trực tiếp. AAB production dùng để tải lên Google Play. Google Play nhận diện ứng dụng bằng `com.chiane.app`.

## 1. Chuẩn bị API và nơi lưu hóa đơn

1. Đưa bản mã cần phát hành lên nhánh triển khai của repo. Trong Cloudflare Dashboard, mở **R2 Object Storage → Create bucket**. Ghi lại tên bucket. Trong phần quản lý API tokens của R2, tạo token có quyền đọc và ghi object, giới hạn vào bucket này. Lưu **Access Key ID**, **Secret Access Key** và S3 endpoint của tài khoản.
2. Trong Render Dashboard, chọn **New → Blueprint**, kết nối repo, chọn nhánh và file `render.yaml`. Kiểm tra service Docker `chiane-api`, PostgreSQL `chiane-postgres` và cùng region. Docker context là gốc repo, Dockerfile là `apps/api/Dockerfile`. Blueprint nối `DATABASE_URL` bằng internal connection string và tự sinh `JWT_ACCESS_SECRET`. Giữ secret ổn định giữa các lần triển khai. [Render Blueprints](https://render.com/docs/blueprint-spec)
3. Chọn gói phù hợp trước khi bấm **Deploy Blueprint / Apply**. Repo đặt gói free để thử. Web service free ngủ sau thời gian không có truy cập và đĩa local là tạm thời. PostgreSQL free hết hạn sau 30 ngày. Để reviewer truy cập ổn định và giữ dữ liệu sau đợt test, chọn database lâu dài, sao lưu và web service luôn sẵn sàng. [Giới hạn gói free](https://render.com/docs/free)
4. Mở **chiane-api → Environment**. Điền giá trị theo bảng, lưu và redeploy. Các biến bí mật chỉ thuộc API. Các trường tùy chọn chưa dùng có thể bỏ trống.

| Biến | Cách điền |
| --- | --- |
| `NODE_ENV`, `OTP_DEV_ECHO` | Lần lượt là `production` và `false`. |
| `OTP_PROVIDER` | Chọn `esms` và điền `ESMS_API_KEY`, `ESMS_SECRET_KEY`, `ESMS_BRANDNAME` đã đăng ký. Với Zalo, chọn `zalo_zns` và điền `ZALO_ZNS_ACCESS_TOKEN`, `ZALO_ZNS_TEMPLATE_ID`. Kiểm tra gửi thật cho một số do đội vận hành kiểm soát. |
| `REVIEWER_DEMO_PHONE`, `REVIEWER_DEMO_OTP` | Dùng riêng một số VN do đội phát hành kiểm soát và mã bí mật gồm 6 chữ số. Tránh dùng số của khách hàng. Cần đủ cả hai biến. Khởi tạo nhóm và hóa đơn mẫu bằng chính tài khoản này. |
| `GEMINI_API_KEY` | Dùng khóa của dự án Gemini dành cho production để bật OCR. Nếu bỏ trống, người dùng vẫn nhập tay. |
| `S3_ENDPOINT`, `S3_BUCKET` | Endpoint HTTPS của dịch vụ và tên bucket ở hai trường riêng. Với R2 dùng `https://<account-id>.r2.cloudflarestorage.com`. Với AWS dùng endpoint S3 theo region. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION` | Điền thông tin ký của bucket. Region của R2 là `auto`. Với AWS, điền region thật, mặc định của API là `us-east-1`. [R2 S3 API](https://developers.cloudflare.com/r2/api/s3/api/) |
| `S3_PUBLIC_BASE_URL` | Tùy chọn. Để trống để API đọc ảnh từ bucket riêng bằng GET có chữ ký. Nếu đã cấu hình domain công khai trỏ tới gốc bucket, điền URL HTTPS đó. Object nằm dưới `receipts/<uuid>.<ext>`. Người có URL ảnh có thể đọc ảnh ở cả hai chế độ. |

5. Mở **Events → Logs**. Image production tạo Prisma Client từ schema PostgreSQL và chạy `prisma db push` khi khởi động. Sao lưu dữ liệu trước khi triển khai thay đổi schema. Mở `https://<api-domain>/health` và kiểm tra `status=ok`.
6. Thử đăng nhập bằng số thường và số reviewer. Với reviewer, bấm yêu cầu OTP rồi nhập mã đã cấu hình. Kiểm tra SMS chỉ tới số thường. Tải một ảnh hóa đơn mẫu, kiểm tra object trong bucket, redeploy API rồi mở lại ảnh cũ. Nếu thiếu một trong bốn biến S3 bắt buộc, API dùng ổ đĩa local. Khi đã có ảnh local cần giữ, sao chép chúng lên bucket dưới tiền tố `receipts/` trước khi thay container.
7. Mở hai URL pháp lý bằng trình duyệt ẩn danh. Thử gửi yêu cầu đến `support@chiane.app`, địa chỉ hiện ghi trên trang xóa tài khoản. Xác nhận có người tiếp nhận, thời hạn phản hồi và nội dung chính sách khớp dịch vụ đang vận hành.

## 2. Tạo APK và AAB bằng EAS

1. Sau khi Render cấp URL thật, vào Expo Dashboard → project ChiaNè → Environment variables. Tạo biến Plain text `EXPO_PUBLIC_API_URL` trong **preview** (APK) và **production** (AAB), điền origin HTTPS thật cho mỗi môi trường. Ví dụ định dạng là `https://<tên-service>.onrender.com`; thay bằng địa chỉ của chính bạn. Bản build đọc biến từ EAS. Khi đổi domain phải build lại Android để cập nhật cả URL API lẫn App Links.
2. Tại PowerShell chạy từng dòng sau. `eas init` liên kết hoặc tạo project Expo. Kiểm tra tài khoản sở hữu project và lưu thay đổi project ID vào repo.

```powershell
$env:Path = 'D:\nvm\v22.22.2;' + $env:Path
Set-Location D:\ChiaNe\apps\mobile
node --version
npm install --global eas-cli
eas login
eas init
eas build --platform android --profile preview
```

3. Tải APK từ link **Build details → Install**. Cài trên máy Android và thử bằng 4G với máy dev tắt. Kiểm tra OTP, chọn ảnh có sẵn, hủy bộ chọn rồi mở lại, quét OCR, lưu khoản chi, mở ảnh sau khi khởi động lại và xóa tài khoản thử. [Cài APK từ EAS](https://docs.expo.dev/build-reference/apk/)
4. Chạy `eas build --platform android --profile production`. Với app mới có thể chọn để EAS tạo Android keystore. Với app đã phát hành, chọn đúng upload key đang đăng ký. Lưu bản sao upload key ở nơi bảo mật. Tải **.aab** từ trang build và ghi lại versionCode. Các lần cập nhật phải có versionCode lớn hơn bản đã tải lên Play.

### Kiểm tra QR và ảnh trên Android

- Trên Render, link mời mới mặc định dùng domain `RENDER_EXTERNAL_URL`. Nếu API chạy ở domain riêng, đặt `PUBLIC_APP_ORIGIN` trùng với `EXPO_PUBLIC_API_URL`, trỏ domain vào service này và kiểm tra HTTPS. Nếu vẫn phát link `chiane.app`, domain đó cũng cần phục vụ trang mời và file liên kết.
- Với lần tải AAB đầu tiên, kích hoạt Play App Signing. Trong Play Console → App integrity → App signing, sao chép SHA-256 của **App signing key certificate** vào `ANDROID_APP_SHA256` trên Render rồi redeploy. APK cài trực tiếp dùng fingerprint của keystore ký APK; có thể thêm fingerprint đó, cách nhau bằng dấu phẩy. Không cần build lại nếu chỉ cập nhật fingerprint trên server.
- Mở `https://<api-domain>/.well-known/assetlinks.json`. Phải nhận HTTP 200 với package `com.chiane.app` và đúng fingerprint. Danh sách rỗng nghĩa là máy chủ chưa được cấu hình. Mở URL QR bằng trình duyệt phải thấy nút mở app và mã nhóm để nhập lại sau khi cài.
- Trên thiết bị đã cài từ Play, chạy `adb shell pm verify-app-links --re-verify com.chiane.app`, chờ Android xác minh rồi chạy `adb shell pm get-app-links com.chiane.app`. Domain API phải hiện `verified`. Quét hai lời mời khác nhau khi app tắt và khi đang mở; so tên nhóm trên màn hình trước khi tham gia.
- Thử chọn một ảnh khi chưa cấp quyền đọc thư viện, hủy rồi chọn lại, chụp bằng camera, từ chối quyền camera và lưu khi OCR mất mạng. Kiểm tra lại ảnh trong chi tiết khoản chi sau khi mở lại app.

## 3. Điền Google Play Console

1. Mở **All apps → Create app**. Chọn tiếng Việt, loại **App**, giá **Free** nếu đúng mô hình phát hành, hoàn tất các khai báo tài khoản. Mở **Grow users → Store presence → Main store listing**. Thêm email hỗ trợ đang hoạt động, icon, feature graphic và ảnh chụp thật của bản Android.
2. Sao chép nội dung sau vào ba ô tương ứng.

**Tên ứng dụng**

> ChiaNè – Chia tiền nhóm

**Mô tả ngắn**

> Chia tiền nhóm, quét hóa đơn và theo dõi ai đã trả sau mỗi cuộc vui.

**Mô tả chi tiết**

> Đi du lịch, ăn uống hay ở ghép cùng bạn bè? ChiaNè giúp cả nhóm ghi lại ai đã trả, mỗi người góp bao nhiêu và những khoản nào đã thanh toán.
>
> Tạo nhóm, mời bạn bằng liên kết hoặc mã QR rồi thêm khoản chi. Chia đều, nhập số tiền riêng hoặc chia theo tỷ lệ. Khi có hóa đơn, bạn có thể đính kèm ảnh và dùng AI gợi ý số tiền, món ăn để kiểm tra trước khi lưu.
>
> Xem số dư của từng người, gợi ý chuyển khoản và mã VietQR khi người nhận đã thêm tài khoản ngân hàng. Ghi nhận tiền mặt hoặc xác nhận sau khi nhận tiền. Tất cả thao tác chuyển tiền thực tế được thực hiện trong ứng dụng ngân hàng của bạn.
>
> Thành viên chưa cài app vẫn có thể được ghi phần chi tiêu. Khi vào nhóm, bạn chọn tên có sẵn để tiếp tục dùng lịch sử và số dư của mình.

3. Vào **Policy and programs → App content → Privacy policy**. Dán `https://<api-domain>/legal/privacy`. Trong **Data safety → Data deletion**, dán `https://<api-domain>/legal/delete-account`. Thử cả đường dẫn ngoài app và **Tài khoản → Xóa tài khoản vĩnh viễn** trên tài khoản thử.
4. Trong **App access**, chọn có phần yêu cầu đăng nhập, chọn **Add instructions**. Thay ba giá trị trong ngoặc trước khi dán mẫu tiếng Anh dưới đây. Giữ bí mật này trong Play Console và Render. Khi xoay mã, cập nhật cả hai nơi và thử lại ngay. [Hướng dẫn cung cấp quyền truy cập](https://support.google.com/googleplay/android-developer/answer/15748846)

```text
Instruction name: ChiaNe review account
Phone number: <dedicated Vietnamese review phone>
Verification code: <six-digit reviewer code>
Open ChiaNe and tap the phone sign-in button. The country code +84 is already selected.
Enter <nine subscriber digits without +84 or the leading 0> and request a code.
Enter the verification code above. No SIM card or incoming SMS is needed.
Open the demo group to review expenses, balances and receipts. If the challenge
expires, request a new one and enter the same code. No payment is required.
```

### Data Safety

Trong **App content → Data safety → Start**, chọn có thu thập dữ liệu. Đối chiếu bảng sau với bản build, SDK, log và hợp đồng nhà cung cấp thực tế trước khi ký khai báo. Dữ liệu gửi khỏi thiết bị để xử lý OCR vẫn cần được xem xét trong biểu mẫu. [Google Play Data safety](https://support.google.com/googleplay/android-developer/answer/10787469)

| Dữ liệu cần rà soát | Loại dữ liệu và mục đích để khai |
| --- | --- |
| Điện thoại, tên, ID người dùng | Personal info → Phone number, Name, User IDs. Quản lý tài khoản, xác thực và nhận diện trong nhóm. Số điện thoại cần cho đăng nhập tài khoản, luồng khách có cách tham gia riêng. |
| Số tài khoản và tên chủ tài khoản ngân hàng | Financial info → User payment info. Người dùng tự chọn nhập để tạo VietQR và cho thành viên liên quan xem. |
| Khoản chi, số dư, lịch sử thanh toán, ghi chú và tên nhóm | Xem Purchase history, Other financial info và Other user-generated content theo nội dung thực tế. Mục đích là chức năng chia chi phí. |
| Ảnh hóa đơn và thông tin trích xuất | Photos and videos → Photos. Đính kèm và OCR là tùy chọn. Ảnh có thể đi tới Gemini để phân tích và được giữ tại nhà cung cấp storage nếu lưu. |
| Token push và dữ liệu gửi thông báo | Xem Device or other IDs nếu bản build đăng ký token. Đối chiếu nội dung gửi tới Expo, gồm tên nhóm, số tiền hoặc ID liên quan. |

Trong mục **Sharing**, đối chiếu riêng eSMS/Zalo, Gemini, Render, dịch vụ lưu ảnh và Expo. Chỉ áp dụng ngoại lệ nhà cung cấp dịch vụ khi điều khoản và cách xử lý thực tế đáp ứng định nghĩa của Google. Với **Encryption in transit**, kiểm tra mọi kết nối trong APK/AAB và các SDK dùng TLS. Với **Deletion**, mô tả rõ dữ liệu sổ chung được ẩn danh hóa và thời gian lưu ảnh, log, bản sao lưu theo chính sách vận hành thực tế. Hoàn tất các thẻ còn hiện trên Dashboard, gồm đối tượng mục tiêu, quảng cáo, xếp hạng nội dung và khai báo tính năng tài chính theo chức năng đã phát hành.

## 4. Closed testing và mở production

Áp dụng yêu cầu 12/14 cho **tài khoản nhà phát triển cá nhân tạo sau 13/11/2023**. Tester phải tham gia liên tục ít nhất 14 ngày. Cài bản APK gửi riêng không được tính là opt-in trên Play. [Điều kiện thử nghiệm chính thức](https://support.google.com/googleplay/android-developer/answer/14151465)

- [ ] Mở **Test and release → Testing → Closed testing → Create track / Manage track**. Chọn quốc gia, thêm danh sách email Google hoặc Google Group, lưu thay đổi.
- [ ] Chọn **Create new release**, thiết lập Play App Signing nếu được hỏi, tải AAB, nhập release notes, xem lỗi và gửi bản closed test để xét duyệt.
- [ ] Khi track khả dụng, gửi **opt-in link** cho tester. Từng người đăng nhập đúng tài khoản, chọn tham gia và cài ứng dụng từ Google Play. Theo dõi số người opt-in trong Dashboard.
- [ ] Giữ ít nhất 12 tester opt-in liên tục đủ 14 ngày. Thu phản hồi thật về OTP, mời nhóm, quét hóa đơn và xác nhận thanh toán. Ghi lại thiết bị, phiên bản, lỗi và bản sửa.
- [ ] Khi Dashboard cho phép, chọn **Apply for production access** và mô tả cách tuyển tester, mức sử dụng, phản hồi và các thay đổi. Sau khi Google cấp quyền, mở **Production → Create new release**, chọn bản đã test hoặc AAB mới có versionCode phù hợp, rà lại App access, rồi gửi xét duyệt.
