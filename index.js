const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const { createProxyMiddleware, fixRequestBody } = require('http-proxy-middleware');
const cors = require('cors');
const verifyToken = require('./middleware/auth');

const app = express();

app.use(cors());  
app.use(express.json()); 

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
      // 🔑 1. Forward User Context FIRST
      if (req.user) {
        proxyReq.setHeader('x-user-id', req.user.id);
        proxyReq.setHeader('x-user-role', req.user.role || 'user');
        console.log(`[Gateway] Forwarded headers for user: ${req.user.id}`);
      }

      // 🛠️ 2. Fix JSON Body AFTER setting headers
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

// 🟢 PUBLIC ROUTES (No Token Required)
app.use('/api/auth', createProxyMiddleware({
  ...proxyOptions(process.env.POSTGRES_SERVICE),
  pathRewrite: (path) => `/api/auth${path}`
}));

// Static Files (Allowing public access for now)
app.use('/uploads', createProxyMiddleware({
  ...proxyOptions(process.env.MONGO_SERVICE),
  pathRewrite: (path) => `/uploads${path}`
}));

// 🔒 PROTECTED ROUTES (Token Validation Required)

// A. Postgres Protected Routes
const protectedPostgresRoutes = ['/api/projects', '/api/tasks', '/api/users', '/api/roles', '/api/permissions'];
protectedPostgresRoutes.forEach(prefix => {
  app.use(prefix, verifyToken, createProxyMiddleware({
    ...proxyOptions(process.env.POSTGRES_SERVICE),
    pathRewrite: (path) => {
      const rewritten = `${prefix}${path}`;
      console.log(`[Proxy Postgres] ${prefix} + ${path} -> ${rewritten}`);
      return rewritten;
    }
  }));
});

// B. Mongo Protected Routes
const protectedMongoRoutes = ['/api/viewer', '/api/backlogs', '/api/attachments', '/api/activity', '/api/timelog', '/api/companies'];
protectedMongoRoutes.forEach(prefix => {
  app.use(prefix, verifyToken, createProxyMiddleware({
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
