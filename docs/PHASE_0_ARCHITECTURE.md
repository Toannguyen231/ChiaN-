# ChiaNè — Phase 0: Analysis & Architecture Report

## 1. Repository Assessment
- **Workspace**: `d:\ChiaNe` was completely empty (0 existing files, no git repository initialized prior to Phase 0 setup).
- **Existing Codebase**: None (greenfield repository).
- **Available Host Toolchain**:
  - `node`: `v24.18.0` (`D:\nodejs\node.exe`)
  - `npm`: `11.16.0` (`D:\nodejs\npm.ps1`)
  - `git`: `C:\Program Files\Git\cmd\git.exe` (global `~/.gitconfig` is restricted inside the terminal sandbox)
  - `ANDROID_HOME`: `C:\Users\Nguyen Ngoc Toan\AppData\Local\Android\Sdk` (Android SDK directory not readable inside default sandbox; `adb`, `java`, `javac`, `gradle` are not currently on `PATH`)
  - `flutter`, `dart`, `pnpm`, `python`, `expo`, `supabase`: not installed / not on `PATH`
  - `docker`: CLI installed, daemon unavailable / requires elevation

---

## 2. Figma Inspection Report
**Source**: `fileKey = OQxHH53RVw3YZAsM6gWkYr` (`Page 1`, node `0:1`)

### 2.1 Inspected Nodes & Artifacts
- **Page Structure & Full Canvas Screenshot**: `0:1` (`Page 1`, 2610 × 5852)
- **Brand Identity Frame (`2:121`)**: *"Chia tiền gọn, tình bạn vui."*, *"Bớt tính toán. Thêm thân nhau."*, Friendship mark (`2:3`), Brand palette.
- **Design System Frame (`2:133`) & Figma Variables**:
  - **Tokens**:
    - `Color/forest`: `#173E32`
    - `Color/lime`: `#D0F477`
    - `Color/ink`: `#20392F`
    - `Color/muted`: `#66766D`
    - `Color/paper`: `#F7F8F2`
    - `Color/white`: `#FFFFFF`
    - `Color/line`: `#E3E8DE`
    - `Color/lavender`: `#EAE5FC`
    - `Color/purple`: `#6E55A5`
    - `Color/coral`: `#AD4C38`
    - `Color/peach`: `#FCE8DD`
    - Dark-surface text tints observed directly in `get_design_context`: `#DCE7D8` (`onForestMuted`, Screen 01), `#CEDFCB` (`onForestLabel`, Screen 04).
  - **Typography**: `Be Vietnam Pro` (`Regular 400`, `Medium 500`, `SemiBold 600`, `Bold 700`, `ExtraBold 800`), line-height ratio `1.45`, letter-spacing `0`.
  - **Spacing & Radii**: 8pt spacing rhythm, `24px` screen horizontal padding, `14px–24px` corner radii (`14px` OTP box/icon badge, `16px` input/settlement row, `18px` button/chip/expense row, `20px–22px` cards, `24px` hero balance card), `56px` primary button height, `60px` input height, `>= 48px` touch targets.
  - **Voice**: *"Nói như bạn bè. Không phán xét."* (`"Nhắc nhẹ một chút"` instead of `"Đòi nợ"`, `"Bạn cần trả"` instead of `"Nợ xấu"`).
  - **Reusable Components**: `ChiaNè / Button` (`2:178`: Primary, Secondary, Quiet, Disabled), `ChiaNè / Input` (`2:301`), `ChiaNè / Chip` (`2:303`), `ChiaNè / Expense row` (`2:1432`: Food, Stay, Transport, Coffee), Standard interface icons (`2:276`), Friendship mark (`2:592`), 4-tab Bottom Navigation (`Trang chủ`, `Nhóm`, `Hoạt động`, `Cá nhân`).

### 2.2 CRITICAL Color Palette Discrepancy (Figma vs Prompt Section 4)
Prompt Section 4 listed different hex values (`#1B6B4A`, `#4CAF7D`, `#F6B938`, `#F8FAF7`, `#17251F`, `#728078`, `#D9534F`).
All 24 Figma screens and Figma Variables actually use the approved Design System palette (`#173E32` forest, `#D0F477` lime, `#20392F` ink, `#66766D` muted, `#F7F8F2` paper, `#FFFFFF` white, `#E3E8DE` line, `#EAE5FC` lavender, `#6E55A5` purple, `#AD4C38` coral, `#FCE8DD` peach).
**Resolution**: Per the design directive (*"The original Figma design is the primary visual reference"*), the implementation uses the actual approved Figma Design System tokens as the single source of truth.

