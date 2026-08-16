import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'path';
import { execSync } from 'child_process';
import fs from 'fs';

const DEV_PROXY_PREFIX = '/__dev_proxy__';
const PROJECT_ROOT = import.meta.dirname;
const SKIP_REQUEST_HEADERS = new Set([
  'accept-encoding',
  'connection',
  'content-length',
  'host',
  'origin',
  'referer',
]);
const SKIP_RESPONSE_HEADERS = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

// Get version from environment, git tag, or package.json
function getVersion(): string {
  // 1. Environment variable (set by GitHub Actions)
  if (process.env.VERSION) {
    return process.env.VERSION;
  }

  // 2. Try git tag
  try {
    const gitTag = execSync(
      'git describe --tags --exact-match 2>/dev/null || git describe --tags 2>/dev/null || echo ""',
      { encoding: 'utf8' }
    ).trim();
    if (gitTag) {
      return gitTag;
    }
  } catch {
    // Git not available or no tags
  }

  // 3. Fall back to package.json version
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(PROJECT_ROOT, 'package.json'), 'utf8'));
    if (pkg.version && pkg.version !== '0.0.0') {
      return pkg.version;
    }
  } catch {
    // package.json not readable
  }

  return 'dev';
}

function resolveManualChunk(id: string) {
  const sourceId = id.split('?', 1)[0];

  // Small management endpoints share the same transport and are typically
  // used together across operational routes. Consolidating them avoids one
  // request per endpoint module while keeping feature components separate.
  if (
    /[\\/]src[\\/]services[\\/]api[\\/](apiKeys|configFile|logs|oauth)\.ts$/.test(sourceId)
  ) {
    return 'management-api';
  }

  // These dependency-free helpers are shared across management routes. If
  // left to automatic splitting, each becomes a 0.3-0.7 KiB request. Keep the
  // group deliberately leaf-only: grouping stores or API modules would let
  // Rolldown recursively claim React or axios and inflate the initial graph.
  if (
    /[\\/]src[\\/]utils[\\/](clipboard|compare|constants|download|error|trailingSingleFlight)\.ts$/.test(
      sourceId
    )
  ) {
    return 'app-utils';
  }

  // Keep the small usage helpers in one lazy feature chunk instead of one
  // request for a period helper, one for CSS-module bindings and another for
  // import/export utilities.
  if (
    /[\\/]src[\\/]components[\\/]usage[\\/](UsageCharts\.module\.scss|chartPeriod\.ts)$/.test(
      sourceId
    ) ||
    /[\\/]src[\\/]components[\\/]usage[\\/]hooks[\\/]usageFileUtils\.ts$/.test(sourceId)
  ) {
    return 'usage-shared';
  }

  // The boot/session fallback only needs this tiny spinner. Keeping it out of
  // the shared UI chunk prevents the entry from preloading every UI primitive
  // before the router knows whether to show login or the management shell.
  if (/[\\/]src[\\/]components[\\/]ui[\\/]LoadingSpinner\.tsx(?:\?|$)/.test(id)) {
    return undefined;
  }

  // The UI primitives are shared by nearly every route. Keeping them in one
  // chunk avoids dozens of sub-5 KB requests without pulling page content
  // into the initial entry.
  if (/[\\/]src[\\/]components[\\/]ui[\\/]/.test(id)) {
    return 'ui';
  }

  // Provider marks are tiny URL modules and are requested together on the
  // provider/auth-files screens. One cacheable chunk is cheaper than a
  // request per provider logo.
  if (/[\\/]src[\\/]assets[\\/]icons[\\/]/.test(id)) {
    return 'brand-icons';
  }

  if (!id.includes('node_modules')) {
    return undefined;
  }

  // Resolve framework virtual/CommonJS proxy modules before feature packages.
  // Some proxy ids include both the importer and React; assigning those to a
  // feature chunk would make the application entry preload that feature.
  if (
    /node_modules\/(react|react-dom|scheduler|react-router|react-router-dom|i18next|react-i18next|zustand)\//.test(
      id
    )
  ) {
    return 'framework';
  }

  // Keep the chart stack with its lazy consumer. Under Rolldown, manually
  // chunking either the React wrapper or Chart.js can claim shared runtime
  // helpers and make the application entry preload the entire feature.
  if (id.includes('react-chartjs-2') || id.includes('chart.js')) {
    return undefined;
  }

  // The editor follows the same rule: all of its packages stay behind the
  // lazy configuration editor boundary instead of becoming entry preload.
  if (id.includes('@uiw/react-codemirror') || id.includes('@codemirror/')) {
    return undefined;
  }

  // yaml 仅 ConfigPage 使用，走独立 chunk
  if (id.includes('/yaml/')) {
    return 'yaml';
  }

  // axios 很稳定、很少变动，独立便于长缓存
  if (id.includes('/axios/')) {
    return 'http';
  }

  return 'vendor';
}

