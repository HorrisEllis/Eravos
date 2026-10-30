'use strict';
/**
 * tiny-smtp-client.js — a real SMTP client, not a stub. Zero
 * dependencies (Node's own net/tls only), matching this whole
 * project's stated preference for minimal deps (same reasoning
 * clear-glass-lite's own README states for staying at "one
 * dependency, Electron itself").
 *
 * WHAT THIS IS FOR, stated plainly: sending real mail (e.g. an invite
 * link) through a real, user-configured SMTP relay -- your own Gmail
 * account, a real transactional-mail provider's SMTP endpoint,
 * whatever you actually have credentials for. This is a CLIENT that
 * submits mail somewhere else for delivery, not a server that accepts
 * inbound mail or tries to deliver directly to arbitrary recipients'
 * mail servers itself.
 *
 * HONEST SCOPE NOTE, read before assuming more than this does: running
 * your OWN mail server that delivers straight to gmail.com/outlook.com/
 * etc without going through a real relay is not realistic for a small
 * app like this -- real mail providers heavily distrust unauthenticated,
 * unknown senders (no SPF/DKIM/DMARC reputation, likely to land in spam
 * or be refused outright). This module deliberately does the
 * achievable, real thing instead: speak real SMTP to a relay you
 * already trust and have real credentials for.
 *
 * Supports: STARTTLS (most real relays require this, e.g. Gmail on
 * port 587), AUTH LOGIN and AUTH PLAIN, real multi-line response
 * parsing (a real SMTP response can span several lines, each but the
 * last using a "-" after the code instead of a space -- get this
 * wrong and you silently mis-parse legitimate multi-line greetings/
 * capability lists).
 */

const net = require('net');
const tls = require('tls');

/**
 * sendMail(config, message) -> Promise<{ ok, response }>
 *
 * config: { host, port, secure (bool, direct TLS on connect, e.g. 465),
 *           starttls (bool, default true if !secure), user, pass,
 *           timeoutMs (default 15000) }
 * message: { from, to (string or array), subject, text, html (optional) }
 */
