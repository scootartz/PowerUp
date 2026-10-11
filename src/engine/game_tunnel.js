const dgram = require('dgram');
const interceptor = require('./packet_interceptor');

// Real UDP Game Proxy & Tunnel Service
class GameTunnelService {
  constructor(port = 15000) {
    this.port = port;
    this.server = null;
    this.isRunning = false;
    
    // Map: clientAddr -> { target: {host, port}, lastSeen }
    this.sessions = new Map();
    
    // Default game server (Free Fire)
    this.defaultTarget = {
      host: 'ff-server.garena.com', // غيّره للسيرفر الفعلي
      port: 10001
    };
    
    this.stats = {
      packetsReceived: 0,
      packetsSent: 0,
      packetsModified: 0,
      bytesIn: 0,
      bytesOut: 0,
      aimpointOverrides: 0,
      glooRotations: 0,
      reviveAccelerations: 0
    };
  }

  start() {
    if (this.isRunning) return;

    try {
      this.server = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      this.server.on('message', (msg, rinfo) => {
        this.stats.packetsReceived++;
        this.stats.bytesIn += msg.length;

        const clientKey = `${rinfo.address}:${rinfo.port}`;
        
        // Get or create session
        let session = this.sessions.get(clientKey);
        if (!session) {
          session = {
            client: rinfo,
            target: { ...this.defaultTarget },
            createdAt: Date.now(),
            lastSeen: Date.now()
          };
          this.sessions.set(clientKey, session);
          console.log(`[+] New session: ${clientKey} -> ${session.target.host}:${session.target.port}`);
        }
        session.lastSeen = Date.now();

        // Parse packet type
        const packetType = this.detectPacketType(msg);

        // Process outbound packet
        const intercepted = interceptor.processOutboundPacket(packetType, {
          rawLen: msg.length,
          raw: msg
        });

        let finalPacket = msg;
        if (intercepted.modified) {
          this.stats.packetsModified++;
          if (packetType === 'SHOOT') this.stats.aimpointOverrides++;
          if (packetType === 'DEPLOY_GLOO') this.stats.glooRotations++;
          if (packetType === 'INTERACT_REVIVE') this.stats.reviveAccelerations++;
          
          // Apply modifications (لازم تكون الحزمة Buffer)
          if (intercepted.payload.buffer) {
            finalPacket = intercepted.payload.buffer;
          }
        }

        // Forward to target server
        this.server.send(finalPacket, 0, finalPacket.length, session.target.port, session.target.host, (err) => {
          if (!err) {
            this.stats.packetsSent++;
            this.stats.bytesOut += finalPacket.length;
          }
        });
      });

      this.server.on('listening', () => {
        const address = this.server.address();
        this.isRunning = true;
        console.log(`[+] POWER UP Game Tunnel active on UDP port ${address.port}`);
      });

      this.server.on('error', (err) => {
        console.error('[!] Tunnel socket error:', err.message);
      });

      this.server.bind(this.port);

      // Cleanup stale sessions every 60s
      this.cleanupTimer = setInterval(() => {
        const now = Date.now();
        for (const [key, session] of this.sessions.entries()) {
          if (now - session.lastSeen > 120000) {
            this.sessions.delete(key);
          }
        }
      }, 60000);
      this.cleanupTimer.unref();

    } catch (e) {
      console.error('[!] Failed to bind tunnel socket:', e.message);
    }
  }

  detectPacketType(msg) {
    if (msg.length < 4) return 'UNKNOWN';
    const typeId = msg[0];
    const map = {
      0x10: 'SHOOT',
      0x20: 'DEPLOY_GLOO',
      0x30: 'INTERACT_REVIVE',
      0x40: 'SKYDIVING_VECTOR',
      0x50: 'ENTITY_MOVEMENT_UPDATE',
      0x60: 'AIM_LOCK',
      0x70: 'BULLET_HIT'
    };
    return map[typeId] || 'GAME_DATA';
  }

  stop() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    if (this.server) {
      this.server.close();
      this.isRunning = false;
    }
  }

  getStats() {
    return {
      running: this.isRunning,
      port: this.port,
      activeSessions: this.sessions.size,
      ...this.stats
    };
  }
}

module.exports = new GameTunnelService();
