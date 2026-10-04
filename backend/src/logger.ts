import crypto from 'crypto';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { recordLogEntry } from './services/diagnostics';

const isDev = process.env.NODE_ENV !== 'production';
const level = process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info');

export const logger = pino({
  level,
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss.l',
        ignore: 'pid,hostname',
      },
    },
  }),
  // Every warn/error also lands in the in-memory ring that the admin System
  // tab and GET /api/diagnostics read, so recent failures are visible
  // without SSH. Runs before redaction, but only whitelisted fields are kept.
  hooks: {
    logMethod(args, method, level) {
      if (level >= 40) {
        try {
          recordLogEntry(level, this.bindings(), args);
        } catch {
          // Diagnostics must never break logging.
        }
      }
      return method.apply(this, args);
    },
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.inviteCode',
      '*.password',
      '*.passwordHash',
      '*.token',
    ],
    censor: '[REDACTED]',
  },
});

export const httpLogger = pinoHttp({
  logger,
  // Short request id, echoed back as X-Request-Id. The client shows it on
  // error screens and includes it in error reports, so "ref 3f9a1c2e" from a
  // user's screenshot finds the matching server log line.
  genReqId: (req, res) => {
    const incoming = req.headers['x-request-id'];
    const id = typeof incoming === 'string' && /^[\w-]{4,64}$/.test(incoming)
      ? incoming
      : crypto.randomBytes(4).toString('hex');
    res.setHeader('X-Request-Id', id);
    return id;
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} → ${res.statusCode}`,
  customErrorMessage: (req, res, err) => `${req.method} ${req.url} → ${res.statusCode} (${err.message})`,
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url, userId: req.raw.userId }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
