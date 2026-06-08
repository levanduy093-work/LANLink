const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');
const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');
const dgram = require('dgram');
const crypto = require('crypto');
const url = require('url');
const { Transform } = require('stream');

// Port configurations
let APP_PORT = 53317;
const UDP_PORT = 53317;
const MULTICAST_ADDR = '224.0.0.167';

let mainWindow;
let httpServer;
let udpSocket;
let scanTimer;
let announceTimer;
let cleanupTimer;
let pingTimer;
let userSelectedIp = null;

const device = createLocalDevice();
const devices = new Map(); // fingerprint -> device info
const pendingIncomingSessions = new Map(); // sessionId -> session object
const pendingOutgoingSessions = new Map(); // sessionId -> session object
let activeIncomingSession = null; // Currently active receive session
const activeTransfers = new Map(); // sessionId -> { type: 'send'|'receive', req, stream, peer, isPaused: false }

// --- SQLite Database Persistence ---
let db;

function initDatabase() {
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = path.join(app.getPath('userData'), 'lanlink.db');
  console.log('[SQLite] Initializing database at:', dbPath);
  db = new sqlite3.Database(dbPath);

  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      messageId TEXT UNIQUE,
      senderId TEXT,
      senderAlias TEXT,
      receiverId TEXT,
      text TEXT,
      time INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS transmissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transferId TEXT UNIQUE,
      name TEXT,
      size INTEGER,
      transferred INTEGER,
      progress REAL,
      status TEXT,
      durationMs INTEGER,
      receiverId TEXT,
      senderId TEXT,
      timestamp INTEGER,
      speedHistory TEXT
    )`);

    // Migration to add speedHistory column if it doesn't exist
    db.all("PRAGMA table_info(transmissions)", (err, rows) => {
      if (err) return;
      const hasSpeedHistory = rows.some(r => r.name === 'speedHistory');
      if (!hasSpeedHistory) {
        db.run("ALTER TABLE transmissions ADD COLUMN speedHistory TEXT", (alterErr) => {
          if (alterErr) {
            console.error('[SQLite] Error adding speedHistory column:', alterErr.message);
          } else {
            console.log('[SQLite] Successfully added speedHistory column to transmissions table');
          }
        });
      }
    });
  });
}

function saveChatMessage(msg) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Database not initialized'));
    db.run(
      `INSERT OR IGNORE INTO chat_messages (messageId, senderId, senderAlias, receiverId, text, time)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [msg.id, msg.sender.id, msg.sender.alias, msg.receiverId, msg.text, msg.time],
      function (err) {
        if (err) {
          console.error('[SQLite] Error saving chat message:', err.message);
          reject(err);
        } else {
          resolve(this.lastID);
        }
      }
    );
  });
}

function saveTransmission(trans) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Database not initialized'));
    db.run(
      `INSERT INTO transmissions (transferId, name, size, transferred, progress, status, durationMs, receiverId, senderId, timestamp, speedHistory)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(transferId) DO UPDATE SET
         transferred = excluded.transferred,
         progress = excluded.progress,
         status = excluded.status,
         durationMs = excluded.durationMs,
         speedHistory = excluded.speedHistory`,
      [
        trans.transferId,
        trans.name,
        trans.size,
        trans.transferred,
        trans.progress,
        trans.status,
        trans.durationMs || 0,
        trans.receiverId || '',
        trans.senderId || '',
        trans.timestamp || Date.now(),
        trans.speedHistory ? JSON.stringify(trans.speedHistory) : '[]'
      ],
      function (err) {
        if (err) {
          console.error('[SQLite] Error saving transmission:', err.message);
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

function deleteTransmissionFromDb(transferId) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Database not initialized'));
    db.run(`DELETE FROM transmissions WHERE transferId = ?`, [transferId], (err) => {
      if (err) {
        console.error('[SQLite] Error deleting transmission:', err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function getChatHistoryFromDb() {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Database not initialized'));
    db.all(`SELECT * FROM chat_messages ORDER BY time ASC`, (err, rows) => {
      if (err) {
        console.error('[SQLite] Error loading chat history:', err.message);
        reject(err);
      } else {
        const mapped = rows.map(r => ({
          id: r.messageId,
          sender: { id: r.senderId, alias: r.senderAlias },
          receiverId: r.receiverId,
          text: r.text,
          time: r.time
        }));
        resolve(mapped);
      }
    });
  });
}

function getTransmissionsFromDb() {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Database not initialized'));
    db.all(`SELECT * FROM transmissions ORDER BY timestamp ASC`, (err, rows) => {
      if (err) {
        console.error('[SQLite] Error loading transmissions:', err.message);
        reject(err);
      } else {
        const mapped = rows.map(r => {
          let speedHistory = [];
          try {
            speedHistory = JSON.parse(r.speedHistory || '[]');
          } catch (e) {
            console.error('[SQLite] Failed to parse speedHistory JSON:', e.message);
          }
          return {
            transferId: r.transferId,
            name: r.name,
            size: r.size,
            transferred: r.transferred,
            progress: r.progress,
            status: r.status,
            durationMs: r.durationMs,
            receiverId: r.receiverId,
            senderId: r.senderId,
            timestamp: r.timestamp,
            speedHistory: speedHistory
          };
        });
        resolve(mapped);
      }
    });
  });
}


function createLocalDevice() {
  const hostname = os.hostname();
  const id = crypto.createHash('sha256').update(`${hostname}-${Date.now()}-${Math.random()}`).digest('hex').slice(0, 16);
  return {
    id,
    name: hostname,
    alias: `${hostname} (PON)`,
    ip: '127.0.0.1',
    port: APP_PORT,
    deviceModel: os.type() === 'Darwin' ? 'macOS' : 'Windows',
    deviceType: 'desktop',
    protocol: 'http',
    download: false,
    status: 'online',
    lastSeen: Date.now()
  };
}

function getNetworkInterfaces() {
  const nets = os.networkInterfaces();
  const list = [];
  for (const [name, entries] of Object.entries(nets)) {
    // Filter out loopbacks, virtual, VPN, Docker, and other non-physical interfaces
    if (/virtual|vbox|vmnet|docker|vpn|wsl|p2p|loopback|gif|stf|bridge/i.test(name)) continue;
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        let type = 'LAN';
        if (/wl|wlan|wifi|wireless/i.test(name) || name === 'en0') {
          type = 'Wi-Fi';
        } else if (/eth|ether|lan|en[1-9]/i.test(name)) {
          type = 'LAN';
        }
        list.push({
          name,
          address: entry.address,
          netmask: entry.netmask,
          type
        });
      }
    }
  }

  // Prioritize Ethernet (LAN) then Wi-Fi
  return list.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'LAN' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function getLanIp() {
  const list = getNetworkInterfaces();
  console.log('[getLanIp] list:', list.map(i => i.address), 'userSelectedIp:', userSelectedIp);
  if (userSelectedIp && list.some(iface => iface.address === userSelectedIp)) {
    return userSelectedIp;
  }
  return list[0]?.address || '127.0.0.1';
}

function getSubnetIps(ip, netmask) {
  const ips = [];
  const ipParts = ip.split('.').map(Number);
  const maskParts = netmask.split('.').map(Number);

  if (ipParts.length !== 4 || maskParts.length !== 4) return ips;

  // We optimize for the standard /24 subnet scanning, which covers 99% of home networks.
  // This is safe, extremely fast, and avoids scanning 65k IPs on /16 subnets.
  const prefix = ipParts.slice(0, 3).join('.');
  for (let i = 1; i <= 254; i++) {
    const candidate = `${prefix}.${i}`;
    if (candidate !== ip) {
      ips.push(candidate);
    }
  }
  return ips;
}

function isSameSubnet(ip1, ip2) {
  if (!ip1 || !ip2) return false;
  const parts1 = ip1.split('.');
  const parts2 = ip2.split('.');
  if (parts1.length !== 4 || parts2.length !== 4) return false;
  return parts1[0] === parts2[0] && parts1[1] === parts2[1] && parts1[2] === parts2[2];
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function log(type, message, meta = {}) {
  sendToRenderer('lan:log', { time: Date.now(), type, message, meta });
}

function emitDevices() {
  const activeIp = getLanIp();
  log('info', `[emitDevices] activeIp: ${activeIp}, tổng số thiết bị trong bản đồ: ${devices.size}`);
  const list = Array.from(devices.values())
    .filter(d => d.id !== device.id)
    .filter(d => {
      const match = isSameSubnet(d.ip, activeIp);
      log('info', `[emitDevices] đang kiểm tra thiết bị: ${d.alias} (${d.ip}), isSameSubnet: ${match}`);
      return match;
    })
    .map(d => {
      let status = d.status;
      if (status === 'online' && Date.now() - d.lastSeen >= 12000) {
        status = 'offline';
      }
      return {
        ...d,
        status
      };
    });
  log('info', `[emitDevices] đang gửi danh sách kích thước ${list.length} tới renderer.`);
  sendToRenderer('lan:devices', list);
}

function upsertDevice(remote) {
  if (remote.id === device.id || remote.fingerprint === device.id) return;

  const activeIp = getLanIp();
  if (remote.ip && !isSameSubnet(remote.ip, activeIp)) {
    // Ignore updates from other subnets to prevent overwriting active subnet IPs
    // of multi-homed devices (e.g. Wi-Fi broadcasts overwriting LAN IPs)
    return;
  }

  const id = remote.id || remote.fingerprint;
  const current = devices.get(id) || {};
  devices.set(id, {
    ...current,
    id,
    alias: remote.alias || remote.name || 'Unknown Device',
    deviceModel: remote.deviceModel || 'Unknown',
    deviceType: remote.deviceType || 'desktop',
    ip: remote.ip,
    port: remote.port || 53317,
    protocol: remote.protocol || 'http',
    download: remote.download || false,
    lastSeen: Date.now(),
    status: 'online',
    pingFailures: 0
  });
  emitDevices();
}

// HTTP Helper to parse JSON body
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', (err) => reject(err));
  });
}