### 2.3 All 24 Figma Screens Mapped to Modules
| Module | # | Figma Frame Name (XML) | Node ID | True Rendered Title |
| :--- | :-: | :--- | :--- | :--- |
| 01 · Auth & Onboarding | 01 | `01 · Chào ChiaNè` | `2:186` | `ChiaNè` |
| 01 · Auth & Onboarding | 02 | `02 · Đăng nhập` | `2:191` | `Đăng nhập` |
| 01 · Auth & Onboarding | 03 | `03 · Xác thực số điện thoại` | `2:196` | `Xác thực` |
| 02 · Dashboard & Groups | 04 | `04 · Tổng quan` | `2:201` | `Chào An,` |
| 02 · Dashboard & Groups | 05 | `05 · Nhóm của bạn` | `2:206` | `Nhóm của bạn` |
| 02 · Dashboard & Groups | 06 | `06 · Tạo nhóm` | `2:211` | `Tạo nhóm mới` |
| 02 · Dashboard & Groups | 07 | `07 · Mời bạn bè` | `2:216` | `Mời hội bạn vào` |
| 02 · Dashboard & Groups | 08 | `08 · Chi tiết nhóm` | `2:221` | `Đà Lạt cuối tuần` |
| 03 · Expense Management | 09 | `09 · Thêm khoản chi` | `2:226` | `Thêm khoản chi` |
| 03 · Expense Management | 10 | `10 · Cách chia` | `2:231` | `Chia khoản này` |
| 03 · Expense Management | 11 | `11 · Chi tiết khoản chi` | `2:236` | `Chi tiết khoản chi` |
| 03 · Expense Management | 20 | `20 · Chia theo số tiền` | `2:1122` | `Chia khoản này` |
| 04 · Debt & Payment | 12 | `12 · Số dư nhóm` | `2:241` | `Số dư nhóm` |
| 04 · Debt & Payment | 13 | `13 · Thanh toán` | `2:246` | `Thanh toán` |
| 04 · Debt & Payment | 14 | `14 · QR chuyển khoản` | `2:251` | `Chuyển khoản QR` |
| 04 · Debt & Payment | 15 | `15 · Chờ xác nhận thanh toán` | `2:256` | `Đã báo cho Linh` |
| 04 · Debt & Payment | 22 | `22 · Xác nhận đã nhận tiền` | `2:1259` | `Xác nhận đã nhận tiền` |
| 05 · Notifications & Activity | 16 | `16 · Hoạt động` | `2:261` | `Hoạt động` |
| 05 · Notifications & Activity | 21 | `21 · Nhắc nhẹ bạn bè` | `2:1206` | `Nhắc nhẹ bạn bè` |
| 05 · Notifications & Activity | 23 | `23 · Đã thanh toán` | `2:1320` | `Đã thanh toán` |
| 06 · Profile, Guest & Offline | 17 | `17 · Tài khoản` | `2:266` | `Tài khoản` |
| 06 · Profile, Guest & Offline | 18 | `18 · Nhóm mới` | `2:271` | `Nhà mình` |
| 06 · Profile, Guest & Offline | 19 | `19 · Tham gia không cần tài khoản` | `2:1077` | `Bạn được mời nè` |
| 06 · Profile, Guest & Offline | 24 | `24 · Đã lưu trên máy` | `2:1361` | `Đã lưu trên máy` |

### 2.4 Design Quirks & Embedded Business Rules
- **XML vs Rendered Titles**: Screens `19`, `21`, `22`, `23`, `24` show leftover template text in the Figma header node names (`Đăng nhập`, `Thanh toán`, `Xong rồi nè!`), while the rendered canvas screenshot shows the true headers (`Bạn được mời nè`, `Nhắc nhẹ bạn bè`, `Xác nhận đã nhận tiền`, `Đã thanh toán`, `Đã lưu trên máy`). Always call `get_design_context` + inspect screenshot per screen during Modules 02–06.
- **Built-in Rules Visible in Figma Copy**:
  - **Exact rounding**: *"Chia lẻ đến từng đồng. Tổng các phần luôn khớp khoản chi."* (Screen 10)
  - **Mismatch save block**: *"Không thể lưu khi số tiền chưa khớp."* (Screen 20)
  - **Manual payment confirmation**: *"Chỉ ghi nhận sau khi người nhận xác nhận."* / *"Số dư chỉ cập nhật khi Linh xác nhận. Không cần chuyển tiền lần nữa."* (Screens 12, 15, 22)
  - **Bank safety & QR honesty**: *"QR MINH HỌA · KHÔNG CHUYỂN TIỀN"* (Screen 14 — real QR rendered only when real bank BIN + account number exist).
  - **Reminder rate limit**: *"Tối đa 1 lời nhắc / người / 24 giờ."* (Screen 21)
  - **Offline queue**: *"Chưa hiển thị với thành viên khác. Bạn không cần gửi lại khoản chi này."* (Screen 24)

---

## 3. Existing Technology Stack
None present in `d:\ChiaNe` prior to Phase 0. Host environment has Node `v24.18.0` and npm `11.16.0` ready.