function createDevManagementProxy(): Plugin {
  return {
    name: 'dev-management-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const requestUrl =
          (req as typeof req & { originalUrl?: string }).originalUrl || req.url || '';
        if (!requestUrl.startsWith(`${DEV_PROXY_PREFIX}/`)) {
          next();
          return;
        }

        const suffix = requestUrl.slice(DEV_PROXY_PREFIX.length + 1);
        const slashIndex = suffix.indexOf('/');
        if (slashIndex <= 0) {
          res.statusCode = 400;
          res.end('Missing proxy target');
          return;
        }

        try {
          const targetBase = decodeURIComponent(suffix.slice(0, slashIndex));
          const targetPath = suffix.slice(slashIndex);
          const targetUrl = new URL(`${targetBase.replace(/\/+$/g, '')}${targetPath}`);

          const headers: Record<string, string> = {};
          Object.entries(req.headers).forEach(([key, value]) => {
            const lowerKey = key.toLowerCase();
            if (SKIP_REQUEST_HEADERS.has(lowerKey) || lowerKey.startsWith('sec-')) {
              return;
            }
            if (Array.isArray(value)) {
              headers[key] = value.join(', ');
            } else if (typeof value === 'string') {
              headers[key] = value;
            }
          });

          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

          const upstream = await fetch(targetUrl, {
            method: req.method || 'GET',
            headers,
            body: body && req.method !== 'GET' && req.method !== 'HEAD' ? body : undefined,
            redirect: 'manual',
          });

          const responseBody = Buffer.from(await upstream.arrayBuffer());
          res.statusCode = upstream.status;
          res.statusMessage = upstream.statusText;

          upstream.headers.forEach((value, key) => {
            if (SKIP_RESPONSE_HEADERS.has(key.toLowerCase())) {
              return;
            }
            res.setHeader(key, value);
          });
          res.setHeader('content-length', String(responseBody.length));
          res.end(responseBody);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Proxy request failed';
          server.config.logger.error(`[dev-management-proxy] ${message}`);
          res.statusCode = 502;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: message }));
        }
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const singleFileBuild = mode === 'singlefile' || process.env.SINGLE_FILE === 'true';
  const performanceBuild = mode === 'performance';

  return {
    plugins: [
      createDevManagementProxy(),
      react(),
      ...(singleFileBuild
        ? [
            viteSingleFile({
              removeViteModuleLoader: true,
            }),
          ]
        : []),
    ],
    define: {
      __APP_VERSION__: JSON.stringify(getVersion()),
    },
    resolve: {
      alias: {
        '@': path.resolve(PROJECT_ROOT, './src'),
      },
    },
    css: {
      modules: {
        localsConvention: 'camelCase',
        generateScopedName:
          command === 'serve' ? '[name]__[local]___[hash:base64:5]' : 'm_[hash:base64:6]',
      },
      preprocessorOptions: {
        scss: {
          additionalData: `@use "@/styles/variables.scss" as *;`,
        },
      },
    },
    build: {
      target: 'es2020',
      outDir: 'dist',
      cssCodeSplit: !singleFileBuild,
      manifest: performanceBuild,
      ...(singleFileBuild
        ? {
            assetsInlineLimit: 100000000,
            chunkSizeWarningLimit: 100000000,
            rolldownOptions: {
              output: {
                codeSplitting: false,
              },
            },
          }
        : {
            chunkSizeWarningLimit: 900,
          }),
      rollupOptions: {
        output: singleFileBuild
          ? {
              inlineDynamicImports: true,
              manualChunks: undefined,
            }
          : {
              manualChunks: resolveManualChunk,
            },
      },
    },
  };
});
