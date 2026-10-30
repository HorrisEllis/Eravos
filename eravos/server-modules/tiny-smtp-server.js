'use strict';
/**
 * tiny-smtp-server.js — a real, minimal SMTP server, not a stub.
 * Accepts real SMTP connections (EHLO, MAIL FROM, RCPT TO, DATA) and
 * STORES what it receives rather than delivering it anywhere --
 * meant for local development and testing of anything that sends
 * mail (like a real invite email), so you can point Eravos at
 * 127.0.0.1 during development and see exactly what would have been
 * sent, without touching a real inbox or needing real credentials.
 *
 * This is deliberately NOT a general-purpose mail server: no queueing,
 * no relaying to other mail servers, no authentication enforcement.
 * It exists to catch and show you what your own app sent, honestly
 * scoped to that one job.
 *
 * Received messages are held in memory (capped, oldest dropped past
 * the cap) and also written to disk under dataDir/inbox/ as real
 * .eml files, so a real mail client (or just a text editor) can open
 * them.
 */

const net = require('net');
const fs = require('fs');
const path = require('path');

function startSmtpServer({ port = 2525, host = '127.0.0.1', dataDir, maxHeld = 200 } = {}) {
  const inboxDir = dataDir ? path.join(dataDir, 'inbox') : null;
  if (inboxDir) {
    try { fs.mkdirSync(inboxDir, { recursive: true }); } catch (e) {}
  }

  const held = []; // { id, from, to, subject, receivedAt, raw }

  function storeMessage(from, to, rawData) {
    const id = 'msg-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    const subjectMatch = /^Subject:\s*(.*)$/im.exec(rawData);
    const entry = {
      id, from, to: to.slice(),
      subject: subjectMatch ? subjectMatch[1].trim() : '(no subject)',
      receivedAt: Date.now(),
      raw: rawData,
    };
    held.push(entry);
    while (held.length > maxHeld) held.shift();
    if (inboxDir) {
      try { fs.writeFileSync(path.join(inboxDir, id + '.eml'), rawData); } catch (e) {}
    }
    return entry;
  }

  const server = net.createServer((socket) => {
    let from = null;
    let to = [];
    let inData = false;
    let dataBuffer = '';
    let lineBuffer = '';

    socket.write('220 eravos-tiny-smtp ready\r\n');

    socket.on('data', (chunk) => {
      lineBuffer += chunk.toString('utf8');
      let idx;
      while ((idx = lineBuffer.indexOf('\r\n')) !== -1) {
        const line = lineBuffer.slice(0, idx);
        lineBuffer = lineBuffer.slice(idx + 2);
        handleLine(line);
      }
    });

    function handleLine(line) {
      if (inData) {
        if (line === '.') {
          inData = false;
          const entry = storeMessage(from, to, dataBuffer);
          socket.write('250 OK id=' + entry.id + '\r\n');
          from = null; to = [];
          return;
        }
        dataBuffer += (line.startsWith('..') ? line.slice(1) : line) + '\r\n';
        return;
      }

      const cmd = line.split(' ')[0].toUpperCase();
      if (cmd === 'EHLO' || cmd === 'HELO') {
        socket.write('250-eravos-tiny-smtp\r\n250 OK\r\n');
      } else if (cmd === 'MAIL') {
        const m = /FROM:<([^>]*)>/i.exec(line);
        from = m ? m[1] : '(unknown)';
        socket.write('250 OK\r\n');
      } else if (cmd === 'RCPT') {
        const m = /TO:<([^>]*)>/i.exec(line);
        if (m) to.push(m[1]);
        socket.write('250 OK\r\n');
      } else if (cmd === 'DATA') {
        if (!from || !to.length) { socket.write('503 need MAIL FROM and RCPT TO first\r\n'); return; }
        inData = true;
        dataBuffer = '';
        socket.write('354 end with <CRLF>.<CRLF>\r\n');
      } else if (cmd === 'RSET') {
        from = null; to = []; inData = false; dataBuffer = '';
        socket.write('250 OK\r\n');
      } else if (cmd === 'QUIT') {
        socket.write('221 bye\r\n');
        socket.end();
      } else if (cmd === 'NOOP') {
        socket.write('250 OK\r\n');
      } else {
        socket.write('502 command not implemented\r\n');
      }
    }

    socket.on('error', () => {});
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, host, () => {
      resolve({
        server, port, host, held,
        getInbox: () => held.slice().reverse(),
        getMessage: (id) => held.find(m => m.id === id) || null,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

module.exports = { startSmtpServer };
