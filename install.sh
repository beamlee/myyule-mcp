#!/bin/bash
# MyYule 在线状态查询技能一键安装

set -e

echo "========================================="
echo "  MyYule 在线状态查询技能一键安装"
echo "========================================="

# 1. 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 未检测到 Node.js"
    echo "请先安装 Node.js: https://nodejs.org/"
    exit 1
fi
echo "✅ Node.js 版本: $(node --version)"

# 2. 创建目录
mkdir -p ~/.myyule
mkdir -p ~/.openclaw/workspace/skills/myyule-online

# 3. 复制项目文件
echo "📦 复制文件..."
cp -r ~/myyule-project/myyule-mcp ~/.myyule/
cp ~/myyule-project/myyule-login.ts ~/.myyule/
cp ~/myyule-project/SKILL.md ~/.openclaw/workspace/skills/myyule-online/

# 4. 安装依赖
echo "📦 安装依赖..."
cd ~/.myyule/myyule-mcp
npm install --production

# 5. 创建启动脚本
cat > ~/.local/bin/myyule-mcp << 'INNEREOF'
#!/bin/bash
cd ~/.myyule/myyule-mcp
node dist/index.js
INNEREOF

cat > ~/.local/bin/myyule-login << 'INNEREOF'
#!/bin/bash
cd ~/.myyule
node myyule-login.ts
INNEREOF

chmod +x ~/.local/bin/myyule-mcp ~/.local/bin/myyule-login

# 6. 配置 mcporter
echo "⚙️  配置 mcporter..."
mcporter config add myyule --stdio "~/.local/bin/myyule-mcp" 2>/dev/null || true

# 7. 重启网关
echo "🔄 重启 OpenClaw 网关..."
openclaw gateway restart

echo ""
echo "========================================="
echo "✅ 安装完成！"
echo ""
echo "📌 使用方法："
echo "   1. 打开 OpenClaw Web 控制台"
echo "   2. 输入「我在线吗」"
echo "========================================="