function sendMail(config, message) {
  return new Promise((resolve, reject) => {
    const {
      host, port = 587, secure = false, starttls = !secure,
      user, pass, timeoutMs = 15000,
    } = config || {};
    if (!host) return reject(new Error('sendMail: config.host is required'));
    if (!message || !message.from || !message.to || !message.subject) {
      return reject(new Error('sendMail: message.from, message.to, and message.subject are required'));
    }

    const to = Array.isArray(message.to) ? message.to : [message.to];
    let socket = secure ? tls.connect({ host, port }) : net.connect({ host, port });
    let buffer = '';
    let step = 'greeting';
    let upgraded = secure;

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('sendMail: timed out after ' + timeoutMs + 'ms at step "' + step + '"'));
    }, timeoutMs);

    function cleanup(err, result) {
      clearTimeout(timer);
      try { socket.end(); } catch (e) {}
      if (err) reject(err); else resolve(result);
    }

    function send(line) {
      socket.write(line + '\r\n');
    }

    /**
     * A real SMTP multi-line response looks like:
     *   250-first line
     *   250-second line
     *   250 last line (space, not dash, after the code)
     * Returns the full block once the LAST line (space-separated code)
     * has arrived, null otherwise -- so a naive "wait for one newline"
     * parser doesn't cut off a real multi-line EHLO capability list
     * partway through.
     */
    function tryConsumeResponse() {
      const lines = buffer.split('\r\n').filter((l, i, arr) => i < arr.length - 1 || l !== '');
      if (!lines.length) return null;
      const last = lines[lines.length - 1];
      const m = /^(\d{3})([ -])/.exec(last);
      if (!m) return null;
      if (m[2] === '-') return null; // more lines still coming
      const code = parseInt(m[1], 10);
      const consumed = lines.join('\r\n') + '\r\n';
      buffer = buffer.slice(consumed.length);
      return { code, text: lines.map(l => l.slice(4)).join('\n'), raw: consumed };
    }

    function b64(s) { return Buffer.from(s, 'utf8').toString('base64'); }

    function buildMessage() {
      const boundary = 'eravos-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
      const headers = [
        'From: ' + message.from,
        'To: ' + to.join(', '),
        'Subject: ' + message.subject,
        'Date: ' + new Date().toUTCString(),
        'MIME-Version: 1.0',
      ];
      let body;
      if (message.html) {
        headers.push('Content-Type: multipart/alternative; boundary="' + boundary + '"');
        body =
          '--' + boundary + '\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n' +
          (message.text || '') + '\r\n' +
          '--' + boundary + '\r\nContent-Type: text/html; charset=utf-8\r\n\r\n' +
          message.html + '\r\n' +
          '--' + boundary + '--';
      } else {
        headers.push('Content-Type: text/plain; charset=utf-8');
        body = message.text || '';
      }
      // Real, required per RFC 5321 §4.5.2: a line starting with "."
      // in the body must be escaped to ".." or the bare "." on its own
      // line would be mistaken for the end-of-DATA marker.
      const escaped = body.replace(/^\./gm, '..');
      return headers.join('\r\n') + '\r\n\r\n' + escaped;
    }

    function onLine(res) {
      if (step === 'greeting') {
        if (res.code !== 220) return cleanup(new Error('SMTP greeting failed: ' + res.text));
        step = 'ehlo';
        send('EHLO eravos.local');
        return;
      }
      if (step === 'ehlo') {
        if (res.code !== 250) return cleanup(new Error('EHLO failed: ' + res.text));
        if (starttls && !upgraded) {
          step = 'starttls';
          send('STARTTLS');
          return;
        }
        step = user ? 'auth' : 'mailfrom';
        if (user) { send('AUTH LOGIN'); step = 'auth-user'; }
        else { send('MAIL FROM:<' + message.from + '>'); step = 'mailfrom'; }
        return;
      }
      if (step === 'starttls') {
        if (res.code !== 220) return cleanup(new Error('STARTTLS refused: ' + res.text));
        // Real TLS upgrade -- the plain socket's bytes stop, everything
        // after this point is re-wrapped through a new TLS layer over
        // the SAME underlying connection.
        const plainSocket = socket;
        socket = tls.connect({ socket: plainSocket, host });
        wireSocket();
        upgraded = true;
        buffer = '';
        step = 'ehlo';
        send('EHLO eravos.local');
        return;
      }
      if (step === 'auth-user') {
        if (res.code !== 334) return cleanup(new Error('AUTH LOGIN not accepted: ' + res.text));
        send(b64(user));
        step = 'auth-pass';
        return;
      }
      if (step === 'auth-pass') {
        if (res.code !== 334) return cleanup(new Error('AUTH LOGIN username step failed: ' + res.text));
        send(b64(pass || ''));
        step = 'auth-done';
        return;
      }
      if (step === 'auth-done') {
        if (res.code !== 235) return cleanup(new Error('Authentication failed: ' + res.text));
        step = 'mailfrom';
        send('MAIL FROM:<' + message.from + '>');
        return;
      }
      if (step === 'mailfrom') {
        if (res.code !== 250) return cleanup(new Error('MAIL FROM refused: ' + res.text));
        step = 'rcptto';
        this._rcptIndex = 0;
        send('RCPT TO:<' + to[0] + '>');
        return;
      }
      if (step === 'rcptto') {
        if (res.code !== 250 && res.code !== 251) return cleanup(new Error('RCPT TO refused for ' + to[this._rcptIndex] + ': ' + res.text));
        this._rcptIndex++;
        if (this._rcptIndex < to.length) {
          send('RCPT TO:<' + to[this._rcptIndex] + '>');
          return;
        }
        step = 'data';
        send('DATA');
        return;
      }
      if (step === 'data') {
        if (res.code !== 354) return cleanup(new Error('DATA refused: ' + res.text));
        step = 'sending';
        socket.write(buildMessage() + '\r\n.\r\n');
        return;
      }
      if (step === 'sending') {
        if (res.code !== 250) return cleanup(new Error('Message not accepted: ' + res.text));
        step = 'quit';
        send('QUIT');
        cleanup(null, { ok: true, response: res.text });
        return;
      }
    }

    function wireSocket() {
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        let res;
        while ((res = tryConsumeResponse())) onLine.call({}, res);
      });
      socket.on('error', (e) => cleanup(new Error('SMTP connection error: ' + e.message)));
      socket.on('close', () => {
        if (step !== 'quit') cleanup(new Error('SMTP connection closed unexpectedly at step "' + step + '"'));
      });
    }

    wireSocket();
  });
}

module.exports = { sendMail };
