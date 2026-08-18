// Spider-Math game logic — round flow, swing/collapse state machine, input, HUD.
(() => {
  'use strict';

  const R = window.SpiderRender;
  const SFX = window.SFX;
  const QUESTIONS_PER_ROUND = 10;
  const START_LIVES = 3;

  const PHASE_DURATION = {
    idle: Infinity,
    aim: 0.16,
    zip: 0.14,
    swing: 0.8,
    land: 0.38,
    celebrate: 1.0,
    hopdown: 0.55,
    shake: 0.38,
    collapse: 0.85,
    reveal: 1.15,
    reset: 0.6,
    doneWin: Infinity,
    doneLose: Infinity,
  };

  const PRAISE = ['NICE!', 'THWIP!', 'WOW!', 'SUPER!', 'POW!'];
  const OUCH = ['OOPS!', 'CRUNCH!', 'UH-OH!'];

  const els = {
    canvas: document.getElementById('scene'),
    hud: document.getElementById('hud'),
    qLabel: document.getElementById('q-label'),
    questionText: document.getElementById('question-text'),
    lives: document.getElementById('lives'),
    hint: document.getElementById('hint-toast'),
    start: document.getElementById('start-screen'),
    end: document.getElementById('end-screen'),
    endTitle: document.getElementById('end-title'),
    endStars: document.getElementById('end-stars'),
    endScore: document.getElementById('end-score'),
    endMessage: document.getElementById('end-message'),
    btnHome: document.getElementById('btn-home'),
    btnSound: document.getElementById('btn-sound'),
    btnAgain: document.getElementById('btn-again'),
    btnMenu: document.getElementById('btn-menu'),
  };

  const ctx = els.canvas.getContext('2d');

  const game = {
    screen: 'start',
    grade: 1,
    round: [],
    qi: 0,
    lives: START_LIVES,
    correct: 0,
    phase: 'idle',
    t: 0,
    time: 0,
    target: -1,
    isHit: false,
    hover: -1,
    buildingNums: ['', '', ''],
    correctIndex: -1,
    collapse: [0, 0, 0],
    flipT: 1,
    failFrom: null,
    failLand: null,
    particles: [],
    burst: null,
    shakeAmp: 0,
    debrisAcc: 0,
    hintShown: false,
    starTimers: [],
  };

  function clearStarTimers() {
    game.starTimers.forEach(clearTimeout);
    game.starTimers = [];
  }

  let layout = null;

  // ---------- Layout ----------

  function computeLayout() {
    const w = els.canvas.clientWidth;
    const h = els.canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    els.canvas.width = Math.round(w * dpr);
    els.canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const groundY = h - Math.max(52, h * 0.12);
    const hudH = Math.max(els.hud.offsetHeight, Math.min(150, h * 0.26));
    const margin = Math.max(10, w * 0.03);
    const gap = Math.max(12, w * 0.03);
    const bw = Math.min((w - margin * 2 - gap * 2) / 3, 230);
    const startX = (w - (bw * 3 + gap * 2)) / 2;
    const buildable = Math.max(120, groundY - hudH - 40);

    const buildings = [0.78, 0.95, 0.66].map((frac, i) => {
      const bh = Math.max(100, buildable * frac);
      const x = startX + i * (bw + gap);
      return { x, w: bw, h: bh, y: groundY - bh, cx: x + bw / 2, paletteIndex: i };
    });

    layout = {
      w,
      h,
      groundY,
      buildings,
      homeX: w / 2,
      homeY: groundY + (h - groundY) * 0.52,
      spideyScale: Math.max(1, Math.min(1.45, Math.min(w, h) / 620)),
    };
  }

  // Building geometry, accounting for the collapse "crush" (matches render's scale).
  function roofPoint(i) {
    const b = layout.buildings[i];
    const crushH = b.h * (1 - game.collapse[i] * 0.86);
    return { x: b.cx, y: layout.groundY - crushH - 9 };
  }

  function webAnchor(i) {
    const p = roofPoint(i);
    return { x: p.x, y: p.y - 8 };
  }

  const home = () => ({ x: layout.homeX, y: layout.homeY });

  function bezier(p0, p1, p2, t) {
    const u = 1 - t;
    return {
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    };
  }

  // ---------- HUD ----------

  function renderHearts() {
    els.lives.innerHTML = '';
    for (let i = 0; i < START_LIVES; i++) {
      const span = document.createElement('span');
      span.className = 'heart' + (i < game.lives ? '' : ' lost');
      span.textContent = '❤️';
      els.lives.appendChild(span);
    }
  }

  function loseHeart() {
    game.lives -= 1;
    const heart = els.lives.children[game.lives];
    if (heart) heart.classList.add('lost', 'pop');
  }

  function loadQuestion() {
    const q = game.round[game.qi];
    game.buildingNums = q.choices;
    game.correctIndex = q.choices.indexOf(q.answer);
    els.qLabel.textContent = `Question ${game.qi + 1} of ${game.round.length}`;
    els.questionText.textContent = q.text;
  }

  // ---------- Particles ----------

  function spawnConfetti(x, y) {
    const colors = ['#e5352c', '#2456d6', '#ffc933', '#3ec24f', '#ffffff', '#ff8f3d'];
    for (let i = 0; i < 42; i++) {
      game.particles.push({
        type: 'confetti',
        x, y,
        vx: (Math.random() - 0.5) * 260,
        vy: -60 - Math.random() * 190,
        g: 340,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 12,
        size: 5 + Math.random() * 6,
        color: colors[i % colors.length],
        life: 1.1 + Math.random() * 0.5,
        maxLife: 1.6,
      });
    }
  }

  function spawnCollapseDebris(b, crushTop) {
    const pal = R.PALETTES[b.paletteIndex % R.PALETTES.length];
    game.particles.push({
      type: 'debris',
      x: b.x + Math.random() * b.w,
      y: crushTop + Math.random() * 30,
      vx: (Math.random() - 0.5) * 160,
      vy: -40 + Math.random() * 60,
      g: 620,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 9,
      size: 5 + Math.random() * 10,
      color: Math.random() < 0.5 ? pal.body : pal.shade,
      life: 0.9 + Math.random() * 0.5,
      maxLife: 1.4,
    });
    game.particles.push({
      type: 'dust',
      x: b.x + Math.random() * b.w,
      y: layout.groundY - 4 - Math.random() * 16,
      vx: (Math.random() - 0.5) * 90,
      vy: -12 - Math.random() * 26,
      g: -30,
      rot: 0,
      vr: 0,
      size: 7 + Math.random() * 13,
      color: '',
      life: 0.8 + Math.random() * 0.4,
      maxLife: 1.2,
    });
  }

  function updateParticles(dt) {
    for (const p of game.particles) {
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.life -= dt;
    }
    game.particles = game.particles.filter((p) => p.life > 0);
  }

  // ---------- Round flow ----------

  function startGame(grade) {
    game.grade = grade;
    game.round = window.SpiderQuestions.pickRound(grade, QUESTIONS_PER_ROUND);
    game.qi = 0;
    game.lives = START_LIVES;
    game.correct = 0;
    game.collapse = [0, 0, 0];
    game.particles = [];
    game.burst = null;
    game.flipT = 0;
    game.screen = 'play';
    setPhase('idle');
    els.start.classList.add('hidden');
    els.end.classList.add('hidden');
    els.hud.classList.remove('hidden');
    renderHearts();
    loadQuestion();
    computeLayout();
    try { localStorage.setItem('spidermath.grade', String(grade)); } catch (_) { /* ignore */ }
    if (!game.hintShown) {
      game.hintShown = true;
      els.hint.classList.remove('hidden');
      setTimeout(() => els.hint.classList.add('hidden'), 5000);
    }
  }

  function goHome() {
    game.screen = 'start';
    setPhase('idle');
    game.collapse = [0, 0, 0];
    game.particles = [];
    game.burst = null;
    els.hud.classList.add('hidden');
    els.end.classList.add('hidden');
    els.hint.classList.add('hidden');
    els.start.classList.remove('hidden');
  }

  function endRound(won) {
    game.screen = 'end';
    setPhase(won ? 'doneWin' : 'doneLose');
    els.hud.classList.add('hidden');
    // Unhide before populating: the stars' pop-in animation only starts
    // for elements inserted while the screen is visible.
    els.end.classList.remove('hidden');
    els.endTitle.textContent = won ? 'CITY SAVED!' : 'GAME OVER';
    els.endTitle.style.color = won ? '#3ec24f' : '#e5352c';
    clearStarTimers();
    els.endStars.innerHTML = '';
    if (won) {
      // Staggered so the stars appear one by one.
      for (let i = 0; i < game.lives; i++) {
        game.starTimers.push(setTimeout(() => {
          if (game.screen !== 'end') return;
          const s = document.createElement('span');
          s.textContent = '⭐';
          els.endStars.appendChild(s);
        }, 350 + i * 280));
      }
    } else {
      els.endStars.textContent = '💥';
    }
    els.endScore.textContent = `You solved ${game.correct} of ${game.round.length}!`;
    els.endMessage.textContent = won
      ? (game.lives === START_LIVES
        ? 'PERFECT! Real superhero math skills!'
        : game.lives === 2 ? 'Awesome swinging, hero!' : 'Phew — that was a close one!')
      : 'The city still needs you. Swing again, hero!';
    if (won) SFX.win(); else SFX.lose();
  }

  function select(i) {
    if (game.screen !== 'play' || game.phase !== 'idle') return;
    game.target = i;
    game.isHit = i === game.correctIndex;
    game.hover = -1;
    els.hint.classList.add('hidden');
    els.canvas.style.cursor = 'default';
    setPhase('aim');
  }

  function setPhase(name) {
    game.phase = name;
    game.t = 0;
  }

  function onPhaseEnd() {
    switch (game.phase) {
      case 'aim':
        setPhase('zip');
        SFX.thwip();
        break;
      case 'zip':
        setPhase('swing');
        SFX.whoosh();
        break;
      case 'swing':
        if (game.isHit) {
          setPhase('land');
          onCorrectLanding();
        } else {
          setPhase('shake');
          SFX.wrong();
        }
        break;
      case 'land':
        setPhase('celebrate');
        break;
      case 'celebrate':
        if (game.qi + 1 >= game.round.length) endRound(true);
        else nextQuestion('hopdown');
        break;
      case 'hopdown':
        setPhase('idle');
        break;
      case 'shake':
        setPhase('collapse');
        onCollapseStart();
        break;
      case 'collapse':
        setPhase('reveal');
        break;
      case 'reveal':
        if (game.lives <= 0) endRound(false);
        else if (game.qi + 1 >= game.round.length) endRound(true);
        else nextQuestion('reset');
        break;
      case 'reset':
        setPhase('idle');
        break;
      default:
        break;
    }
  }

  function nextQuestion(phaseName) {
    game.qi += 1;
    loadQuestion();
    game.flipT = 0;
    setPhase(phaseName);
  }

  function onCorrectLanding() {
    game.correct += 1;
    const p = roofPoint(game.target);
    spawnConfetti(p.x, p.y - 20);
    const dir = p.x <= layout.w / 2 ? 1 : -1;
    game.burst = {
      text: PRAISE[Math.floor(Math.random() * PRAISE.length)],
      x: p.x + dir * Math.min(150, layout.w * 0.17),
      y: Math.max(90, p.y - 26),
      t: 0,
      bg: '#ffc933',
      color: '#e5352c',
    };
    SFX.correct();
  }

  function onCollapseStart() {
    loseHeart();
    SFX.crash();
    game.shakeAmp = 9;
    game.failFrom = roofPoint(game.target);
    const b = layout.buildings[game.target];
    const dir = Math.sign(layout.homeX - b.cx) || 1;
    game.failLand = { x: b.cx + dir * (b.w * 0.5 + 30), y: layout.homeY };
    game.burst = {
      text: OUCH[Math.floor(Math.random() * OUCH.length)],
      x: b.cx + dir * Math.min(150, layout.w * 0.17),
      y: Math.max(90, b.y - 40),
      t: 0,
      bg: '#e5352c',
      color: '#fff8ec',
    };
  }

  // ---------- Per-frame update ----------

  function update(dt) {
    game.time += dt;
    game.t += dt;
    if (game.flipT < 1) game.flipT = Math.min(1, game.flipT + dt / 0.45);
    if (game.shakeAmp > 0) game.shakeAmp = Math.max(0, game.shakeAmp - dt * 14);
    updateParticles(dt);
    if (game.burst) {
      game.burst.t += dt / 1.05;
      if (game.burst.t >= 1) game.burst = null;
    }

    if (game.phase === 'collapse') {
      const p = Math.min(1, game.t / PHASE_DURATION.collapse);
      game.collapse[game.target] = R.ease.inQuad(p);
      game.debrisAcc += dt * 26;
      const b = layout.buildings[game.target];
      while (game.debrisAcc >= 1 && game.particles.length < 220) {
        game.debrisAcc -= 1;
        spawnCollapseDebris(b, roofPoint(game.target).y);
      }
      game.shakeAmp = Math.max(game.shakeAmp, 5 * (1 - p));
    } else if (game.phase === 'reset') {
      const p = Math.min(1, game.t / PHASE_DURATION.reset);
      game.collapse[game.target] = 1 - R.ease.outCubic(p);
      if (p >= 1) game.collapse[game.target] = 0;
    }

    const dur = PHASE_DURATION[game.phase];
    if (Number.isFinite(dur) && game.t >= dur) onPhaseEnd();
  }

  // Spidey's current position/pose, derived fresh each frame (safe across resizes).
  function spideyState() {
    const h = home();
    const t = Number.isFinite(PHASE_DURATION[game.phase])
      ? Math.min(1, game.t / PHASE_DURATION[game.phase])
      : 0;

    switch (game.phase) {
      case 'aim':
        return { x: h.x, y: h.y, pose: 'crouch' };
      case 'zip':
        return { x: h.x, y: h.y, pose: 'swing' };
      case 'swing': {
        const target = roofPoint(game.target);
        const p0 = h;
        const p2 = target;
        const p1 = { x: R.lerp(p0.x, p2.x, 0.5), y: p0.y - 14 };
        const pos = bezier(p0, p1, p2, R.ease.inOutQuad(t));
        const dir = Math.sign(p2.x - p0.x) || 1;
        return { x: pos.x, y: pos.y, pose: 'swing', rot: dir * 0.5 * (1 - t) };
      }
      case 'land': {
        const p = roofPoint(game.target);
        return { x: p.x, y: p.y, pose: 'crouch', squash: Math.sin(t * Math.PI) * 0.7 };
      }
      case 'celebrate': {
        const p = roofPoint(game.target);
        const hop = Math.abs(Math.sin(t * Math.PI * 2)) * 9;
        return { x: p.x, y: p.y - hop, pose: 'cheer' };
      }
      case 'hopdown': {
        const p0 = roofPoint(game.target);
        const p1 = { x: R.lerp(p0.x, h.x, 0.5), y: Math.min(p0.y, h.y) - 60 };
        const pos = bezier(p0, p1, h, R.ease.inOutQuad(t));
        return { x: pos.x, y: pos.y, pose: t < 0.85 ? 'fall' : 'stand' };
      }
      case 'shake': {
        const p = roofPoint(game.target);
        return { x: p.x + Math.sin(game.time * 42) * 2.5, y: p.y, pose: 'hang' };
      }
      case 'collapse': {
        const from = game.failFrom || roofPoint(game.target);
        const land = game.failLand || h;
        const px = R.lerp(from.x, land.x, R.ease.outQuad(t));
        const py = R.lerp(from.y, land.y, R.ease.inQuad(t));
        return { x: px, y: py, pose: 'fall', rot: t * Math.PI * 2.5 };
      }
      case 'reveal':
      case 'doneLose':
        return { x: (game.failLand || h).x, y: (game.failLand || h).y, pose: 'dazed' };
      case 'doneWin': {
        const p = roofPoint(game.target);
        const hop = Math.abs(Math.sin(game.time * Math.PI * 2)) * 9;
        return { x: p.x, y: p.y - hop, pose: 'cheer' };
      }
      case 'reset': {
        const from = game.failLand || h;
        const p1 = { x: R.lerp(from.x, h.x, 0.5), y: Math.min(from.y, h.y) - 46 };
        const pos = bezier(from, p1, h, R.ease.inOutQuad(t));
        return { x: pos.x, y: pos.y, pose: t < 0.85 ? 'crouch' : 'stand' };
      }
      default:
        return { x: h.x, y: h.y, pose: 'stand', squash: Math.sin(game.time * 3) * 0.045 };
    }
  }

  // ---------- Render ----------

  function render() {
    const { w, h, groundY, buildings } = layout;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    if (game.shakeAmp > 0.2) {
      ctx.translate((Math.random() - 0.5) * game.shakeAmp, (Math.random() - 0.5) * game.shakeAmp);
    }

    R.drawSky(ctx, w, h, groundY, game.time);
    R.drawStreet(ctx, w, h, groundY);

    const inAction = game.phase !== 'idle';
    buildings.forEach((b, i) => {
      R.drawBuilding(ctx, b, groundY, {
        number: game.buildingNums[i],
        seed: game.qi,
        hover: game.phase === 'idle' && game.screen === 'play' && game.hover === i,
        collapse: game.collapse[i],
        shakeX: game.phase === 'shake' && i === game.target ? Math.sin(game.time * 46) * 4 : 0,
        glow: game.phase === 'reveal' && i === game.correctIndex,
        dimmed: inAction && game.screen === 'play' && i !== game.target
          && !(game.phase === 'reveal' && i === game.correctIndex),
        flip: game.flipT < 1 ? game.flipT : 0,
        time: game.time,
      });
    });

    const sp = spideyState();
    sp.scale = layout.spideyScale;

    if (game.burst) R.drawBurst(ctx, game.burst, game.time);

    if (game.phase === 'zip') {
      const anchor = webAnchor(game.target);
      const hand = R.spideyHand(sp.x, sp.y, sp);
      const p = R.ease.outQuad(Math.min(1, game.t / PHASE_DURATION.zip));
      R.drawWeb(ctx, R.lerp(hand.x, anchor.x, p), R.lerp(hand.y, anchor.y, p), hand.x, hand.y);
    } else if (game.phase === 'swing' || game.phase === 'shake') {
      const anchor = webAnchor(game.target);
      const hand = R.spideyHand(sp.x, sp.y, sp);
      R.drawWeb(ctx, anchor.x, anchor.y, hand.x, hand.y);
    }

    if (game.screen !== 'start') R.drawSpidey(ctx, sp.x, sp.y, sp);
    R.drawParticles(ctx, game.particles);

    ctx.restore();
  }

  // ---------- Input ----------

  function hitTest(x, y) {
    for (let i = 0; i < layout.buildings.length; i++) {
      const b = layout.buildings[i];
      if (x >= b.x - 6 && x <= b.x + b.w + 6 && y >= b.y - 26 && y <= layout.groundY + 8) return i;
    }
    return -1;
  }

  function canvasPos(e) {
    const rect = els.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  els.canvas.addEventListener('pointerdown', (e) => {
    const { x, y } = canvasPos(e);
    const i = hitTest(x, y);
    if (i >= 0) select(i);
  });

  els.canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || game.screen !== 'play' || game.phase !== 'idle') return;
    const { x, y } = canvasPos(e);
    game.hover = hitTest(x, y);
    els.canvas.style.cursor = game.hover >= 0 ? 'pointer' : 'default';
  });

  els.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    if (game.screen !== 'play') return;
    const idx = ['1', '2', '3'].indexOf(e.key);
    if (idx >= 0) select(idx);
  });

  document.addEventListener('pointerdown', () => SFX.unlock(), { once: true });

  // ---------- Buttons ----------

  document.querySelectorAll('.grade-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      SFX.click();
      startGame(Number(btn.dataset.grade));
    });
  });

  els.btnAgain.addEventListener('click', () => { SFX.click(); startGame(game.grade); });
  els.btnMenu.addEventListener('click', () => { SFX.click(); goHome(); });
  els.btnHome.addEventListener('click', () => { SFX.click(); goHome(); });

  function syncSoundIcon() {
    els.btnSound.textContent = SFX.muted ? '🔇' : '🔊';
  }

  els.btnSound.addEventListener('click', () => {
    SFX.toggleMuted();
    syncSoundIcon();
  });

  // ---------- Boot ----------

  window.addEventListener('resize', computeLayout);
  window.addEventListener('orientationchange', () => setTimeout(computeLayout, 120));
  if (document.fonts) {
    if (document.fonts.load) document.fonts.load('40px Bangers');
    if (document.fonts.ready) document.fonts.ready.then(() => computeLayout());
  }

  syncSoundIcon();
  computeLayout();
  renderHearts();

  // Exposed for automated testing only — not used by the game itself.
  window.__spidermath = { game, getLayout: () => layout };

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (game.screen !== 'start') update(dt);
    else game.time += dt;
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