// HTTP Server implementation (LocalSend compatible)
function startHttpServer() {
  return new Promise((resolve) => {
    const tryBind = (port) => {
      httpServer = http.createServer((req, res) => {
        const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const pathname = parsedUrl.pathname;
        const method = req.method;

        // Enable CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        // Strict subnet isolation: Block HTTP requests originating from different subnets
        const clientIp = req.socket.remoteAddress.replace(/^.*:/, '');
        const activeIp = getLanIp();
        if (clientIp !== '127.0.0.1' && clientIp !== 'localhost' && !isSameSubnet(clientIp, activeIp)) {
          console.log(`[HTTP Server] Blocked request from ${clientIp} on inactive subnet (active: ${activeIp})`);
          res.writeHead(403);
          res.end('Forbidden: Subnet mismatch');
          return;
        }

        // POST /api/localsend/v2/register
        if (pathname === '/api/localsend/v2/register' && method === 'POST') {
          parseJsonBody(req).then((body) => {
            const clientIp = req.socket.remoteAddress.replace(/^.*:/, ''); // IPv4 mapping format fix
            upsertDevice({ ...body, ip: clientIp });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              alias: device.alias,
              version: '2.0',
              deviceModel: device.deviceModel,
              deviceType: device.deviceType,
              fingerprint: device.id,
              port: device.port,
              protocol: 'http',
              download: false
            }));
          }).catch(err => {
            res.writeHead(400);
            res.end('Bad Request');
          });
        }
        // GET /api/localsend/v2/info
        else if (pathname === '/api/localsend/v2/info' && method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            alias: device.alias,
            version: '2.0',
            deviceModel: device.deviceModel,
            deviceType: device.deviceType,
            fingerprint: device.id,
            port: device.port,
            protocol: 'http',
            download: false
          }));
        }
        // POST /api/localsend/v2/prepare-upload
        else if (pathname === '/api/localsend/v2/prepare-upload' && method === 'POST') {
          parseJsonBody(req).then((body) => {
            if (activeIncomingSession) {
              res.writeHead(409); // Conflict
              res.end('Another session is active');
              return;
            }

            const sender = body.info;
            const files = body.files;
            const clientIp = req.socket.remoteAddress.replace(/^.*:/, '');
            sender.ip = clientIp;

            const sessionId = crypto.randomBytes(16).toString('hex');
            const fileTokens = {};
            const filesMap = new Map();

            for (const [fileId, fileInfo] of Object.entries(files)) {
              const token = crypto.randomBytes(16).toString('hex');
              fileTokens[fileId] = token;
              filesMap.set(fileId, {
                ...fileInfo,
                token,
                received: 0,
                status: 'pending'
              });
            }

            // Check if this is a chat message (text.txt and size < 64KB)
            const isTextMessage = Object.values(files).every(f => f.fileName === 'text.txt' && f.fileType === 'text/plain' && f.size < 65536);

            if (isTextMessage) {
              // Auto-accept text messages to make chat feel instant and fluid
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                sessionId,
                files: fileTokens
              }));

              const session = {
                sessionId,
                sender,
                files: filesMap,
                res: null, // no pending HTTP response to resolve later
                fileTokens,
                isText: true
              };

              activeIncomingSession = session;
              pendingIncomingSessions.set(sessionId, session);
              return;
            }

            const session = {
              sessionId,
              sender,
              files: filesMap,
              res,
              fileTokens,
              isText: false
            };

            activeIncomingSession = session;
            pendingIncomingSessions.set(sessionId, session);

            // Notify renderer of incoming invite
            sendToRenderer('lan:invite', {
              sessionId,
              sender: {
                alias: sender.alias,
                deviceModel: sender.deviceModel,
                deviceType: sender.deviceType,
                ip: sender.ip
              },
              files: Object.values(files)
            });

            log('warning', `Yêu cầu truyền tải đến từ ${sender.alias} (${Object.keys(files).length} tệp)`);

          }).catch(err => {
            res.writeHead(400);
            res.end('Bad Request');
          });
        }
        // POST /api/localsend/v2/upload
        else if (pathname === '/api/localsend/v2/upload' && method === 'POST') {
          const sessionId = parsedUrl.searchParams.get('sessionId');
          const fileId = parsedUrl.searchParams.get('fileId');
          const token = parsedUrl.searchParams.get('token');
          const session = activeIncomingSession;

          if (!session || session.sessionId !== sessionId) {
            res.writeHead(403);
            res.end('Invalid Session');
            return;
          }

          const file = session.files.get(fileId);
          if (!file || file.token !== token) {
            res.writeHead(403);
            res.end('Invalid File Token');
            return;
          }

          // Handle in-memory chat message buffer instead of disk write
          if (session.isText) {
            let bodyBuffer = [];
            req.on('data', (chunk) => {
              bodyBuffer.push(chunk);
            });
            req.on('end', () => {
              const textContent = Buffer.concat(bodyBuffer).toString('utf8');
              
              // Emit chat:message to renderer
              sendToRenderer('chat:message', {
                id: `${Date.now()}-${Math.random()}`,
                sender: { id: session.sender.fingerprint || session.sender.id, alias: session.sender.alias },
                receiverId: device.id,
                text: textContent,
                time: Date.now()
              });
              
              // Clean up session
              activeIncomingSession = null;
              pendingIncomingSessions.delete(sessionId);
              
              res.writeHead(200);
              res.end('OK');
            });
            
            req.on('error', (err) => {
              activeIncomingSession = null;
              pendingIncomingSessions.delete(sessionId);
              res.writeHead(500);
              res.end('Error');
            });
            return;
          }

          const dir = path.join(app.getPath('downloads'), 'PONReceived');
          fs.mkdirSync(dir, { recursive: true });
          const safeName = file.fileName.replace(/[\\/:*?"<>|]/g, '_');
          const filePath = path.join(dir, `${Date.now()}-${safeName}`);

          const writeStream = fs.createWriteStream(filePath);
          file.status = 'uploading';
          file.filePath = filePath;

          let received = 0;
          let lastReportedBytes = 0;
          const startedAt = Date.now();
          let lastReportedAt = Date.now();

          activeTransfers.set(sessionId, {
            type: 'receive',
            req,
            stream: writeStream,
            peer: session.sender,
            isPaused: false,
            isCanceled: false
          });

          req.on('data', (chunk) => {
            writeStream.write(chunk);
            received += chunk.length;
            file.received = received;

            const transfer = activeTransfers.get(sessionId);
            if (transfer && transfer.isPaused) {
              return;
            }

            const now = Date.now();
            if (now - lastReportedAt >= 150) {
              const timeDiffSec = (now - lastReportedAt) / 1000 || 0.001;
              const bytesDiff = received - lastReportedBytes;
              const speedMbps = (bytesDiff * 8) / timeDiffSec / 1000000;

              lastReportedAt = now;
              lastReportedBytes = received;

              sendToRenderer('file:progress', {
                transferId: sessionId,
                receiverId: device.id,
                senderId: session.sender.fingerprint,
                name: file.fileName,
                size: file.size,
                transferred: received,
                progress: (received / file.size) * 100,
                speedMbps,
                avgSpeedMbps: (received * 8) / ((now - startedAt) / 1000 || 0.001) / 1000000,
                status: 'receiving'
              });
            }
          });

          req.on('end', () => {
            activeTransfers.delete(sessionId);
            writeStream.end();
            file.status = 'completed';
            log('success', `Đã nhận tệp: ${file.fileName}`);

            sendToRenderer('file:progress', {
              transferId: sessionId,
              receiverId: device.id,
              senderId: session.sender.fingerprint,
              name: file.fileName,
              size: file.size,
              transferred: file.size,
              progress: 100,
              speedMbps: 0,
              avgSpeedMbps: 0,
              status: 'completed',
              filePath
            });

            // Check if all files in the session are completed
            let allFinished = true;
            for (const f of session.files.values()) {
              if (f.status !== 'completed' && f.status !== 'failed') {
                allFinished = false;
                break;
              }
            }

            if (allFinished) {
              log('success', 'Tất cả các tiến trình truyền tệp đã hoàn tất');
              activeIncomingSession = null;
              pendingIncomingSessions.delete(sessionId);
            }

            res.writeHead(200);
            res.end('OK');
          });

          req.on('error', (err) => {
            const currentTransfer = activeTransfers.get(sessionId);
            if (currentTransfer && currentTransfer.isCanceled) {
              return;
            }
            activeTransfers.delete(sessionId);
            writeStream.end();
            file.status = 'failed';
            log('error', `Lỗi khi nhận tệp ${file.fileName}: ${err.message}`);
            sendToRenderer('file:progress', {
              transferId: sessionId,
              status: 'failed',
              speedMbps: 0
            });
            res.writeHead(500);
            res.end('Internal Server Error');
          });
        }
        // POST /api/localsend/v2/cancel
        else if (pathname === '/api/localsend/v2/cancel' && method === 'POST') {
          const sessionId = parsedUrl.searchParams.get('sessionId');
          const session = activeIncomingSession;

          if (session && session.sessionId === sessionId) {
             log('warning', `Yêu cầu truyền tải bị hủy từ xa`);
            activeIncomingSession = null;
            pendingIncomingSessions.delete(sessionId);
            sendToRenderer('file:progress', {
              transferId: sessionId,
              status: 'canceled',
              speedMbps: 0
            });
          }

          const transfer = activeTransfers.get(sessionId);
          if (transfer) {
            log('warning', `Tiến trình truyền tải bị hủy từ xa`);
            if (transfer.stream) {
              try { transfer.stream.destroy(); } catch (e) {}
            }
            if (transfer.req) {
              try { transfer.req.destroy(); } catch (e) {}
            }
            sendToRenderer('file:progress', {
              transferId: sessionId,
              status: 'canceled',
              speedMbps: 0
            });
            activeTransfers.delete(sessionId);
          }

          res.writeHead(200);
          res.end('OK');
        }
        // POST /api/localsend/v2/toggle-pause
        else if (pathname === '/api/localsend/v2/toggle-pause' && method === 'POST') {
          const sessionId = parsedUrl.searchParams.get('sessionId');
          const transfer = activeTransfers.get(sessionId);
          if (transfer) {
            if (transfer.type === 'send') {
              if (transfer.isPaused) {
                log('info', `Đang tiếp tục truyền tải theo yêu cầu từ máy nhận...`);
                transfer.stream.resume();
                if (transfer.resumePipeline) {
                  transfer.resumePipeline();
                }
                transfer.isPaused = false;
                sendToRenderer('file:progress', {
                  transferId: sessionId,
                  status: 'sending'
                });
              } else {
                log('info', `Đang tạm dừng truyền tải theo yêu cầu từ máy nhận...`);
                transfer.stream.pause();
                transfer.isPaused = true;
                sendToRenderer('file:progress', {
                  transferId: sessionId,
                  status: 'paused',
                  speedMbps: 0
                });
              }
            } else if (transfer.type === 'receive') {
              if (transfer.isPaused) {
                log('info', `Đang tiếp tục nhận dữ liệu theo yêu cầu từ máy gửi...`);
                transfer.req.resume();
                transfer.isPaused = false;
                sendToRenderer('file:progress', {
                  transferId: sessionId,
                  status: 'receiving'
                });
              } else {
                log('info', `Đang tạm dừng nhận dữ liệu theo yêu cầu từ máy gửi...`);
                transfer.req.pause();
                transfer.isPaused = true;
                sendToRenderer('file:progress', {
                  transferId: sessionId,
                  status: 'paused',
                  speedMbps: 0
                });
              }
            }
          }
          res.writeHead(200);
          res.end('OK');
        }
        // POST /api/webrtc/call-event
        else if (pathname === '/api/webrtc/call-event' && method === 'POST') {
          parseJsonBody(req).then((body) => {
            sendToRenderer('call:event', body);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          }).catch(err => {
            res.writeHead(400);
            res.end('Bad Request');
          });
        }
        // POST /api/webrtc/signal
        else if (pathname === '/api/webrtc/signal' && method === 'POST') {
          parseJsonBody(req).then((body) => {
            sendToRenderer('webrtc:signal', body);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          }).catch(err => {
            res.writeHead(400);
            res.end('Bad Request');
          });
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      });

      httpServer.listen(port, '0.0.0.0', () => {
        device.port = port;
        APP_PORT = port;
        log('success', `HTTP server cục bộ đang chạy trên cổng ${port}`);
        resolve(port);
      });

      httpServer.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && port < 53327) {
          log('info', `Cổng ${port} đang được sử dụng, đang thử cổng tiếp theo...`);
          tryBind(port + 1);
        } else {
          log('error', `Khởi động HTTP server thất bại: ${err.message}`);
          resolve(null);
        }
      });
    };

    tryBind(APP_PORT);
  });
}

