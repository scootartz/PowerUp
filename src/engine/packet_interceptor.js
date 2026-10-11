class PacketInterceptor {
  constructor() {
    this.features = {
      marker: { enabled: true, type: 'Phantom' },
      aimLag: { enabled: false, onFire: false, onScope: false },
      fastLanding: { enabled: false, spot: 'Peak' },
      fastRevive: { enabled: false },
      gloo: { enabled: false, yawDeg: 180 },
      aimpoint: { enabled: false }
    };

    this.playerState = {
      posX: 0, posY: 0, posZ: 0,
      yaw: 0, pitch: 0,
      isFiring: false,
      isScoping: false,
      health: 200,
      kills: 0
    };

    this.pawns = [];

    this.ticker = setInterval(() => this.updateGameState(), 100);
    this.ticker.unref(); // ✅ Critical fix
  }

  setFeatures(newFeatures) {
    this.features = { ...this.features, ...newFeatures };
  }

  getFeatures() {
    return this.features;
  }

  // ... نفس باقي الدوال، بس نضيف Buffer handling
  processOutboundPacket(packetType, payload) {
    const res = { type: packetType, modified: false, payload: { ...payload } };

    // ✅ Aimpoint - نحول الرصاصة إلى العنق
    if (this.features.aimpoint?.enabled && ['SHOOT', 'AIM_LOCK', 'BULLET_HIT'].includes(packetType)) {
      res.payload.targetBone = 3;
      res.payload.boneOffsetZ = 0.42;
      res.payload.criticalMultiplier = 2.5;
      res.modified = true;
    }

    // ✅ Gloo Wall Rotation
    if (this.features.gloo?.enabled && ['DEPLOY_GLOO', 'GRENADE_THROW'].includes(packetType)) {
      const offsetDeg = this.features.gloo.yawDeg || 180;
      const currentYaw = payload.yaw || this.playerState.yaw;
      res.payload.yaw = (currentYaw + offsetDeg) % 360;
      res.payload.rotationOffset = offsetDeg;
      res.modified = true;
    }

    // ✅ Fast Revive
    if (this.features.fastRevive?.enabled && packetType === 'INTERACT_REVIVE') {
      res.payload.durationMs = 100;
      res.payload.instantComplete = true;
      res.modified = true;
    }

    // ✅ Fast Landing
    if (this.features.fastLanding?.enabled && packetType === 'SKYDIVING_VECTOR') {
      res.payload.dropSpeed = 120.0;
      res.payload.targetWaypoint = this.features.fastLanding.spot || 'Peak';
      res.payload.straightDrop = true;
      res.modified = true;
    }

    return res;
  }

  processInboundPacket(packetType, payload) {
    if (this.features.aimLag?.enabled) {
      const shouldLag = (this.features.aimLag.onFire && this.playerState.isFiring) ||
                        (this.features.aimLag.onScope && this.playerState.isScoping);

      if (shouldLag && packetType === 'ENTITY_MOVEMENT_UPDATE') {
        payload.freezeMovement = true;
        payload.velocityX = 0;
        payload.velocityY = 0;
        return { modified: true, payload };
      }
    }
    return { modified: false, payload };
  }

  updateGameState() {
    for (const p of this.pawns) {
      const isAimLagActive = this.features.aimLag?.enabled && 
                             ((this.features.aimLag.onFire && this.playerState.isFiring) || 
                              (this.features.aimLag.onScope && this.playerState.isScoping));

      if (!isAimLagActive) {
        p.x += (Math.random() - 0.5) * 0.8;
        p.y += (Math.random() - 0.5) * 0.8;
        p.distance = Math.round(Math.hypot(p.x, p.y));
        p.frozen = false;
      } else {
        p.frozen = true;
      }

      p.targetedBone = this.features.aimpoint?.enabled ? 'Neck (Bone 3)' : 'Chest (Bone 2)';
      p.marker = this.features.marker?.enabled ? this.features.marker.type : null;
    }
  }

  getLiveTelemetry() {
    return {
      features: this.features,
      player: this.playerState,
      glooRotation: this.features.gloo?.enabled ? this.features.gloo.yawDeg : 0,
      aimpointActive: !!this.features.aimpoint?.enabled,
      aimLagActive: !!this.features.aimLag?.enabled,
      pawns: this.pawns
    };
  }
}

module.exports = new PacketInterceptor();
