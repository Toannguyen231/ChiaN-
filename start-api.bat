@echo off
title ChiaNe - API Backend
set PATH=D:\nvm\v22.22.2;%PATH%
echo ==============================================
echo [ChiaNe API] Dang chay tren Node LTS:
node -v
echo ==============================================
npm run dev --workspace=@chiane/api %*
