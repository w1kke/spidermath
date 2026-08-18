// Spider-Math sound effects — synthesized with WebAudio, no audio files needed.
window.SFX = (() => {
  'use strict';

  let ctx = null;
  let master = null;
  let muted = false;

  try {
    muted = localStorage.getItem('spidermath.muted') === '1';
  } catch (_) { /* storage unavailable — sound just defaults to on */ }

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  function tone({ f0, f1 = 0, dur = 0.15, type = 'square', vol = 0.9, delay = 0 }) {
    if (muted || !ensure()) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 > 0) osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise({ dur = 0.3, vol = 0.8, f = 1000, f1 = 0, q = 1, type = 'bandpass', delay = 0 }) {
    if (muted || !ensure()) return;
    const t0 = ctx.currentTime + delay;
    const len = Math.ceil(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(f, t0);
    if (f1 > 0) filter.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
  }

  return {
    unlock() { ensure(); },
    get muted() { return muted; },
    toggleMuted() {
      muted = !muted;
      try { localStorage.setItem('spidermath.muted', muted ? '1' : '0'); } catch (_) { /* ignore */ }
      return muted;
    },
    click() { tone({ f0: 700, f1: 900, dur: 0.06, type: 'triangle', vol: 0.5 }); },
    thwip() {
      noise({ dur: 0.09, f: 2600, f1: 4200, q: 2, vol: 0.7 });
      tone({ f0: 850, f1: 1500, dur: 0.07, type: 'sine', vol: 0.35 });
    },
    whoosh() { noise({ dur: 0.5, f: 420, f1: 1400, q: 0.8, vol: 0.5 }); },
    correct() {
      tone({ f0: 523, dur: 0.13, type: 'triangle' });
      tone({ f0: 659, dur: 0.13, type: 'triangle', delay: 0.11 });
      tone({ f0: 784, dur: 0.22, type: 'triangle', delay: 0.22 });
    },
    wrong() {
      tone({ f0: 240, f1: 170, dur: 0.22, type: 'sawtooth', vol: 0.55 });
      tone({ f0: 180, f1: 120, dur: 0.3, type: 'sawtooth', vol: 0.55, delay: 0.18 });
    },
    crash() {
      noise({ dur: 0.7, f: 320, f1: 90, q: 0.6, type: 'lowpass', vol: 1 });
      tone({ f0: 90, f1: 38, dur: 0.65, type: 'sawtooth', vol: 0.7 });
    },
    win() {
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ f0: f, dur: 0.16, type: 'triangle', delay: i * 0.12 }));
    },
    lose() {
      [392, 330, 262, 196].forEach((f, i) => tone({ f0: f, dur: 0.24, type: 'triangle', vol: 0.6, delay: i * 0.2 }));
    },
  };
})();