// UDP Multicast setup
function startUdpDiscovery() {
  udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

  udpSocket.on('message', (buffer, rinfo) => {
    try {
      const msg = JSON.parse(buffer.toString());
      if (msg.fingerprint === device.id) return; // ignore self
      
      const remoteIp = rinfo.address;

      // Strict subnet isolation: Ignore UDP announcements coming from other subnets
      const activeIp = getLanIp();
      if (!isSameSubnet(remoteIp, activeIp)) {
        return;
      }

      upsertDevice({ ...msg, ip: remoteIp });

      // If the incoming packet is an active announcement request, respond back so they see us too
      if (msg.announcement === true) {
        respondToUdpAnnouncement(remoteIp, msg.port);
      }
    } catch (e) {
      // Ignore malformed packets
    }
  });

  udpSocket.on('error', (err) => {
    log('error', `Lỗi phát hiện thiết bị qua UDP: ${err.message}`);
  });

  udpSocket.bind(UDP_PORT, () => {
    try {
      udpSocket.setBroadcast(true);
      // Join multicast group on all active physical interfaces
      const interfaces = getNetworkInterfaces();
      for (const iface of interfaces) {
        try {
          udpSocket.addMembership(MULTICAST_ADDR, iface.address);
        } catch (e) {
          // Multicast join failed on this interface (e.g. not multicast-capable)
        }
      }
      log('info', 'UDP Multicast đang lắng nghe để phát hiện thiết bị');
    } catch (e) {
      log('error', `Khởi tạo UDP Multicast thất bại: ${e.message}`);
    }
  });
}

