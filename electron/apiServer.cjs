const http = require('http');
const url = require('url');
const { ipcMain } = require('electron');

class ApiServer {
  constructor() {
    this.server = null;
    this.port = 3618;
    this.token = '';
    this.enabled = true;
    this.mainWindowGetter = null;
  }

  init(getMainWindow, options = {}) {
    this.mainWindowGetter = getMainWindow;
    this.port = options.port || 3618;
    this.token = options.token || '';
    this.enabled = options.enabled !== undefined ? options.enabled : true;

    if (this.enabled) {
      this.start();
    }
  }

  updateConfig(options = {}) {
    const portChanged = options.port && options.port !== this.port;
    const enabledChanged = options.enabled !== undefined && options.enabled !== this.enabled;
    this.token = options.token !== undefined ? options.token : this.token;

    if (options.port) this.port = options.port;
    if (options.enabled !== undefined) this.enabled = options.enabled;

    if (enabledChanged || (this.enabled && portChanged)) {
      this.stop();
      if (this.enabled) {
        this.start();
      }
    }
  }

  start() {
    if (this.server) return;

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    this.server.on('error', (err) => {
      console.error('[API Server Error]', err.message);
    });

    this.server.listen(this.port, '0.0.0.0', () => {
      console.log(`[API Server] Running on http://localhost:${this.port}`);
    });
  }

  stop() {
    if (this.server) {
      this.server.close(() => {
        console.log('[API Server] Stopped');
      });
      this.server = null;
    }
  }

  async handleRequest(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Token');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const query = parsedUrl.query;

    // Token Auth check
    if (this.token && this.token.trim() !== '') {
      const authHeader = req.headers['authorization'];
      const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
      const customHeaderToken = req.headers['x-api-token'];
      const queryToken = query.token;

      const providedToken = bearerToken || customHeaderToken || queryToken;
      if (providedToken !== this.token) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Unauthorized: Invalid or missing API token' }));
        return;
      }
    }

    // Parse Body if POST/PUT/DELETE
    let body = {};
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      try {
        body = await this.parseJsonBody(req);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        return;
      }
    }

    // Health check endpoint
    if (pathname === '/api/v1/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'ok', version: '1.0.21', apiVersion: 'v1', serverTime: new Date().toISOString() }));
      return;
    }

    // Forward to Renderer Process via IPC
    const mainWindow = this.mainWindowGetter ? this.mainWindowGetter() : null;
    if (!mainWindow || mainWindow.isDestroyed()) {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Service Unavailable: Application window is not ready' }));
      return;
    }

    const reqId = Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    
    // Set 10s timeout
    const timeout = setTimeout(() => {
      ipcMain.removeAllListeners(`api-response-${reqId}`);
      if (!res.writableEnded) {
        res.writeHead(504, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Gateway Timeout: Renderer did not respond in time' }));
      }
    }, 10000);

    ipcMain.once(`api-response-${reqId}`, (event, responseData) => {
      clearTimeout(timeout);
      if (res.writableEnded) return;

      const statusCode = responseData.status || 200;
      res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(responseData.data !== undefined ? responseData.data : responseData));
    });

    // Send command payload to renderer
    mainWindow.webContents.send('api-command', {
      reqId,
      method: req.method,
      pathname,
      query,
      body
    });
  }

  parseJsonBody(req) {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => {
        data += chunk;
        if (data.length > 1e7) { // 10MB limit
          req.connection.destroy();
          reject(new Error('Body too large'));
        }
      });
      req.on('end', () => {
        if (!data || data.trim() === '') {
          resolve({});
        } else {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        }
      });
      req.on('error', reject);
    });
  }
}

module.exports = new ApiServer();
