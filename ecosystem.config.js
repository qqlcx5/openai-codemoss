/**
 * PM2 生态系统配置文件
 * 用于生产环境部署和日志管理
 */
module.exports = {
  apps: [
    {
      name: 'moss-proxy',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 8002
      },
      // 日志配置
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // 日志轮转
      log_type: 'json',
      // 自动重启配置
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      // 忽略监听的文件
      ignore_watch: [
        'node_modules',
        'logs',
        '.git'
      ]
    }
  ]
};