function respondToUdpAnnouncement(ip, port) {
  try {
    const payload = Buffer.from(JSON.stringify({
      alias: device.alias,
      version: '2.0',
      deviceModel: device.deviceModel,
      deviceType: device.deviceType,
      fingerprint: device.id,
      port: device.port,
      protocol: 'http',
      announcement: false
    }));

    const activeIp = getLanIp();
    const interfaces = getNetworkInterfaces();
    const activeIface = interfaces.find(iface => iface.address === activeIp);

    if (activeIface) {
      const client = dgram.createSocket('udp4');
      client.bind({ address: activeIface.address, exclusive: true }, () => {
        client.send(payload, 0, payload.length, port, ip, () => {
          client.close();
        });
      });
    }
  } catch (e) {
    // Ignore send failures
  }
}

function sendUdpAnnouncement() {
  if (!udpSocket) return;

  const payload = Buffer.from(JSON.stringify({
    alias: device.alias,
    version: '2.0',
    deviceModel: device.deviceModel,
    deviceType: device.deviceType,
    fingerprint: device.id,
    port: device.port,
    protocol: 'http',
    announcement: true
  }));

  const activeIp = getLanIp();
  const interfaces = getNetworkInterfaces();
  const activeIface = interfaces.find(iface => iface.address === activeIp);

  if (activeIface) {
    try {
      udpSocket.setMulticastInterface(activeIface.address);
      udpSocket.send(payload, 0, payload.length, UDP_PORT, MULTICAST_ADDR, (err) => {
        if (err) {
          // Ignore individual interface send errors
        }
      });
    } catch (e) {
      // Fail silently for virtual/inactive interfaces
    }
  }
}

