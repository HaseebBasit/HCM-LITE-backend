import express from 'express';
import cors from 'cors';
import { ENV } from './config/env.js';
import { connectDB } from './config/db.js';
import apiRouter from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import dns from 'node:dns';

const app = express();
dns.setServers(['8.8.8.8', '8.8.4.4']);
const normalizeOrigin = (value) => {
  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
};
const allowedOrigins = new Set(
  [
    ...ENV.FRONTEND_URL.split(','),
    ...ENV.CORS_ORIGINS.split(','),
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '',
    'https://hcm-lite-frontend-eight.vercel.app',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ]
    .map(normalizeOrigin)
    .filter(Boolean)
);

app.use(
  cors({
    origin(origin, callback) {
      // Requests without an Origin header are non-browser clients (for example curl).
      if (!origin || allowedOrigins.has(normalizeOrigin(origin))) {
        return callback(null, true);
      }
      return callback(new Error('CORS origin is not allowed.'));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'HCM Lite API Server',
  });
});

// Direct top-level health/status check
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'HCM Lite API Server' });
});

// Mount Master API routes
app.use('/api', apiRouter);

// 404 & Global Error Handling (Zero-Crash Architecture)
app.use(notFoundHandler);
app.use(errorHandler);

// Bind the API immediately. A slow or unavailable database must not prevent
// the health endpoint or local frontend from starting.
const server = app.listen(ENV.PORT, () => {
  console.log(`[Server] HCM Lite Backend running at http://localhost:${ENV.PORT}`);
  connectDB().catch((dbErr) => {
    console.warn('[Server] Database initialization warning:', dbErr.message);
  });
});

process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received. Closing HTTP server...');
  server.close(() => process.exit(0));
});
