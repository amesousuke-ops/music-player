@echo off
chcp 65001 > nul
echo ===================================================
echo   RUGGED PLAYER - 楽曲データ同期システム (Solution A)
echo ===================================================
echo.
echo 1. music/ フォルダのスキャンと tracks.json の更新中...

where node >nul 2>nul
if %errorlevel% equ 0 (
    echo [情報] Node.js を使用してスキャン中...
    node update-tracks.js
) else (
    where python >nul 2>nul
    if %errorlevel% equ 0 (
        echo [情報] Python を使用してスキャン中...
        python update-tracks.py
    ) else (
        echo [エラー] Node.js も Python も見つかりませんでした。どちらかをインストールしてください。
        pause
        exit /b 1
    )
)

if %errorlevel% neq 0 (
    echo [エラー] tracks.json の生成に失敗しました。
    pause
    exit /b %errorlevel%
)

echo.
echo 2. Git 変更内容のステージング中...
git add music/ tracks.json
if %errorlevel% neq 0 (
    echo [エラー] Git ファイルの追加に失敗しました。Gitが正しくセットアップされているか確認してください。
    pause
    exit /b %errorlevel%
)

echo.
echo 3. コミットの作成中...
git commit -m "Sync music files and update tracks.json"
if %errorlevel% neq 0 (
    echo [警告] 新しい変更がないか、またはコミットに失敗しました。
)

echo.
echo 4. GitHub への送信（プッシュ）中...
git push origin main
if %errorlevel% neq 0 (
    echo [エラー] GitHub への送信（プッシュ）に失敗しました。インターネット接続または権限を確認してください。
    pause
    exit /b %errorlevel%
)

echo.
echo ===================================================
echo   同期完了！数分後にスマホ版に反映されます。
echo   (GitHub Pagesのビルド完了まで少しお待ちください)
echo ===================================================
echo.
pause
