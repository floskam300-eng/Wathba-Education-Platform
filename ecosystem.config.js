module.exports = {
  apps: [{
    name: 'wathba',
    script: 'server/index.js',
    instances: 'max',        // run on all available CPU cores
    exec_mode: 'cluster',
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
