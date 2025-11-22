#!/bin/bash

# Release 打包脚本
# 用于创建插件发布包

set -e

echo "🚀 开始打包 Obsidian LLM Plugin..."

# 检查是否已构建
if [ ! -d "dist" ]; then
  echo "❌ 错误: dist 目录不存在，请先运行 pnpm run build"
  exit 1
fi

if [ ! -f "dist/main.js" ]; then
  echo "❌ 错误: dist/main.js 不存在，请先运行 pnpm run build"
  exit 1
fi

# 创建 release 目录
RELEASE_DIR="release"
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

# 复制必要文件
echo "📦 复制文件到 release 目录..."
cp dist/main.js "$RELEASE_DIR/"
cp dist/sql-wasm.wasm "$RELEASE_DIR/"
cp manifest.json "$RELEASE_DIR/"
cp styles.css "$RELEASE_DIR/"

# 创建 zip 包
VERSION=$(node -p "require('./manifest.json').version")
ZIP_NAME="obsidian-llm-plugin-${VERSION}.zip"

echo "🗜️ 创建压缩包: $ZIP_NAME"
cd "$RELEASE_DIR"
zip -r "../$ZIP_NAME" ./*
cd ..

echo "✅ 打包完成！"
echo "📦 输出文件: $ZIP_NAME"
echo ""
echo "安装说明:"
echo "  1. 解压 $ZIP_NAME"
echo "  2. 将文件复制到: /path/to/vault/.obsidian/plugins/obsidian-llm-plugin/"
echo "  3. 在 Obsidian 中重载插件"
