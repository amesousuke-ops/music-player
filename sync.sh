#!/bin/bash
echo "==================================================="
echo "  RUGGED PLAYER - 楽曲データ同期システム (Solution A)"
echo "==================================================="
echo ""
echo "1. music/ フォルダのスキャンと tracks.json の更新中..."

if command -v node &> /dev/null; then
    echo "[情報] Node.js を使用してスキャン中..."
    node update-tracks.js
elif command -v python3 &> /dev/null; then
    echo "[情報] Python3 を使用してスキャン中..."
    python3 update-tracks.py
elif command -v python &> /dev/null; then
    echo "[情報] Python を使用してスキャン中..."
    python update-tracks.py
else
    echo "[エラー] Node.js も Python も見つかりませんでした。どちらかをインストールしてください。"
    read -p "キーを押して終了します..."
    exit 1
fi

if [ $? -ne 0 ]; then
    echo "[エラー] tracks.json の生成に失敗しました。"
    read -p "キーを押して終了します..."
    exit 1
fi

echo ""
echo "2. Git 変更内容のステージング中..."
git add music/ tracks.json
if [ $? -ne 0 ]; then
    echo "[エラー] Git ファイルの追加に失敗しました。Gitが正しくセットアップされているか確認してください。"
    read -p "キーを押して終了します..."
    exit 1
fi

echo ""
echo "3. コミットの作成中..."
git commit -m "Sync music files and update tracks.json"
if [ $? -ne 0 ]; then
    echo "[警告] 新しい変更がないか、またはコミットに失敗しました。"
fi

echo ""
echo "4. GitHub への送信（プッシュ）中..."
git push origin main
if [ $? -ne 0 ]; then
    echo "[エラー] GitHub への送信（プッシュ）に失敗しました。インターネット接続または権限を確認してください。"
    read -p "キーを押して終了します..."
    exit 1
fi

echo ""
echo "==================================================="
echo "  同期完了！数分後にスマホ版に反映されます。"
echo "  (GitHub Pagesのビルド完了まで少しお待ちください)"
echo "==================================================="
echo ""
read -p "キーを押して終了します..."