// Active TCP Subnet Scanner
async function scanSubnets() {
  log('info', 'Bắt đầu quét mạng con qua TCP...');
  const activeIp = getLanIp();
  const interfaces = getNetworkInterfaces();
  const activeIface = interfaces.find(iface => iface.address === activeIp);

  if (!activeIface) {
    log('warning', 'Không tìm thấy giao diện hoạt động nào để quét mạng con.');
    return;
  }

  const ips = getSubnetIps(activeIface.address, activeIface.netmask);
  log('info', `Đang quét giao diện hoạt động ${activeIface.name} (${activeIface.address}) - ${ips.length} IP...`);

  const scannedIps = new Set(ips);
  const ipList = Array.from(scannedIps);
  
  // Implement a batch scanner to prevent socket exhaustion
  const concurrencyLimit = 40;
  for (let i = 0; i < ipList.length; i += concurrencyLimit) {
    const batch = ipList.slice(i, i + concurrencyLimit);
    const batchPromises = batch.map(ip => checkPeerRegistration(ip));
    await Promise.all(batchPromises);
  }
  
  log('success', 'Quét mạng con hoàn tất.');
}

function checkPeerRegistration(ip) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      alias: device.alias,
      version: '2.0',
      deviceModel: device.deviceModel,
      deviceType: device.deviceType,
      fingerprint: device.id,
      port: device.port,
      protocol: 'http',
      download: false
    });

    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(connTimeout);
      resolve();
    };

    let connTimeout;
    try {
      const req = http.request({
        hostname: ip,
        port: 53317, // default LocalSend port
        path: '/api/localsend/v2/register',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const info = JSON.parse(data);
              upsertDevice({ ...info, ip });
              log('success', `Phát hiện thiết bị qua quét mạng: ${info.alias} tại ${ip}`);
            } catch (e) {
              // Ignore JSON parsing errors
            }
          }
          done();
        });
      });

      // Custom connection timeout: destroy request if it hangs in TCP/ARP handshake for more than 2000ms
      // 2000ms is much safer to allow ARP resolution on physical networks
      connTimeout = setTimeout(() => {
        req.destroy();
        done();
      }, 2000);

      req.on('error', () => {
        done();
      });

      req.write(payload);
      req.end();
    } catch (err) {
      done();
    }
  });
}

function startPingLoop() {
  clearInterval(pingTimer);
  pingTimer = setInterval(() => {
    const onlinePeers = Array.from(devices.values()).filter(d => d.id !== device.id && d.status === 'online');
    
    onlinePeers.forEach(peer => {
      const startTime = Date.now();
      let failed = false;

      const handleFailure = (reason) => {
        if (failed) return;
        failed = true;
        clearTimeout(connTimeout);
        peer.pingFailures = (peer.pingFailures || 0) + 1;
        if ((reason === 'ECONNREFUSED' || reason === 'EHOSTUNREACH' || peer.pingFailures >= 2) && peer.status === 'online') {
          peer.status = 'offline';
          log('warning', `Thiết bị đã ngoại tuyến: ${peer.alias} (${reason})`);
          emitDevices();
        }
      };

      const req = http.request({
        hostname: peer.ip,
        port: peer.port,
        path: '/api/localsend/v2/info',
        method: 'GET'
      }, (res) => {
        res.on('data', () => {}); // Consume stream so 'end' fires
        res.on('end', () => {
          if (res.statusCode === 200) {
            clearTimeout(connTimeout);
            peer.pingFailures = 0; // reset failure counter
            const rtt = Date.now() - startTime;
            const currentRtt = peer.rtt || 0;
            const smoothed = currentRtt ? (currentRtt * 0.7) + (rtt * 0.3) : rtt;
            peer.rtt = Math.max(1, Math.round(smoothed));
            peer.lastSeen = Date.now(); // update active status
            devices.set(peer.id, peer);
            emitDevices();
          } else {
            handleFailure(`HTTP ${res.statusCode}`);
          }
        });
      });
      
      // Custom connection timeout: destroy request if it hangs in TCP/ARP handshake for more than 2000ms
      const connTimeout = setTimeout(() => {
        req.destroy();
        handleFailure('TIMEOUT');
      }, 2000);

      req.on('error', (err) => {
        handleFailure(err.code || 'error');
      });
      
      req.end();
    });
  }, 2000);
}

function startLanRuntime() {
  device.ip = getLanIp();
  device.status = 'online';
  device.lastSeen = Date.now();
  devices.set(device.id, device);

  startHttpServer().then(() => {
    startUdpDiscovery();
    
    // Broadcast announcement immediately and then periodically
    sendUdpAnnouncement();
    announceTimer = setInterval(sendUdpAnnouncement, 8000);

    // Initial subnet scan
    scanSubnets();
    scanTimer = setInterval(scanSubnets, 40000); // scan subnets every 40s

    // Start background ping loop
    startPingLoop();
  });

  // Cleanup offline devices timer and auto-detect network interface changes
  cleanupTimer = setInterval(() => {
    // Check if active IP has changed due to interface connection/disconnection
    const currentActiveIp = getLanIp();
    if (device.ip !== currentActiveIp) {
      log('info', `Thay đổi mạng: Tự động chuyển IP hoạt động từ ${device.ip} sang ${currentActiveIp}`);
      console.log(`[Network Switch] Active IP changed from ${device.ip} to ${currentActiveIp}`);
      device.ip = currentActiveIp;
      upsertDevice(device);
      sendUdpAnnouncement();
      emitDevices();
      sendToRenderer('app:interface-changed', { activeIp: currentActiveIp });
    }

    let changed = false;
    for (const [id, d] of devices.entries()) {
      if (id === device.id) continue;
      if (Date.now() - d.lastSeen > 12000 && d.status === 'online') {
        d.status = 'offline';
        changed = true;
        log('warning', `Thiết bị đã ngoại tuyến: ${d.alias}`);
      }
    }
    if (changed) emitDevices();
  }, 3000);
}

function shutdownRuntime() {
  clearInterval(announceTimer);
  clearInterval(scanTimer);
  clearInterval(cleanupTimer);
  clearInterval(pingTimer);

  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }

  if (udpSocket) {
    udpSocket.close();
    udpSocket = null;
  }

  if (db) {
    db.close((err) => {
      if (err) console.error('[SQLite] Error closing database:', err.message);
      else console.log('[SQLite] Closed database connection.');
    });
  }
}

