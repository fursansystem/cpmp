// Secrets live in .env on the server, never in this file — it is committed.
// Node reads .env itself via --env-file, the same way the `start` script does.
module.exports = {
  apps: [
    {
      name: 'PMPro',
      script: 'dist/index.js',
      node_args: '--env-file=.env',
      cwd: './',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1024M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
