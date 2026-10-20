import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { DomainError } from '@acme/domain';
import { getCatalog } from '../application/catalog.js';
import { QuoteBasket, type BasketItem, type QuoteService } from '../application/quote-basket.js';
import { quoteSchema } from './schemas.js';

export interface AppOptions {
  logger?: boolean;
  staticDir?: string;
  rateLimitMax?: number;
  quoteService?: QuoteService;
}

export async function createApp(options: AppOptions = {}) {
  if (options.staticDir) {
    const index = await stat(join(options.staticDir, 'index.html'));
    if (!index.isFile()) throw new Error('STATIC_DIR must contain an index.html file.');
  }
  const app = Fastify({
    logger: options.logger
      ? { level: 'info', redact: ['req.headers.authorization', 'req.headers.cookie'] }
      : false,
    bodyLimit: 16_384,
    requestTimeout: 10_000,
    connectionTimeout: 10_000,
    trustProxy: false,
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false } },
  });
  const quotes = options.quoteService ?? new QuoteBasket();

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
    crossOriginEmbedderPolicy: true,
  });
  await app.register(rateLimit, {
    global: false,
    max: options.rateLimitMax ?? 1000,
    timeWindow: '1 minute',
    keyGenerator: () => 'instance',
  });

  app.get('/healthz', () => ({ status: 'ok' }));
  app.get('/readyz', () => ({ status: 'ready' }));

  app.get('/api/catalog', (_request, reply) => {
    reply.header('Cache-Control', 'public, max-age=300');
    return getCatalog();
  });

  app.post<{ Body: { items: BasketItem[] } }>(
    '/api/quotes',
    { schema: quoteSchema, config: { rateLimit: {} } },
    (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      return quotes.execute(request.body.items);
    },
  );

  app.setErrorHandler(
    (error: Error & { statusCode?: number; validation?: unknown }, request, reply) => {
      reply.header('Cache-Control', 'no-store');
      if (error instanceof DomainError) {
        return reply.code(422).send({ error: { code: error.code, message: error.message } });
      }
      const status = error.statusCode ?? 500;
      const errors: Record<number, { code: string; message: string }> = {
        400: {
          code: 'INVALID_REQUEST',
          message: 'Provide valid product codes and whole-number quantities from 1 to 100.',
        },
        403: { code: 'FORBIDDEN', message: 'This resource is not accessible.' },
        404: { code: 'NOT_FOUND', message: 'This resource does not exist.' },
        413: { code: 'PAYLOAD_TOO_LARGE', message: 'The request exceeds the allowed size.' },
        415: {
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: 'Use application/json for basket requests.',
        },
        429: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again in a minute.' },
      };
      const safeError = errors[status];
      if (safeError) return reply.code(status).send({ error: safeError });
      request.log.error({ err: error }, 'Request failed');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed.' },
      });
    },
  );

  app.setNotFoundHandler((_request, reply) =>
    reply
      .code(404)
      .send({ error: { code: 'NOT_FOUND', message: 'This resource does not exist.' } }),
  );

  if (options.staticDir) {
    await app.register(staticFiles, {
      root: options.staticDir,
      index: ['index.html'],
      preCompressed: true,
      dotfiles: 'deny',
      setHeaders(response, path) {
        response.header(
          'Cache-Control',
          /\.html(?:\.(?:br|gz))?$/.test(path) ? 'no-cache' : 'public, max-age=86400',
        );
      },
    });
  }

  return app;
}