// IPC Handlers
ipcMain.handle('db:get-chat-history', async () => {
  return getChatHistoryFromDb();
});

ipcMain.handle('db:save-chat-message', async (_event, msg) => {
  return saveChatMessage(msg);
});

ipcMain.handle('db:get-transmissions', async () => {
  return getTransmissionsFromDb();
});

ipcMain.handle('db:save-transmission', async (_event, trans) => {
  return saveTransmission(trans);
});

ipcMain.handle('db:delete-transmission', async (_event, transferId) => {
  return deleteTransmissionFromDb(transferId);
});

ipcMain.handle('app:get-info', () => ({
  id: device.id,
  name: device.alias,
  ip: getLanIp(),
  role: 'Peer',
  port: device.port,
  deviceModel: device.deviceModel
}));

ipcMain.handle('app:get-interfaces', () => getNetworkInterfaces());

ipcMain.handle('app:set-active-ip', (_event, ip) => {
  console.log('[setActiveIp] Received request to set active IP to:', ip);
  userSelectedIp = ip;
  device.ip = getLanIp();
  upsertDevice(device);
  sendUdpAnnouncement();
  emitDevices(); // Immediately filter and update nearby devices in UI
  log('info', `Đã cấu hình IP hoạt động: ${device.ip}`);
  return device.ip;
});

ipcMain.handle('dialog:pick-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'] });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  const stat = fs.statSync(filePath);
  return { path: filePath, name: path.basename(filePath), size: stat.size };
});

// IPC Accept/Decline transfer invites
ipcMain.handle('lan:accept-invite', (_event, sessionId) => {
  const session = pendingIncomingSessions.get(sessionId);
  if (!session) return { ok: false, error: 'Session not found' };

  session.res.writeHead(200, { 'Content-Type': 'application/json' });
  session.res.end(JSON.stringify({
    sessionId: session.sessionId,
    files: session.fileTokens
  }));

  log('info', `Đã chấp nhận phiên truyền tải ${sessionId}`);
  return { ok: true };
});

ipcMain.handle('lan:decline-invite', (_event, sessionId) => {
  const session = pendingIncomingSessions.get(sessionId);
  if (!session) return { ok: false, error: 'Session not found' };

  session.res.writeHead(403);
  session.res.end('Declined by receiver');

  pendingIncomingSessions.delete(sessionId);
  if (activeIncomingSession?.sessionId === sessionId) {
    activeIncomingSession = null;
  }

  log('info', `Đã từ chối phiên truyền tải ${sessionId}`);
  return { ok: true };
});

ipcMain.handle('lan:rescan', async () => {
  sendUdpAnnouncement();
  await scanSubnets();
  return { ok: true };
});

ipcMain.handle('lan:scan-custom-subnet', async (_event, prefix) => {
  log('info', `Bắt đầu quét thủ công mạng con TCP cho tiền tố ${prefix}.x...`);
  const scannedIps = [];
  for (let i = 1; i <= 254; i++) {
    scannedIps.push(`${prefix}.${i}`);
  }

  // Batch scan
  const concurrencyLimit = 40;
  for (let i = 0; i < scannedIps.length; i += concurrencyLimit) {
    const batch = scannedIps.slice(i, i + concurrencyLimit);
    const batchPromises = batch.map(ip => checkPeerRegistration(ip));
    await Promise.all(batchPromises);
  }

  log('success', `Quét thủ công mạng con ${prefix}.x hoàn tất.`);
  return { ok: true };
});

