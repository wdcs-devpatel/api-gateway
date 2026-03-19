const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const { createProxyMiddleware, fixRequestBody } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json()); // 📝 Support parsing for proxy stream reconstruction

// 📝 1. Logging Middleware (Request Inspection)
app.use((req, res, next) => {
  console.log(`[Gateway] ${req.method} ${req.url}`);
  next();
});

// 🛠️ 2. Proxy Configuration Factory
const proxyOptions = (target) => ({
  target,
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq, req, res, options) => {
      const contentType = req.headers['content-type'];
      if (contentType && contentType.includes('application/json')) {
        fixRequestBody(proxyReq, req, res, options);
      }
    },
    error: (err, req, res) => {
      console.error(`[Gateway Error] Failed proxying ${req.method} ${req.url} -> ${target}:`, err.message);
      res.status(503).json({ message: 'Service unavailable: Downstream failure' });
    }
  }
});

/* =============================================================
   3. REGISTRY PROXIES (Independent Mounts using pathRewrite)
   ============================================================= */

// A. Postgres Microservice Routes
const postgresRoutes = ['/api/auth', '/api/projects', '/api/tasks', '/api/users', '/api/roles', '/api/permissions'];
postgresRoutes.forEach(prefix => {
  app.use(prefix, createProxyMiddleware({
    ...proxyOptions(process.env.POSTGRES_SERVICE),
    pathRewrite: (path) => {
      const rewritten = `${prefix}${path}`;
      console.log(`[Proxy Postgres] ${prefix} + ${path} -> ${rewritten}`);
      return rewritten;
    }
  }));
});

// B. Mongo Microservice Routes & Static Files
const mongoRoutes = ['/api/viewer', '/api/backlogs', '/api/attachments', '/api/activity', '/api/timelog', '/api/companies', '/uploads'];
mongoRoutes.forEach(prefix => {
  app.use(prefix, createProxyMiddleware({
    ...proxyOptions(process.env.MONGO_SERVICE),
    pathRewrite: (path) => {
      const rewritten = `${prefix}${path}`;
      console.log(`[Proxy Mongo] ${prefix} + ${path} -> ${rewritten}`);
      return rewritten;
    }
  }));
});

const PORT = process.env.PORT || 5002;
app.listen(PORT, () => console.log(`🚀 API Gateway running securely on port ${PORT}`));