---

## 4. Recommended Architecture
An **npm workspaces TypeScript monorepo** ensuring strict type safety, zero duplicated business logic, and straightforward Android builds:

```
d:\ChiaNe\
├── packages/shared/   # @chiane/shared: VND money, splits, debt optimizer, VietQR, Zod schemas, DTO types
├── apps/api/          # @chiane/api: Fastify v5 + Prisma 6 + JWT + RBAC + OTP + Vitest integration tests
├── apps/mobile/       # @chiane/mobile: Expo SDK 53 + React Native + React Navigation v7 + Zustand + Figma SVGs
└── docs/              # Architecture report & development checklist
```

- **Why React Native + Expo SDK 53**: Runs natively on Android (`edgeToEdgeEnabled`, `softwareKeyboardLayoutMode: "resize"`, hardware back button, `SecureStore`, share sheet, offline storage), shares `@chiane/shared` validation and financial math directly with the backend, and compiles cleanly without requiring local Flutter/Java toolchains up front.
- **Why Fastify v5 + Prisma 6**: High-performance typed REST API, SQLite (`file:./dev.db`) for zero-friction local dev & CI testing with string-typed enums + Zod so production PostgreSQL deployment only requires updating `provider = "postgresql"` and `DATABASE_URL`.
- **Security & RBAC**: JWT access tokens (short-lived) + rotating SHA-256 hashed refresh tokens with replay detection; OTP challenges hashed with per-challenge salt + CSPRNG; backend `requireGroupRole` middleware enforces group authorization and guest restrictions on every route.

---

## 5. Database Schema Proposal (10 Models)
1. `User`: `id`, `phone` (unique E.164 `+84...`), `displayName`, `avatarUrl`, `bankBin`, `bankName`, `bankAccountNumber`, `bankAccountHolder`, `notifyReminders`, `notifyExpenses`, `createdAt`, `updatedAt`.
2. `OtpChallenge`: `id`, `phone`, `codeHash`, `salt`, `expiresAt`, `attempts`, `maxAttempts`, `consumedAt`, `createdAt`.
3. `RefreshToken`: `id`, `userId` (FK -> `User`), `tokenHash` (unique), `expiresAt`, `revokedAt`, `replacedById`, `createdAt`.
4. `Group`: `id`, `name`, `category` (`TRAVEL | FOOD | HOUSEHOLD | OTHER`), `currency` (`VND`), `inviteCode` (unique), `isArchived`, `createdByUserId` (FK -> `User`), `createdAt`, `updatedAt`.
5. `GroupMember`: `id`, `groupId` (FK -> `Group`), `userId` (nullable FK -> `User`), `guestTokenHash` (nullable unique), `displayName`, `role` (`ADMIN | MEMBER | GUEST`), `status` (`ACTIVE | LEFT | REMOVED`), `joinedAt`.
6. `Expense`: `id`, `groupId` (FK), `title`, `amountVnd` (Int > 0), `category` (`FOOD | STAY | TRANSPORT | COFFEE | OTHER`), `splitMethod` (`EQUAL | EXACT | PERCENTAGE`), `paidByMemberId` (FK -> `GroupMember`), `createdByMemberId` (FK -> `GroupMember`), `expenseDate`, `note`, `receiptImageUrl`, `clientMutationId` (unique), `deletedAt`, `createdAt`, `updatedAt`.
7. `ExpenseSplit`: `id`, `expenseId` (FK -> `Expense`), `memberId` (FK -> `GroupMember`), `amountVnd` (Int >= 0), `percentageBps` (nullable Int).
8. `Settlement`: `id`, `groupId` (FK), `fromMemberId` (FK), `toMemberId` (FK), `amountVnd` (Int > 0), `method` (`BANK_TRANSFER | CASH`), `status` (`PENDING | REPORTED | CONFIRMED | REJECTED`), `memo`, `bankAccountSnapshot`, `idempotencyKey` (unique), `reportedAt`, `confirmedAt`, `rejectedAt`, `rejectReason`, `createdAt`.
9. `PaymentReminder`: `id`, `groupId` (FK), `senderMemberId` (FK), `recipientMemberId` (FK), `settlementId` (nullable FK), `amountVnd`, `message`, `sentAt`.
10. `ActivityLog`: `id`, `groupId` (FK), `actorMemberId` (nullable FK), `type`, `title`, `subtitle`, `metadataJson`, `createdAt`.

---

## 6. REST API Structure Proposal
- **Health**: `GET /health`
- **Module 01 (Auth)**:
  - `POST /api/v1/auth/otp/request`
  - `POST /api/v1/auth/otp/verify`
  - `POST /api/v1/auth/refresh`
  - `POST /api/v1/auth/logout`
  - `GET /api/v1/auth/me`
  - `PATCH /api/v1/auth/me`