// Send file (REST based)
ipcMain.handle('file:send', async (_event, payload) => {
  const { path: filePath, targets } = payload;
  if (!targets || !targets[0]) throw new Error('No targets selected');
  const targetId = targets[0];
  const peer = devices.get(targetId);
  if (!peer) throw new Error('Peer not found or offline');

  const stat = fs.statSync(filePath);
  const fileName = path.basename(filePath);
  const fileId = crypto.randomBytes(8).toString('hex');

  log('info', `Đang bắt đầu truyền tệp ${fileName} tới ${peer.alias}...`);

  // Step 1: Prepare upload
  const preparePayload = JSON.stringify({
    info: {
      alias: device.alias,
      version: '2.0',
      deviceModel: device.deviceModel,
      deviceType: device.deviceType,
      fingerprint: device.id,
      port: device.port,
      protocol: 'http',
      download: false
    },
    files: {
      [fileId]: {
        id: fileId,
        fileName,
        size: stat.size,
        fileType: 'application/octet-stream'
      }
    }
  });

  const prepareRes = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: peer.ip,
      port: peer.port,
      path: '/api/localsend/v2/prepare-upload',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(preparePayload)
      },
      timeout: 15000 // give the receiver time to accept
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Invalid response from peer'));
          }
        } else if (res.statusCode === 403) {
          reject(new Error('Transfer declined by peer'));
        } else if (res.statusCode === 409) {
          reject(new Error('Peer is busy with another transfer'));
        } else {
          reject(new Error(`Peer rejected with code ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    req.write(preparePayload);
    req.end();
  });

  const { sessionId, files: fileTokens } = prepareRes;
  const token = fileTokens[fileId];
  if (!token) throw new Error('Receiver did not authorize the file upload');

  log('info', `Truyền tệp được phê duyệt. Bắt đầu tải lên dữ liệu...`);

  // Step 2: Upload file
  return new Promise((resolve, reject) => {
    const uploadUrl = `/api/localsend/v2/upload?sessionId=${sessionId}&fileId=${fileId}&token=${token}`;
    const fileStream = fs.createReadStream(filePath);
    
    const req = http.request({
      hostname: peer.ip,
      port: peer.port,
      path: uploadUrl,
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': stat.size
      }
    }, (res) => {
      res.on('data', () => {});
      res.on('end', () => {
        activeTransfers.delete(sessionId);
        if (res.statusCode === 200) {
          log('success', `Đã gửi tệp ${fileName} thành công`);
          sendToRenderer('file:progress', {
            transferId: sessionId,
            receiverId: targetId,
            senderId: device.id,
            name: fileName,
            size: stat.size,
            transferred: stat.size,
            progress: 100,
            speedMbps: 0,
            avgSpeedMbps: 0,
            status: 'completed'
          });
          resolve({ ok: true });
        } else {
          sendToRenderer('file:progress', {
            transferId: sessionId,
            status: 'failed',
            speedMbps: 0
          });
          reject(new Error(`Upload failed with code ${res.statusCode}`));
        }
      });
    });

    let pauseCallback = null;
    let pauseChunk = null;

    activeTransfers.set(sessionId, {
      type: 'send',
      req,
      stream: fileStream,
      peer,
      isPaused: false,
      isCanceled: false,
      resumePipeline: () => {
        if (pauseCallback) {
          const cb = pauseCallback;
          const chk = pauseChunk;
          pauseCallback = null;
          pauseChunk = null;
          cb(null, chk);
        }
      }
    });

    req.on('error', (err) => {
      const currentTransfer = activeTransfers.get(sessionId);
      if (currentTransfer && currentTransfer.isCanceled) {
        reject(err);
        return;
      }
      activeTransfers.delete(sessionId);
      fileStream.destroy();
      sendToRenderer('file:progress', {
        transferId: sessionId,
        status: 'failed',
        speedMbps: 0
      });
      reject(err);
    });

    let uploadedBytes = 0;
    let lastReportedBytes = 0;
    const startedAt = Date.now();
    let lastReportedAt = Date.now();

    const progressStream = new Transform({
      transform(chunk, encoding, callback) {
        uploadedBytes += chunk.length;
        
        const transfer = activeTransfers.get(sessionId);
        if (transfer && transfer.isPaused) {
          pauseCallback = callback;
          pauseChunk = chunk;
          return;
        }

        const now = Date.now();
        if (now - lastReportedAt >= 150) {
          const timeDiffSec = (now - lastReportedAt) / 1000 || 0.001;
          const bytesDiff = uploadedBytes - lastReportedBytes;
          const speedMbps = (bytesDiff * 8) / timeDiffSec / 1000000;

          lastReportedAt = now;
          lastReportedBytes = uploadedBytes;

          sendToRenderer('file:progress', {
            transferId: sessionId,
            receiverId: targetId,
            senderId: device.id,
            name: fileName,
            size: stat.size,
            transferred: uploadedBytes,
            progress: (uploadedBytes / stat.size) * 100,
            speedMbps,
            avgSpeedMbps: (uploadedBytes * 8) / ((now - startedAt) / 1000 || 0.001) / 1000000,
            status: 'sending'
          });
        }
        callback(null, chunk);
      }
    });

    progressStream.on('end', () => {
      req.end();
    });

    fileStream.pipe(progressStream).pipe(req);
  });
});

// Send quick text message
ipcMain.handle('chat:send', async (_event, payload) => {
  const { text, targets } = payload;
  if (!targets || !targets[0]) throw new Error('No targets selected');
  const targetId = targets[0];
  const peer = devices.get(targetId);
  if (!peer) throw new Error('Peer not found or offline');

  const textBytes = Buffer.from(text, 'utf8');
  const fileId = crypto.randomBytes(8).toString('hex');
  const fileName = 'text.txt';

  log('info', `Đang gửi tin nhắn văn bản tới ${peer.alias}...`);

  // Step 1: Prepare upload
  const preparePayload = JSON.stringify({
    info: {
      alias: device.alias,
      version: '2.0',
      deviceModel: device.deviceModel,
      deviceType: device.deviceType,
      fingerprint: device.id,
      port: device.port,
      protocol: 'http',
      download: false
    },
    files: {
      [fileId]: {
        id: fileId,
        fileName,
        size: textBytes.length,
        fileType: 'text/plain'
      }
    }
  });

  const prepareRes = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: peer.ip,
      port: peer.port,
      path: '/api/localsend/v2/prepare-upload',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(preparePayload)
      },
      timeout: 8000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Invalid response'));
          }
        } else if (res.statusCode === 403) {
          reject(new Error('Message declined by peer'));
        } else {
          reject(new Error(`Rejected with status ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.write(preparePayload);
    req.end();
  });

  const { sessionId, files: fileTokens } = prepareRes;
  const token = fileTokens[fileId];
  if (!token) throw new Error('Not authorized by peer');

  // Step 2: Upload raw text bytes
  return new Promise((resolve, reject) => {
    const uploadUrl = `/api/localsend/v2/upload?sessionId=${sessionId}&fileId=${fileId}&token=${token}`;
    const req = http.request({
      hostname: peer.ip,
      port: peer.port,
      path: uploadUrl,
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'Content-Length': textBytes.length
      }
    }, (res) => {
      res.on('data', () => {}); // Consumes the stream data so 'end' fires!
      res.on('end', () => {
        if (res.statusCode === 200) {
          // Render locally in chat history
          sendToRenderer('chat:message', {
            id: `${Date.now()}-${Math.random()}`,
            sender: { id: device.id, alias: device.alias },
            receiverId: targetId,
            text,
            time: Date.now()
          });
          resolve({ ok: true });
        } else {
          reject(new Error(`Failed to send message: ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.write(textBytes);
    req.end();
  });
});

ipcMain.handle('lan:cancel-transfer', async (_event, sessionId) => {
  const transfer = activeTransfers.get(sessionId);
  if (!transfer) return { ok: false, error: 'Transfer not found' };

  log('warning', `Đang hủy truyền tải ${sessionId} thủ công...`);
  transfer.isCanceled = true;

  // 1. Notify the remote peer of cancellation
  try {
    const peer = transfer.peer;
    const ip = peer.ip || peer.address;
    const port = peer.port || 53317;
    if (ip) {
      const cancelReq = http.request({
        hostname: ip,
        port: port,
        path: `/api/localsend/v2/cancel?sessionId=${sessionId}`,
        method: 'POST'
      }, (res) => {
        res.on('data', () => {});
      });
      cancelReq.on('error', () => {});
      cancelReq.end();
    }
  } catch (err) {
    // ignore notification error
  }

  // 2. Destroy local streams and connections
  if (transfer.stream) {
    try {
      transfer.stream.destroy();
    } catch (e) {}
  }
  if (transfer.req) {
    try {
      transfer.req.destroy();
    } catch (e) {}
  }

  // 3. Emit local status update
  sendToRenderer('file:progress', {
    transferId: sessionId,
    status: 'canceled',
    speedMbps: 0
  });

  // 4. Remove from active tracking
  activeTransfers.delete(sessionId);

  return { ok: true };
});

ipcMain.handle('lan:toggle-pause-transfer', async (_event, sessionId) => {
  const transfer = activeTransfers.get(sessionId);
  if (!transfer) return { ok: false, error: 'Transfer not found' };

  // Notify the peer of pause/resume toggle
  try {
    const peer = transfer.peer;
    const ip = peer.ip || peer.address;
    const port = peer.port || 53317;
    if (ip) {
      const toggleReq = http.request({
        hostname: ip,
        port: port,
        path: `/api/localsend/v2/toggle-pause?sessionId=${sessionId}`,
        method: 'POST'
      }, (res) => {
        res.on('data', () => {});
      });
      toggleReq.on('error', () => {});
      toggleReq.end();
    }
  } catch (e) {
    // ignore
  }

  if (transfer.isPaused) {
    // Resume
    log('info', `Đang tiếp tục truyền tải ${sessionId}...`);
    if (transfer.type === 'send') {
      transfer.stream.resume();
      if (transfer.resumePipeline) {
        transfer.resumePipeline();
      }
    } else {
      transfer.req.resume();
    }
    transfer.isPaused = false;

    sendToRenderer('file:progress', {
      transferId: sessionId,
      status: transfer.type === 'send' ? 'sending' : 'receiving'
    });
  } else {
    // Pause
    log('info', `Đang tạm dừng truyền tải ${sessionId}...`);
    if (transfer.type === 'send') {
      transfer.stream.pause();
    } else {
      transfer.req.pause();
    }
    transfer.isPaused = true;

    sendToRenderer('file:progress', {
      transferId: sessionId,
      status: 'paused',
      speedMbps: 0
    });
  }

  return { ok: true, isPaused: transfer.isPaused };
});

// Real WebRTC signaling and call event IPC Handlers
ipcMain.handle('webrtc:signal', async (_event, payload) => {
  const { signal, targetId } = payload;
  const peer = devices.get(targetId);
  if (!peer) throw new Error('Target peer not found');

  const postData = JSON.stringify({
    signal,
    senderId: device.id
  });

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: peer.ip,
      port: peer.port,
      path: '/api/webrtc/signal',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 5000
    }, (res) => {
      res.on('data', () => {});
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve({ ok: true });
        } else {
          reject(new Error(`Failed to send signal: ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
});

ipcMain.handle('call:event', async (_event, payload) => {
  const { event: callEvent, targetId, extra } = payload;
  const peer = devices.get(targetId);
  if (!peer) throw new Error('Target peer not found');

  const postData = JSON.stringify({
    event: callEvent,
    sender: {
      id: device.id,
      alias: device.alias,
      ip: device.ip,
      port: device.port,
      deviceModel: device.deviceModel,
      deviceType: device.deviceType
    },
    extra
  });

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: peer.ip,
      port: peer.port,
      path: '/api/webrtc/call-event',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 5000
    }, (res) => {
      res.on('data', () => {});
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve({ ok: true });
        } else {
          reject(new Error(`Failed to send call event: ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
});
ipcMain.handle('lan:connect-peer', async (_event, ip) => {
  // Let the user add a peer manually by IP
  const peerIp = String(ip || '').trim();
  if (!isValidIpv4(peerIp)) throw new Error('Invalid IP Address');
  
  log('info', `Đang kiểm tra thiết bị thủ công tại ${peerIp}...`);
  await checkPeerRegistration(peerIp);
  return { ok: true, ip: peerIp };
});

ipcMain.handle('lan:ping-peer', async (_event, ip) => {
  const peerIp = String(ip || '').trim();
  if (!isValidIpv4(peerIp)) throw new Error('Địa chỉ IP không hợp lệ');

  const isWin = os.platform() === 'win32';
  // Use ping -c 4 on non-windows, ping -n 4 on windows
  const pingArgs = isWin ? ['-n', '4', peerIp] : ['-c', '4', peerIp];
  const pingProc = spawn('ping', pingArgs);

  const rtts = [];
  
  // Helper to send lines to the window
  const sendPingLine = (line) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('lan:ping-line', line);
    }
  };

  let buffer = '';
  
  pingProc.stdout.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop(); // Keep the incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;
      sendPingLine(line);

      // Parse RTT from reply line
      // e.g. "64 bytes from 192.168.1.76: icmp_seq=0 ttl=64 time=1.234 ms"
      // or "Reply from 192.168.1.76: bytes=32 time=2ms TTL=64"
      // or "Reply from 192.168.1.76: bytes=32 time<1ms TTL=64"
      if (/from|Reply/i.test(line) && /time[=<]\s*([0-9.]+)/i.test(line)) {
        const match = line.match(/time[=<]\s*([0-9.]+)/i);
        if (match) {
          const rtt = parseFloat(match[1]);
          rtts.push(rtt);
        }
      }
    }
  });

  pingProc.stderr.on('data', (data) => {
    const lines = data.toString().split(/\r?\n/);
    for (const line of lines) {
      if (line.trim()) {
        sendPingLine(`ERROR: ${line}`);
      }
    }
  });

  return new Promise((resolve) => {
    pingProc.on('close', (code) => {
      // Process remaining buffer
      if (buffer.trim()) {
        sendPingLine(buffer);
        if (/from|Reply/i.test(buffer) && /time[=<]\s*([0-9.]+)/i.test(buffer)) {
          const match = buffer.match(/time[=<]\s*([0-9.]+)/i);
          if (match) {
            rtts.push(parseFloat(match[1]));
          }
        }
      }

      const sent = 4;
      const received = rtts.length;
      const lost = sent - received;
      const lossPercent = Math.round((lost / sent) * 100);

      let min = 0, max = 0, avg = 0;
      if (received > 0) {
        min = Math.min(...rtts);
        max = Math.max(...rtts);
        const sum = rtts.reduce((a, b) => a + b, 0);
        avg = Math.round((sum / received) * 10) / 10;
      }

      const stats = {
        sent,
        received,
        lost,
        lossPercent,
        rtts,
        min: Math.round(min * 10) / 10,
        max: Math.round(max * 10) / 10,
        avg
      };

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('lan:ping-done', stats);
      }

      resolve(stats);
    });
  });
});

function isValidIpv4(ip) {
  const parts = String(ip || '').trim().split('.');
  return parts.length === 4 && parts.every((part) => {
    if (!/^\d+$/.test(part)) return false;
    const value = Number(part);
    return value >= 0 && value <= 255;
  });
}

// Window creation & management
async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: '#f5f7fa',
    title: 'Hệ thống truyền dẫn quang PON',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(async () => {
  initDatabase();
  await createWindow();
  log('info', 'Ứng dụng đã khởi động');
  startLanRuntime();
});

app.on('window-all-closed', () => {
  shutdownRuntime();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
