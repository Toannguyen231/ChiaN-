const http = require('node:http');
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const sharedEntry = path.resolve(workspaceRoot, 'packages/shared/src/index.ts');
const apiPort = Number(process.env.API_PORT || 3001);

const config = getDefaultConfig(projectRoot);

const { transformer, resolver, server } = config;

config.transformer = {
  ...transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer/expo'),
};

config.resolver = {
  ...resolver,
  assetExts: resolver.assetExts.filter((ext) => ext !== 'svg'),
  sourceExts: [...resolver.sourceExts, 'svg'],
  resolveRequest: (context, moduleName, platform) => {
    if (moduleName === '@chiane/shared') {
      return {
        filePath: sharedEntry,
        type: 'sourceFile',
      };
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

config.server = {
  ...server,
  enhanceMiddleware: (metroMiddleware, metroServer) => {
    const baseMiddleware = server?.enhanceMiddleware
      ? server.enhanceMiddleware(metroMiddleware, metroServer)
      : metroMiddleware;

    return (req, res, next) => {
      const url = req.url || '';
      if (
        url.startsWith('/api/') ||
        url.startsWith('/legal/') ||
        url === '/health' ||
        url.startsWith('/health?')
      ) {
        const proxyReq = http.request(
          {
            hostname: '127.0.0.1',
            port: apiPort,
            path: url,
            method: req.method,
            headers: {
              ...req.headers,
              host: `127.0.0.1:${apiPort}`,
            },
          },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
            proxyRes.pipe(res, { end: true });
          }
        );

        proxyReq.on('error', () => {
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
          }
          res.end(
            JSON.stringify({
              error: {
                code: 'API_UNAVAILABLE',
                message: 'Máy chủ API (cổng 3001) chưa chạy hoặc không phản hồi.',
              },
            })
          );
        });

        req.pipe(proxyReq, { end: true });
        return;
      }

      return baseMiddleware(req, res, next);
    };
  },
};

module.exports = config;
