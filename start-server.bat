@echo off
chcp 65001 > nul
title RUGGED PLAYER - ローカル同期サーバー
color 0E

echo ===================================================
echo   RUGGED PLAYER - ローカル同期サーバー 起動ランチャー
echo ===================================================
echo.

where node >nul 2>nul
if %errorlevel% equ 0 (
    echo [情報] Node.js を検出しました。同期サーバーを起動します...
    node server.js
    goto end
)

where python >nul 2>nul
if %errorlevel% equ 0 (
    echo [情報] Node.js が見つからないため、Python を使用して起動します...
    python server.py
    goto end
)

echo [エラー] Node.js も Python もインストールされていません。
echo.
echo 同期サーバーを使用するには、以下のいずれかをインストールしてください：
echo 1. Node.js (https://nodejs.org/)
echo 2. Python 3 (https://www.python.org/)
echo.
echo インストール後、このファイルをもう一度実行してください。
echo.
pause

:end