- **Module 02 (Dashboard & Groups)**:
  - `GET /api/v1/dashboard`
  - `GET /api/v1/groups`, `POST /api/v1/groups`
  - `GET /api/v1/groups/:groupId`, `PATCH /api/v1/groups/:groupId`, `POST /api/v1/groups/:groupId/archive`, `POST /api/v1/groups/:groupId/leave`
  - `POST /api/v1/groups/:groupId/invite-link/regenerate`
  - `POST /api/v1/groups/:groupId/members`, `DELETE /api/v1/groups/:groupId/members/:memberId`, `GET /api/v1/groups/:groupId/members/:memberId`
- **Module 03 (Expenses)**:
  - `GET /api/v1/groups/:groupId/expenses`, `POST /api/v1/groups/:groupId/expenses`
  - `GET /api/v1/expenses/:expenseId`, `PATCH /api/v1/expenses/:expenseId`, `DELETE /api/v1/expenses/:expenseId`
- **Module 04 (Debt & Payment)**:
  - `GET /api/v1/groups/:groupId/balances`
  - `GET /api/v1/groups/:groupId/settlements`
  - `POST /api/v1/groups/:groupId/settlements/report`
  - `POST /api/v1/settlements/:settlementId/confirm`
  - `POST /api/v1/settlements/:settlementId/reject`
- **Module 05 (Activity & Reminders)**:
  - `GET /api/v1/activity` (filterable: `ALL | EXPENSE | PAYMENT`)
  - `POST /api/v1/groups/:groupId/reminders` (backend-enforced 24h cooldown per `(groupId, recipientMemberId)`)
- **Module 06 (Guest & Sync)**:
  - `GET /api/v1/invites/:inviteCode`
  - `POST /api/v1/invites/:inviteCode/join-guest`
  - `POST /api/v1/invites/:inviteCode/join`
  - `POST /api/v1/sync/mutations` (idempotent offline queue replay)

---

## 7. Module Implementation Roadmap
- **Phase 0**: Analysis, monorepo foundation, `@chiane/shared` domain math & validation, Prisma schema, Figma SVG assets, Design System components (`[Current]`).
- **Phase 1 — Module 01 (Auth & Onboarding)**: Screens `01`, `02`, `03` + `DisplayNameSetup` + OTP expiration/cooldown + JWT refresh + SecureStore.
- **Phase 2 — Module 02 (Dashboard & Groups)**: Screens `04`, `05`, `06`, `07`, `08` + missing UX: Group Settings, Add/Remove Members, Leave/Archive Group, Member Details.
- **Phase 3 — Module 03 (Expenses)**: Screens `09`, `10`, `11`, `20` + Percentage Split mode + Edit Expense + Delete Expense Confirmation + Receipt Upload.
- **Phase 4 — Module 04 (Debt & Payment)**: Screens `12`, `13`, `14`, `15`, `22` + VietQR payload rendering + Payment History.
- **Phase 5 — Module 05 (Notifications & Activity)**: Screens `16`, `21`, `23` + Notification Preferences.
- **Phase 6 — Module 06 (Profile, Guest & Offline)**: Screens `17`, `18`, `19`, `24` + Bank Setup + Guest RBAC + Offline Mutation Sync Queue.
- **Phase 7 — Integration & E2E Testing**: Full navigation, financial invariants, permissions, Android APK/device testing, visual diff vs Figma.

---

## 8. Missing Requirements & Technical Risks
1. **Color Palette Choice**: Figma Design System (`#173E32` / `#D0F477`) vs Prompt Section 4 (`#1B6B4A` / `#4CAF7D` / `#F6B938`). Implemented Figma tokens; flag for confirmation before Module 02.
2. **Real SMS OTP Provider**: Local dev uses `ConsoleOtpProvider` + dev echo (`OTP_DEV_ECHO=true`, hard-blocked in production). Production requires choosing eSMS / SpeedSMS / Twilio / Firebase Phone Auth.
3. **First-time Profile Name**: Figma Screens `01–03` jump directly to `"Chào An,"` on Screen `04`. Added a lightweight `DisplayNameSetup` step for brand-new users (`isNewUser && !displayName`).
4. **Bank Details & VietQR**: Real VietQR requires `bankBin` + `accountNumber` configured by the recipient in Screen `17`; otherwise Screen `14` shows a clear unconfigured/demo notice and never claims bank auto-verification.
5. **Android Local Toolchain**: `adb`, JDK, and Gradle are not currently on `PATH`; web export + Node tests validate logic/bundles immediately, while on-device Android verification will require Expo Go or Android SDK/JDK setup.
6. **Offline Sync Conflicts**: Resolved via `clientMutationId` idempotency keys and server-authoritative soft-delete/timestamp checks in Module 06.
