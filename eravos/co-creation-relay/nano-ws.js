  'use strict';
  /**
   * nano-ws.js — Zero-dependency WebSocket server
   * UUID: nano-ws-v1-0-0
   * Implements: nano-ws.eg spec + guardian-wss-7821.eg surface
   *
   * §5.5 — This exists because ws is a runtime dep. We own this.
   * §1.2 — Every frame error is loud. No silent drops.
   *
   * Drop-in for server.js:
   *   const { WebSocketServer, WebSocket } = require('ws');
   *   →
   *   const { WebSocketServer, WebSocket } = require('./nano-ws');
   *
   * API surface matched exactly:
   *   new WebSocketServer({ server: httpsServer })
   *   wss.clients          → Set of NanoSocket
   *   wss.on('connection', (ws, req) => {})
   *   ws.readyState        → WebSocket.OPEN | WebSocket.CLOSED
   *   ws.send(string)
   *   ws.on('message' | 'close' | 'error', handler)
   */

  const crypto = require('crypto');
  const { EventEmitter } = require('events');

  // ── Constants (mirrors ws API) ────────────────────────────────────────────────

  const CONNECTING = 0;
  const OPEN       = 1;
  const CLOSING    = 2;
  const CLOSED     = 3;

  // RFC 6455 opcodes
  const OP_CONT  = 0x0;
  const OP_TEXT  = 0x1;
  const OP_BIN   = 0x2;
  const OP_CLOSE = 0x8;
  const OP_PING  = 0x9;
  const OP_PONG  = 0xA;

  // ── NanoSocket — wraps a raw net.Socket into a WS peer ───────────────────────

  class NanoSocket extends EventEmitter {
    constructor(socket, req) {
      super();
      this._socket     = socket;
      this._req        = req;           // the HTTP upgrade request
      this.readyState  = OPEN;
      this._buf        = Buffer.alloc(0);
      this._fragments  = [];            // for multi-frame messages

      socket.on('data',  (chunk) => this._onData(chunk));
      socket.on('close', ()      => this._onClose());
      socket.on('error', (err)   => this._onError(err));
    }

    // ── Public API ──────────────────────────────────────────────────────────────

    send(data) {
      if (this.readyState !== OPEN) return;
      const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
      this._socket.write(_buildFrame(OP_TEXT, buf));
    }

    close(code = 1000, reason = '') {
      if (this.readyState !== OPEN) return;
      this.readyState = CLOSING;
      const reasonBuf = Buffer.from(reason, 'utf8');
      const payload   = Buffer.alloc(2 + reasonBuf.length);
      payload.writeUInt16BE(code, 0);
      reasonBuf.copy(payload, 2);
      this._socket.write(_buildFrame(OP_CLOSE, payload));
      this._socket.end();
    }

    ping() {
      if (this.readyState !== OPEN) return;
      this._socket.write(_buildFrame(OP_PING, Buffer.alloc(0)));
    }

    // ── Frame parser ────────────────────────────────────────────────────────────

    _onData(chunk) {
      this._buf = Buffer.concat([this._buf, chunk]);

      while (this._buf.length >= 2) {
        const b0  = this._buf[0];
        const b1  = this._buf[1];
        const fin  = (b0 & 0x80) !== 0;
        const op   = b0 & 0x0F;
        const mask = (b1 & 0x80) !== 0;
        let payLen = b1 & 0x7F;
        let offset = 2;

        // Extended payload length
        if (payLen === 126) {
          if (this._buf.length < 4) return; // wait for more data
          payLen = this._buf.readUInt16BE(2);
          offset = 4;
        } else if (payLen === 127) {
          if (this._buf.length < 10) return;
          // We don't support >2GB frames — read as 32-bit (high word must be 0)
          const hi = this._buf.readUInt32BE(2);
          const lo = this._buf.readUInt32BE(6);
          if (hi !== 0) { this._error('Frame too large'); return; }
          payLen = lo;
          offset = 10;
        }

        const maskLen = mask ? 4 : 0;
        const frameEnd = offset + maskLen + payLen;
        if (this._buf.length < frameEnd) return; // wait for more data

        // Unmask payload
        let payload = this._buf.slice(offset + maskLen, frameEnd);
        if (mask) {
          const key = this._buf.slice(offset, offset + 4);
          payload = Buffer.from(payload); // copy before mutating
          for (let i = 0; i < payload.length; i++) payload[i] ^= key[i & 3];
        }

        // Consume frame from buffer
        this._buf = this._buf.slice(frameEnd);

        this._handleFrame(fin, op, payload);
      }
    }

    _handleFrame(fin, op, payload) {
      switch (op) {
        case OP_TEXT:
        case OP_BIN: {
          if (!fin) { this._fragments.push(payload); return; }
          const full = this._fragments.length
            ? Buffer.concat([...this._fragments, payload])
            : payload;
          this._fragments = [];
          this.emit('message', full); // raw Buffer, same as ws
          break;
        }
        case OP_CONT: {
          this._fragments.push(payload);
          if (!fin) return;
          const full = Buffer.concat(this._fragments);
          this._fragments = [];
          this.emit('message', full);
          break;
        }
        case OP_PING:
          this._socket.write(_buildFrame(OP_PONG, payload));
          break;
        case OP_PONG:
          break; // ignore
        case OP_CLOSE: {
          const code   = payload.length >= 2 ? payload.readUInt16BE(0) : 1000;
          const reason = payload.length > 2  ? payload.slice(2).toString('utf8') : '';
          this.readyState = CLOSING;
          this._socket.write(_buildFrame(OP_CLOSE, payload)); // echo close
          this._socket.end();
          this.readyState = CLOSED;
          this.emit('close', code, reason);
          break;
        }
        default:
          this._error(`Unknown opcode: 0x${op.toString(16)}`);
      }
    }

    _onClose() {
      if (this.readyState === CLOSED) return;
      this.readyState = CLOSED;
      this.emit('close', 1006, 'Connection reset');
    }

    _onError(err) {
      this.readyState = CLOSED;
      this.emit('error', err);
    }

    _error(msg) {
      const err = new Error(`[nano-ws] ${msg}`);
      this.emit('error', err);
      this.close(1002, msg);
    }
  }

  // ── WebSocketServer — attaches to an existing https.Server ───────────────────

  class WebSocketServer extends EventEmitter {
    constructor({ server, path: wsPath = null } = {}) {
      super();
      this.clients  = new Set();
      this._path    = wsPath;

      if (server) this._attach(server);
    }

    _attach(server) {
      server.on('upgrade', (req, socket, head) => {
        // Path filter (optional)
        if (this._path && req.url !== this._path) {
          socket.destroy();
          return;
        }

        // Validate upgrade request
        const key = req.headers['sec-websocket-key'];
        if (!key || req.headers.upgrade?.toLowerCase() !== 'websocket') {
          socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
          socket.destroy();
          return;
        }

        // RFC 6455 handshake
        const accept = _makeAccept(key);
        const handshake = [
          'HTTP/1.1 101 Switching Protocols',
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Accept: ${accept}`,
          '\r\n',
        ].join('\r\n');

        socket.write(handshake);
        socket.setTimeout(0);
        socket.setNoDelay(true);
        socket.setKeepAlive(true);

        const ws = new NanoSocket(socket, req);
        this.clients.add(ws);

        ws.on('close', () => this.clients.delete(ws));
        ws.on('error', () => this.clients.delete(ws));

        this.emit('connection', ws, req);
      });
    }

    // Convenience broadcast — mirrors how server.js calls wss.clients
    broadcast(data) {
      for (const ws of this.clients) {
        if (ws.readyState === OPEN) ws.send(data);
      }
    }

    close(cb) {
      for (const ws of this.clients) ws.close();
      this.clients.clear();
      if (cb) cb();
    }
  }

  // ── RFC 6455 helpers ──────────────────────────────────────────────────────────

  function _makeAccept(key) {
    return crypto
      .createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');
  }

  function _buildFrame(opcode, payload) {
    const len = payload.length;
    let header;

    if (len <= 125) {
      header = Buffer.alloc(2);
      header[0] = 0x80 | opcode;
      header[1] = len;
    } else if (len <= 0xFFFF) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      header.writeUInt32BE(0, 2);
      header.writeUInt32BE(len, 6);
    }

    return Buffer.concat([header, payload]);
  }

  // ── Exports — mirrors ws package surface ─────────────────────────────────────

  // `const`, not a bare assignment. This was `WebSocket = {...}` with no
  // declaration: under 'use strict' that is an assignment to an undeclared
  // identifier, which only worked because Node 22+ HAS a global WebSocket —
  // so this was silently clobbering the platform global rather than making
  // its own. Electron 31 bundles Node 20, where no such global exists, and
  // the same line threw "WebSocket is not defined" — the relay refused to
  // attach in the desktop app while working perfectly under plain node.
  const WebSocket = { CONNECTING, OPEN, CLOSING, CLOSED };

  module.exports = { WebSocketServer, WebSocket, NanoSocket };
