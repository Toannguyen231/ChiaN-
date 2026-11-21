@echo off
title ChiaNe - Mobile (Expo)
set PATH=D:\nvm\v22.22.2;%PATH%
echo ==============================================
echo [ChiaNe Mobile] Dang chay tren Node LTS:
node -v
echo ==============================================
npm run start --workspace=@chiane/mobile %*
