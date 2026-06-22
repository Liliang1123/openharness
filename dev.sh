#!/bin/bash

# OpenHarness 一键开发服务启动脚本

# 捕获 Ctrl+C (SIGINT) 和 SIGTERM 信号，自动清理所有后台子进程
cleanup() {
  echo ""
  echo "正在停止所有 OpenHarness 服务..."
  # 杀死本 shell 脚本启动的所有后台 job
  kill $(jobs -p) 2>/dev/null
  echo "所有后台服务已安全停止。"
  exit 0
}

# 绑定信号处理器
trap cleanup SIGINT SIGTERM

echo "========================================="
echo "        启动 OpenHarness 开发环境"
echo "========================================="

# 加载本地环境变量，供 Java Backend、TS Runtime 与 Frontend 共同使用。
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
  echo "已加载本地 .env 配置。"
else
  echo "未发现 .env，将使用各服务默认配置。可执行: cp .env.example .env"
fi

# 1. 启动 Java Backend (端口 8080)
echo "1. 正在后台启动 Java Backend (8080)..."
(cd backend && mvn spring-boot:run > /tmp/oh-backend.log 2>&1) &

# 稍微等待确保后端端口注册或资源预载
sleep 2

# 2. 启动 TS Agent Runtime (端口 3001)
echo "2. 正在后台启动 TS Agent Runtime (3001)..."
pnpm --filter @openharness/agent-runtime dev > /tmp/oh-runtime.log 2>&1 &

# 3. 启动 Frontend UI (端口 5173)
echo "3. 正在后台启动 Frontend (5173)..."
pnpm --filter @openharness/frontend dev > /tmp/oh-frontend.log 2>&1 &

echo ""
echo "========================================="
echo "OpenHarness 服务已在后台全部拉起！"
echo "========================================="
echo "🔗 浏览器访问入口: http://localhost:5173"
echo "========================================="
echo "📊 后台实时日志路径 (可使用 tail -f 跟踪):"
echo "- Java Backend : tail -f /tmp/oh-backend.log"
echo "- Agent Runtime: tail -f /tmp/oh-runtime.log"
echo "- Frontend UI  : tail -f /tmp/oh-frontend.log"
echo "========================================="
echo "💡 提示: 按 Ctrl+C 可以一键关闭并清理所有服务，防止端口占用。"
echo "========================================="

# 挂起当前 shell 进程，以持续监听中断信号并管理后台任务
wait
