module.exports = {
  apps: [{
    name: 'wathba',
    script: 'server/index.js',
    // SSE connections are kept in server/sse.js memory. Running multiple
    // workers without a shared pub/sub bus loses publish events when the
    // request and the student's SSE connection land on different workers.
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '1G',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};
