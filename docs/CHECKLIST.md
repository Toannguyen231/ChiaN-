# ChiaNè — Development Checklist

> Rule: Items are marked `[x]` ONLY after code is written AND verified via automated tests / typecheck / bundle checks.

## Phase 0 — Analysis & Foundation
- [x] Workspace & monorepo initialization (`package.json`, `tsconfig.base.json`, `.gitignore`, `.env.example`)
- [x] Phase 0 architecture report (`docs/PHASE_0_ARCHITECTURE.md`)
- [x] `@chiane/shared` domain logic (VND money, equal/exact/percentage split, net balance & debt optimization, VietQR CRC16, VN phone validation) + Vitest unit tests
- [x] `@chiane/api` Fastify + Prisma 10-model schema + Zod env validation + auth/RBAC middleware + `/health`
- [x] `@chiane/mobile` Expo SDK 58 foundation (`expo@~58.0.26`, `react-native@0.88.1`, `react@19.3.0`), `Be Vietnam Pro` font setup, Figma SVG assets downloaded & verified, Design System tokens & reusable components, navigation shell

## Phase 1 — Module 01: Authentication & Onboarding
- [x] Backend OTP request (`POST /api/v1/auth/otp/request`) with cooldown & salted SHA-256 hash
- [x] Backend OTP verify (`POST /api/v1/auth/otp/verify`) with expiration, max-attempt lockout, timing-safe check & user upsert
- [x] Backend JWT access & rotating refresh tokens (`POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`)
- [x] Backend profile endpoints (`GET /api/v1/auth/me`, `PATCH /api/v1/auth/me`)
- [x] API integration tests (`apps/api/src/__tests__/auth.test.ts`)
- [x] Screen `01 · Chào ChiaNè` (`WelcomeScreen.tsx`)
- [x] Screen `02 · Đăng nhập` (`LoginScreen.tsx`)
- [x] Screen `03 · Xác thực số điện thoại` (`OtpVerifyScreen.tsx`) incl. OTP expiration state
- [x] First-time user onboarding step (`DisplayNameSetupScreen.tsx`)

## Phase 2 — Module 02: Dashboard & Group Management
- [x] Screen `04 · Tổng quan` (Dashboard) + `GET /api/v1/dashboard`
- [x] Screen `05 · Nhóm của bạn` (My Groups: Active / Archived / Search / Join by link)
- [x] Screen `06 · Tạo nhóm` (Create Group)
- [x] Screen `07 · Mời bạn bè` (Invite Friends & regenerate link)
- [x] Screen `08 · Chi tiết nhóm` (Group Details: Expenses / Balances / Members tabs)
- [x] Missing UX: Group Settings, Add/Remove Members, Leave Group, Archive Group, Individual Member Details

## Phase 3 — Module 03: Expense Management
- [x] Screen `09 · Thêm khoản chi` (Add Expense + receipt note/attachment)
- [x] Screen `10 · Cách chia` (Equal & Percentage Split + exact VND rounding)
- [x] Screen `20 · Chia theo số tiền` (Custom Exact Amount Splitting + mismatch guard)
- [x] Screen `11 · Chi tiết khoản chi` (Expense Details + audit trail)
- [x] Missing UX: Edit Expense, Delete Expense Confirmation

## Phase 4 — Module 04: Debt & Payment
- [x] Screen `12 · Số dư nhóm` (Group Balances & minimum-transfer settlement plan)
- [x] Screen `13 · Thanh toán` (Select payment method & recipient bank preview)
- [x] Screen `14 · QR chuyển khoản` (VietQR EMVCo payload QR + memo copy)
- [x] Screen `15 · Chờ xác nhận thanh toán` (Waiting for recipient confirmation)
- [x] Screen `22 · Xác nhận đã nhận tiền` (Recipient confirm / reject payment)
- [x] Missing UX: Payment History

## Phase 5 — Module 05: Notifications & Activity
- [x] Screen `16 · Hoạt động` (Activity feed + filters)
- [x] Screen `21 · Nhắc nhẹ bạn bè` (Friendly reminder + 24h rate limit)
- [x] Screen `23 · Đã thanh toán` (Payment completed state)
- [x] Missing UX: Notification Preferences

## Phase 6 — Module 06: Profile, Guest & Offline
- [x] Screen `17 · Tài khoản` (Account, bank details CRUD, settings, logout)
- [x] Screen `18 · Nhóm mới` (Empty group state)
- [x] Screen `19 · Tham gia không cần tài khoản` (Guest join + RBAC restrictions)
- [x] Screen `24 · Đã lưu trên máy` (Offline queue & auto-sync)
- [x] Missing UX: Account recovery / phone change, Empty/Loading/Error/Success states across modules

## Phase 7 — Integration & Testing
- [x] End-to-end navigation & deep link tests
- [x] Multi-user RBAC & guest authorization tests
- [x] Offline sync & conflict tests
- [ ] Android emulator / device QA & Figma pixel comparison
