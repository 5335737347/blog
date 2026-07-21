const path = require("node:path");

const repositoryRoot = __dirname;

module.exports = {
  apps: [
    {
      name: "blog-api",
      cwd: repositoryRoot,
      script: path.join(repositoryRoot, "apps/api/dist/index.js"),
      interpreter: "node",
      autorestart: true,
      max_memory_restart: "512M",
      kill_timeout: 5000,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "blog-web",
      cwd: path.join(repositoryRoot, "apps/web"),
      script: path.join(repositoryRoot, "node_modules/next/dist/bin/next"),
      args: "start --hostname 127.0.0.1 --port 3001",
      interpreter: "node",
      autorestart: true,
      max_memory_restart: "768M",
      kill_timeout: 5000,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
