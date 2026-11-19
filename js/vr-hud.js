/**
 * vr-hud.js – In-world 3D Interactive Exam HUD for WebXR / Meta Quest
 * Part of EXAM//SIM
 */

import * as THREE from 'three';

export class VRExamHUD {
  /**
   * @param {object} options
   * @param {THREE.Scene} options.scene
   * @param {THREE.WebGLRenderer} options.renderer
   * @param {function} options.onExitClick - callback when EXIT button is triggered
   */
  constructor({ scene, renderer, onExitClick }) {
    this.scene = scene;
    this.renderer = renderer;
    this.onExitClick = onExitClick;

    // Canvas & Texture
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 576;
    this.ctx = this.canvas.getContext('2d');

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    // Plane Mesh
    // Dimensions: ~0.85m wide x 0.48m tall
    const geometry = new THREE.PlaneGeometry(0.85, 0.48);
    const material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: true
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'VR_EXAM_HUD';

    // Position just above the desk in front of the player (desk is around z = -0.6)
    // Tilted slightly back by ~14 deg (-0.24 rad) so it faces eye level comfortably
    this.mesh.position.set(0, 1.05, -0.78);
    this.mesh.rotation.set(-0.22, 0, 0);

    // State
    this.timeString = '--:--';
    this.statusString = 'IN PROGRESS';
    this.notificationString = '';
    this.isHovered = false;
    this.visible = false;

    // Normalized exit button bounding box on the 1024x576 canvas
    // Canvas coords: [x, y, w, h]
    this.btnBounds = {
      x: 342,
      y: 430,
      w: 340,
      h: 80
    };

    // Raycaster for controller picking
    this.raycaster = new THREE.Raycaster();
    this.tempMatrix = new THREE.Matrix4();

    this.draw();
  }

  show() {
    if (!this.visible) {
      this.scene.add(this.mesh);
      this.visible = true;
      this.draw();
    }
  }

  hide() {
    if (this.visible) {
      this.scene.remove(this.mesh);
      this.visible = false;
    }
  }

  updateTime(formattedTime) {
    if (this.timeString !== formattedTime) {
      this.timeString = formattedTime;
      this.draw();
    }
  }

  setStatus(status) {
    if (this.statusString !== status) {
      this.statusString = status;
      this.draw();
    }
  }

  showNotification(message) {
    this.notificationString = message;
    this.draw();
    if (this._notifTimer) clearTimeout(this._notifTimer);
    this._notifTimer = setTimeout(() => {
      this.notificationString = '';
      this.draw();
    }, 4500);
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Background panel
    ctx.fillStyle = 'rgba(13, 17, 23, 0.94)';
    this._roundRect(ctx, 16, 16, w - 32, h - 32, 28);
    ctx.fill();

    // Subtle border
    ctx.strokeStyle = 'rgba(88, 166, 255, 0.35)';
    ctx.lineWidth = 4;
    this._roundRect(ctx, 16, 16, w - 32, h - 32, 28);
    ctx.stroke();

    // Top Brand / Session Info
    ctx.fillStyle = '#8b949e';
    ctx.font = '600 24px "IBM Plex Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('EXAM//SIM · SESSION', 54, 76);

    // Status Pill
    const isCompleted = this.statusString === 'COMPLETED';
    const isEnded = this.statusString === 'ENDED';
    const pillColor = isCompleted ? '#3fb950' : (isEnded ? '#f85149' : '#58a6ff');

    ctx.textAlign = 'right';
    ctx.fillStyle = pillColor;
    ctx.font = '700 24px "IBM Plex Mono", monospace';
    ctx.fillText(`● ${this.statusString}`, w - 54, 76);

    // Divider
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(50, 104);
    ctx.lineTo(w - 50, 104);
    ctx.stroke();

    // Countdown Display
    ctx.textAlign = 'center';
    ctx.font = '700 132px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#e6edf3';
    ctx.fillText(this.timeString, w / 2, 260);

    // Time remaining label
    ctx.font = '500 22px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#8b949e';
    ctx.fillText('TIME REMAINING', w / 2, 305);

    // Warning Banner if active
    if (this.notificationString) {
      ctx.fillStyle = 'rgba(200, 168, 75, 0.18)';
      this._roundRect(ctx, 140, 335, w - 280, 56, 14);
      ctx.fill();

      ctx.strokeStyle = '#c8a84b';
      ctx.lineWidth = 2;
      this._roundRect(ctx, 140, 335, w - 280, 56, 14);
      ctx.stroke();

      ctx.fillStyle = '#f0c65d';
      ctx.font = '600 24px "IBM Plex Mono", monospace';
      ctx.fillText(this.notificationString, w / 2, 372);
    }

    // EXIT EXAM Button
    const btn = this.btnBounds;
    ctx.fillStyle = this.isHovered ? '#ff6b63' : '#f85149';
    this._roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 14);
    ctx.fill();

    if (this.isHovered) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      this._roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 14);
      ctx.stroke();
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 32px "IBM Plex Mono", monospace';
    ctx.fillText('EXIT EXAM', w / 2, btn.y + 51);

    this.texture.needsUpdate = true;
  }

  _roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  /**
   * Check intersection from controller for raycasting
   * @param {THREE.Object3D} controller
   * @returns {boolean} whether the button was hit
   */
  checkRaycast(controller) {
    if (!this.visible || !controller) return false;

    this.tempMatrix.identity().extractRotation(controller.matrixWorld);
    this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix);

    const intersects = this.raycaster.intersectObject(this.mesh);
    let hitButton = false;

    if (intersects.length > 0) {
      const uv = intersects[0].uv;
      if (uv) {
        // Map uv (0..1) to canvas coordinates (uv.y is inverted in canvas)
        const cx = uv.x * this.canvas.width;
        const cy = (1 - uv.y) * this.canvas.height;

        const b = this.btnBounds;
        if (cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h) {
          hitButton = true;
        }
      }
    }

    if (this.isHovered !== hitButton) {
      this.isHovered = hitButton;
      this.draw();
    }

    return hitButton;
  }

  triggerSelect(controller) {
    if (!this.visible) return false;
    const hit = this.checkRaycast(controller);
    if (hit && typeof this.onExitClick === 'function') {
      this.onExitClick();
      return true;
    }
    return false;
  }
}
