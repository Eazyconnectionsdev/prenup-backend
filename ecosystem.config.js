module.exports = {
  apps: [
    {
      name: "prenup-backend",
      script: "dist/main.js",
      cwd: "/var/www/prenup-backend",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 5000,
        HOST: "127.0.0.1",
      }
    }
  ]
};
