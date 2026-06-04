#!/bin/bash

# Thoát ngay lập tức nếu một lệnh trả về mã lỗi khác 0
set -e

echo "============================================="
echo "   Hệ thống Build LANLink Production"
echo "============================================="

# 1. Dọn dẹp các tệp build cũ
echo "🧹 Đang dọn dẹp các tệp build cũ..."
rm -rf dist

# 2. Kiểm tra các thư viện phụ thuộc
echo "📦 Đang kiểm tra các thư viện phụ thuộc..."
npm install

# 3. Kiểm tra cú pháp mã nguồn
echo "🔍 Đang chạy kiểm tra cú pháp mã nguồn..."
node -c src/main.js
node -c src/preload.js

# 4. Build cho macOS (Universal: x64 + arm64)
echo "🍏 Đang build cho macOS (dmg, zip)..."
npx electron-builder --mac --x64 --arm64

# 5. Build cho Windows (x64, arm64)
echo "🪟 Đang build cho Windows (nsis installer, zip)..."
npx electron-builder --win --x64 --arm64

echo "============================================="
echo "🎉 Quá trình build hoàn tất thành công!"
echo "Các tệp đóng gói được lưu trong thư mục 'dist'."
echo "============================================="
