// Spider-Math canvas renderer — dusk city, buildings, spider hero, webs, particles.
window.SpiderRender = (() => {
  'use strict';

  const INK = '#16121f';
  const WEB = 'rgba(255,255,255,0.95)';

  const PALETTES = [
    { body: '#8a4a52', shade: '#6d3841', roof: '#5c2f38' },
    { body: '#3f7d83', shade: '#316369', roof: '#28545a' },
    { body: '#5c5f9e', shade: '#494c82', roof: '#3c3f6e' },
  ];

  const ease = {
    inQuad: (t) => t * t,
    outQuad: (t) => t * (2 - t),
    inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
    outCubic: (t) => 1 + (t - 1) ** 3,
    outBack: (t) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2,
  };

  const lerp = (a, b, t) => a + (b - a) * t;

  function hash01(...nums) {
    let h = 2166136261;
    for (const n of nums) {
      h ^= (n + 0x9e3779b9) | 0;
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 10000) / 10000;
  }

  // ---------- Background ----------

  function drawSky(ctx, w, h, groundY, time) {
    const grad = ctx.createLinearGradient(0, 0, 0, groundY);
    grad.addColorStop(0, '#140f3c');
    grad.addColorStop(0.45, '#35216e');
    grad.addColorStop(0.72, '#7c3a72');
    grad.addColorStop(0.9, '#d96a4e');
    grad.addColorStop(1, '#ffb15e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, groundY);

    // Stars
    for (let i = 0; i < 44; i++) {
      const x = hash01(i, 1) * w;
      const y = hash01(i, 2) * groundY * 0.55;
      const r = 0.6 + hash01(i, 3) * 1.3;
      const tw = 0.45 + 0.55 * Math.abs(Math.sin(time * 1.4 + i * 1.7));
      ctx.globalAlpha = tw;
      ctx.fillStyle = '#fff6e0';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Moon
    const mx = w * 0.84;
    const my = Math.min(groundY * 0.22, 120);
    const mr = Math.min(34, 16 + w * 0.02);
    ctx.save();
    ctx.shadowColor = 'rgba(255,240,200,0.8)';
    ctx.shadowBlur = 26;
    ctx.fillStyle = '#fff3d9';
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#ead9b4';
    [[-0.3, -0.2, 0.22], [0.25, 0.15, 0.16], [-0.05, 0.35, 0.12]].forEach(([dx, dy, dr]) => {
      ctx.beginPath();
      ctx.arc(mx + dx * mr, my + dy * mr, dr * mr, 0, Math.PI * 2);
      ctx.fill();
    });

    drawSkylineLayer(ctx, w, groundY, 11, 0.36, '#221850');
    drawSkylineLayer(ctx, w, groundY, 23, 0.24, '#2d2160');
  }

  function drawSkylineLayer(ctx, w, groundY, seed, maxHFrac, color) {
    ctx.fillStyle = color;
    let x = -10;
    let i = 0;
    while (x < w + 10) {
      const bw = 30 + hash01(seed, i, 1) * 52;
      const bh = groundY * (0.08 + hash01(seed, i, 2) * maxHFrac);
      ctx.fillRect(x, groundY - bh, bw + 1, bh);
      if (hash01(seed, i, 3) > 0.6) {
        ctx.fillRect(x + bw / 2 - 1, groundY - bh - 14, 2, 14);
      }
      x += bw;
      i += 1;
    }
  }

  function drawStreet(ctx, w, h, groundY) {
    ctx.fillStyle = '#211a35';
    ctx.fillRect(0, groundY, w, h - groundY);
    ctx.fillStyle = '#4a3f6b';
    ctx.fillRect(0, groundY, w, 5);
    const midY = groundY + (h - groundY) * 0.62;
    ctx.strokeStyle = 'rgba(255,201,51,0.4)';
    ctx.lineWidth = 3;
    ctx.setLineDash([18, 16]);
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ---------- Buildings ----------

  // opts: { number, seed, hover, collapse, shakeX, glow, flip, dimmed, time }
  function drawBuilding(ctx, b, groundY, opts) {
    const pal = PALETTES[b.paletteIndex % PALETTES.length];
    const collapse = opts.collapse || 0;

    ctx.save();
    if (collapse > 0) {
      ctx.translate(b.cx, groundY);
      ctx.scale(1 - collapse * 0.08, 1 - collapse * 0.86);
      ctx.rotate(Math.sin(collapse * Math.PI * 5) * 0.03 * (1 - collapse));
      ctx.translate(-b.cx, -groundY);
    } else if (opts.shakeX) {
      ctx.translate(opts.shakeX, 0);
    }

    // Body
    ctx.fillStyle = pal.body;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.rect(b.x, b.y, b.w, groundY - b.y);
    ctx.fill();
    ctx.stroke();

    // Right-edge shading
    ctx.fillStyle = pal.shade;
    ctx.fillRect(b.x + b.w * 0.78, b.y, b.w * 0.22, groundY - b.y);

    // Roof parapet
    ctx.fillStyle = pal.roof;
    ctx.beginPath();
    ctx.rect(b.x - 5, b.y - 9, b.w + 10, 12);
    ctx.fill();
    ctx.stroke();

    drawWindows(ctx, b, groundY, opts.seed || 0);

    // Door
    const dw = Math.min(26, b.w * 0.22);
    ctx.fillStyle = '#1b1430';
    ctx.beginPath();
    ctx.moveTo(b.cx - dw / 2, groundY);
    ctx.lineTo(b.cx - dw / 2, groundY - 24);
    ctx.quadraticCurveTo(b.cx, groundY - 38, b.cx + dw / 2, groundY - 24);
    ctx.lineTo(b.cx + dw / 2, groundY);
    ctx.fill();

    drawSign(ctx, b, opts);

    if (opts.hover && !collapse) {
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(b.x, b.y - 9, b.w, groundY - b.y + 9);
      ctx.strokeStyle = '#ffc933';
      ctx.lineWidth = 4;
      ctx.strokeRect(b.x - 2, b.y - 11, b.w + 4, groundY - b.y + 13);
    }

    if (opts.dimmed) {
      ctx.fillStyle = 'rgba(20,15,60,0.45)';
      ctx.fillRect(b.x - 6, b.y - 12, b.w + 12, groundY - b.y + 12);
    }

    ctx.restore();
  }

  function drawWindows(ctx, b, groundY, seed) {
    const margin = Math.max(8, b.w * 0.08);
    const availW = b.w * 0.78 - margin * 2;
    const cols = Math.max(2, Math.floor(availW / 26));
    const winW = (availW - (cols - 1) * 7) / cols;
    const winH = winW * 1.35;
    const topStart = b.y + Math.max(52, b.w * 0.42);
    const rows = Math.floor((groundY - 46 - topStart) / (winH + 10));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const wx = b.x + margin + c * (winW + 7);
        const wy = topStart + r * (winH + 10);
        const lit = hash01(b.paletteIndex, seed, r, c) < 0.56;
        ctx.fillStyle = lit ? '#ffd98a' : '#221b3f';
        ctx.fillRect(wx, wy, winW, winH);
        if (lit) {
          ctx.fillStyle = 'rgba(255,217,138,0.25)';
          ctx.fillRect(wx - 2, wy - 2, winW + 4, winH + 4);
        }
      }
    }
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawSign(ctx, b, opts) {
    const signW = b.w * 0.8;
    const signH = Math.min(56, Math.max(38, b.w * 0.3));
    const sx = b.cx - signW / 2;
    const sy = b.y + 12;
    const flip = opts.flip || 0;
    const squashY = Math.abs(Math.cos(Math.PI * flip));

    ctx.save();
    ctx.translate(b.cx, sy + signH / 2);
    ctx.scale(opts.hover ? 1.06 : 1, squashY * (opts.hover ? 1.06 : 1));
    ctx.translate(-b.cx, -(sy + signH / 2));

    // Post connecting sign to roof
    ctx.fillStyle = INK;
    ctx.fillRect(b.cx - 3, sy - 10, 6, 12);

    if (opts.glow) {
      const pulse = 0.6 + 0.4 * Math.sin((opts.time || 0) * 9);
      ctx.shadowColor = `rgba(62,194,79,${pulse})`;
      ctx.shadowBlur = 24;
    }
    ctx.fillStyle = opts.glow ? '#e9ffe4' : '#fff8ec';
    roundRectPath(ctx, sx, sy, signW, signH, 10);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = opts.glow ? '#3ec24f' : INK;
    ctx.lineWidth = opts.glow ? 5 : 3.5;
    ctx.stroke();

    const text = String(opts.number ?? '');
    let size = signH * 0.66;
    ctx.font = `${size}px Bangers, "Comic Sans MS", sans-serif`;
    const maxW = signW - 18;
    const measured = ctx.measureText(text).width;
    if (measured > maxW) {
      size *= maxW / measured;
      ctx.font = `${size}px Bangers, "Comic Sans MS", sans-serif`;
    }
    ctx.fillStyle = opts.glow ? '#1f8a30' : '#16121f';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, b.cx, sy + signH / 2 + size * 0.06);
    ctx.restore();
  }

  // ---------- Spider hero ----------

  const POSES = {
    stand: { hip: [0, -19], sh: [0, -33], head: [0, -42], elL: [-9, -27], elR: [9, -27], haL: [-11, -19], haR: [11, -19], knL: [-5, -10], knR: [5, -10], ftL: [-6, 0], ftR: [6, 0] },
    crouch: { hip: [2, -13], sh: [-2, -25], head: [-1, -34], elL: [-10, -20], elR: [8, -18], haL: [-14, -11], haR: [12, -10], knL: [-9, -7], knR: [10, -7], ftL: [-8, 0], ftR: [8, 0] },
    swing: { hip: [0, -20], sh: [2, -33], head: [3, -42], elL: [6, -44], elR: [10, -40], haL: [8, -54], haR: [13, -50], knL: [-8, -12], knR: [-1, -10], ftL: [-14, -5], ftR: [-7, -2] },
    hang: { hip: [0, -20], sh: [1, -33], head: [1, -42], elL: [4, -44], elR: [8, -42], haL: [8, -54], haR: [11, -52], knL: [-3, -9], knR: [4, -9], ftL: [-5, 0], ftR: [5, 0] },
    cheer: { hip: [0, -19], sh: [0, -33], head: [0, -43], elL: [-11, -42], elR: [11, -42], haL: [-15, -55], haR: [15, -55], knL: [-5, -10], knR: [5, -10], ftL: [-6, 0], ftR: [6, 0] },
    fall: { hip: [0, -18], sh: [-3, -31], head: [-4, -40], elL: [-14, -36], elR: [12, -34], haL: [-20, -28], haR: [18, -26], knL: [-10, -8], knR: [11, -9], ftL: [-17, -2], ftR: [16, -3] },
    dazed: { hip: [0, -18], sh: [1, -31], head: [4, -40], elL: [-8, -25], elR: [10, -25], haL: [-9, -16], haR: [11, -16], knL: [-5, -9], knR: [6, -9], ftL: [-7, 0], ftR: [7, 0] },
  };

  function limb(ctx, from, mid, to, color, width) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = width + 2.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(from[0], from[1]);
    ctx.quadraticCurveTo(mid[0], mid[1], to[0], to[1]);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  // opts: { pose, rot, squash, scale }  — (x, y) is the feet position.
  function drawSpidey(ctx, x, y, opts = {}) {
    const p = POSES[opts.pose] || POSES.stand;
    ctx.save();
    ctx.translate(x, y);
    if (opts.scale && opts.scale !== 1) ctx.scale(opts.scale, opts.scale);
    if (opts.rot) {
      ctx.translate(0, -24);
      ctx.rotate(opts.rot);
      ctx.translate(0, 24);
    }
    if (opts.squash) {
      ctx.scale(1 + opts.squash * 0.45, 1 - opts.squash * 0.38);
    }

    // Back limbs (darker)
    limb(ctx, p.hip, [(p.hip[0] + p.knR[0]) / 2, p.knR[1]], p.ftR, '#1a3da0', 5);
    limb(ctx, p.sh, p.elR, p.haR, '#b01f1a', 4.6);

    // Torso
    ctx.strokeStyle = INK;
    ctx.lineCap = 'round';
    ctx.lineWidth = 15.5;
    ctx.beginPath();
    ctx.moveTo(p.hip[0], p.hip[1]);
    ctx.lineTo(p.sh[0], p.sh[1]);
    ctx.stroke();
    ctx.strokeStyle = '#e5352c';
    ctx.lineWidth = 12;
    ctx.stroke();
    // Blue waist
    ctx.strokeStyle = '#2456d6';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(p.hip[0], p.hip[1]);
    ctx.lineTo(lerp(p.hip[0], p.sh[0], 0.22), lerp(p.hip[1], p.sh[1], 0.22));
    ctx.stroke();

    // Front limbs
    limb(ctx, p.hip, [(p.hip[0] + p.knL[0]) / 2, p.knL[1]], p.ftL, '#2456d6', 5);
    limb(ctx, p.sh, p.elL, p.haL, '#e5352c', 4.6);

    // Head
    ctx.fillStyle = '#e5352c';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(p.head[0], p.head[1], 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Eyes
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    [[-3.6, 14], [3.6, -14]].forEach(([dx, deg]) => {
      ctx.save();
      ctx.translate(p.head[0] + dx, p.head[1] - 0.5);
      ctx.rotate((deg * Math.PI) / 180);
      ctx.beginPath();
      ctx.ellipse(0, 0, 2.6, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });

    ctx.restore();
  }

  function spideyHand(x, y, opts = {}) {
    const p = POSES[opts.pose] || POSES.stand;
    const s = opts.scale || 1;
    return { x: x + p.haL[0] * s, y: y + p.haL[1] * s };
  }

  function drawWeb(ctx, ax, ay, hx, hy) {
    const mx = (ax + hx) / 2;
    const my = (ay + hy) / 2 + Math.min(24, Math.hypot(hx - ax, hy - ay) * 0.08);
    ctx.strokeStyle = WEB;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(mx, my, hx, hy);
    ctx.stroke();
    ctx.fillStyle = WEB;
    ctx.beginPath();
    ctx.arc(ax, ay, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------- Particles & bursts ----------

  function drawParticles(ctx, particles) {
    for (const p of particles) {
      const lifeFrac = p.life / p.maxLife;
      ctx.save();
      ctx.translate(p.x, p.y);
      if (p.type === 'dust') {
        ctx.globalAlpha = 0.55 * lifeFrac;
        ctx.fillStyle = '#9a8fb8';
        ctx.beginPath();
        ctx.arc(0, 0, p.size * (1.6 - lifeFrac * 0.6), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'confetti') {
        ctx.globalAlpha = Math.min(1, lifeFrac * 2);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else if (p.type === 'debris') {
        ctx.globalAlpha = Math.min(1, lifeFrac * 1.5);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.5;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.strokeRect(-p.size / 2, -p.size / 2, p.size, p.size);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawBurst(ctx, burst, time) {
    const t = burst.t;
    const scaleIn = ease.outBack(Math.min(1, t * 3.2));
    const alpha = t > 0.72 ? Math.max(0, 1 - (t - 0.72) / 0.28) : 1;
    const r = 34 + burst.text.length * 7;

    ctx.save();
    ctx.translate(burst.x, burst.y);
    ctx.rotate(-0.09 + Math.sin(time * 2) * 0.02);
    ctx.scale(scaleIn, scaleIn);
    ctx.globalAlpha = alpha;

    ctx.beginPath();
    const spikes = 12;
    for (let i = 0; i < spikes * 2; i++) {
      const rad = i % 2 === 0 ? r : r * 0.68;
      const ang = (i / (spikes * 2)) * Math.PI * 2;
      const px = Math.cos(ang) * rad * 1.35;
      const py = Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = burst.bg || '#ffc933';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.font = '32px Bangers, "Comic Sans MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.strokeText(burst.text, 0, 2);
    ctx.fillStyle = burst.color || '#e5352c';
    ctx.fillText(burst.text, 0, 2);
    ctx.restore();
  }

  return {
    ease,
    lerp,
    hash01,
    PALETTES,
    drawSky,
    drawStreet,
    drawBuilding,
    drawSpidey,
    spideyHand,
    drawWeb,
    drawParticles,
    drawBurst,
  };
})();
