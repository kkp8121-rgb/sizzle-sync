const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const laneColors = ['#ef6a4c', '#f5a14d', '#7ec6a5', '#65b8c6', '#ffd166'];

function roundRect(ctx, x, y, w, h, r) { const q = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + q, y); ctx.arcTo(x + w, y, x + w, y + h, q); ctx.arcTo(x + w, y + h, x, y + h, q); ctx.arcTo(x, y + h, x, y, q); ctx.arcTo(x, y, x + w, y, q); ctx.closePath(); }
function fillRound(ctx, x, y, w, h, r, color) { roundRect(ctx, x, y, w, h, r); ctx.fillStyle = color; ctx.fill(); }

export class KitchenRenderer {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.effects = []; this.flash = 0; this.lastWidth = 0; this.frame = 0;
    this.kitchen = new Image(); this.kitchen.onload = () => { this.kitchenReady = true; }; this.kitchen.onerror = () => { this.kitchenReady = false; }; this.kitchen.src = 'assets/kitchen.webp'; this.stationPulse = [0, 0, 0, 0];
    this.chef = new Image(); this.chef.onload = () => { this.chefReady = true; }; this.chef.onerror = () => { this.chefReady = false; }; this.chef.src = 'assets/chef.webp';
    this.resize();
  }
  resize() { const rect = this.canvas.getBoundingClientRect(); const dpr = Math.min(2, globalThis.devicePixelRatio || 1); const width = Math.max(320, rect.width || 960), height = Math.max(180, rect.height || 540); this.canvas.width = Math.round(width * dpr); this.canvas.height = Math.round(height * dpr); this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.width = width; this.height = height; }
  reset() { this.effects = []; this.flash = 0; this.stationPulse.fill(0); }
  addEvent(event) { if (!event) return; const type = event.type; const color = type === 'miss' || type === 'ghost' ? '#ef6a4c' : type === 'dish' ? '#ffd166' : '#f5a14d'; this.effects.push({ ...event, age: 0, color }); if (type === 'hit' || type === 'hold-end') { if (Number.isInteger(event.lane) && event.lane < 4) this.stationPulse[event.lane] = 1; this.flash = .12; } if (type === 'dish') this.flash = .24; }
  draw(run, track, now = 0, reducedMotion = false) {
    if (!this.ctx) return; if (this.width !== (this.canvas.getBoundingClientRect().width || this.width)) this.resize(); const ctx = this.ctx, w = this.width, h = this.height; this.frame++; ctx.clearRect(0, 0, w, h);
    this.drawKitchen(ctx, w, h, now, reducedMotion); this.drawHighway(ctx, w, h, run, track, now, reducedMotion); this.drawEffects(ctx, w, h, reducedMotion); this.flash = Math.max(0, this.flash - .02);
  }
  drawKitchen(ctx, w, h, t, reduced) {
    const kitchenHeight = h * .28; const gradient = ctx.createLinearGradient(0, 0, 0, kitchenHeight); gradient.addColorStop(0, '#321f27'); gradient.addColorStop(1, '#8d3c32'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, kitchenHeight);
    if (this.kitchenReady && this.kitchen.naturalWidth) { const scale = Math.max(w / this.kitchen.naturalWidth, kitchenHeight / this.kitchen.naturalHeight), dw = this.kitchen.naturalWidth * scale, dh = this.kitchen.naturalHeight * scale; ctx.save(); ctx.globalAlpha = .65; ctx.drawImage(this.kitchen, (w - dw) / 2, (kitchenHeight - dh) / 2, dw, dh); ctx.restore(); }
    else { ctx.fillStyle = '#e7b56f22'; for (let x = 0; x < w; x += 54) ctx.fillRect(x, 0, 1, kitchenHeight); }
    ctx.fillStyle = '#f1b56f'; ctx.fillRect(0, kitchenHeight - 7, w, 7);
    // Four compact stations make each ingredient lane feel like a real action.
    const stations = ['CHOP', 'FRY', 'FLIP', 'SEASON']; this.stationPulse = this.stationPulse.map(value => Math.max(0, value - (reduced ? .035 : .07)));
    for (let i = 0; i < 4; i++) { const x = w * .76 / 4 * (i + .5), y = kitchenHeight * .77, pulse = this.stationPulse[i]; ctx.save(); ctx.translate(x, y); ctx.globalAlpha = .9; ctx.strokeStyle = laneColors[i]; ctx.fillStyle = laneColors[i]; ctx.lineWidth = 3;
      if (i === 0) { ctx.strokeRect(-24, -10, 48, 14); ctx.rotate(-.2 - pulse * .3); ctx.beginPath(); ctx.moveTo(-13, -25); ctx.lineTo(22, 10); ctx.stroke(); }
      else if (i === 1) { ctx.beginPath(); ctx.ellipse(0, 0, 27, 9, 0, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.moveTo(24, 0); ctx.lineTo(52, -10); ctx.stroke(); if (pulse) { ctx.beginPath(); ctx.moveTo(-8, 12); ctx.quadraticCurveTo(0, -8 - pulse * 22, 9, 12); ctx.stroke(); } }
      else if (i === 2) { ctx.beginPath(); ctx.arc(0, 1, 22, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); ctx.beginPath(); ctx.arc(-8 + pulse * 12, -16 - pulse * 9, 4, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(9 + pulse * 8, -12 - pulse * 13, 3, 0, TAU); ctx.fill(); }
      else { ctx.strokeStyle = '#fff1cf'; ctx.strokeRect(-10, -22, 20, 25); for (let dot = 0; dot < 4; dot++) { ctx.beginPath(); ctx.arc(-12 + dot * 8, 12 + pulse * 20, 2, 0, TAU); ctx.fill(); } }
      ctx.restore(); ctx.fillStyle = '#fff1cfaa'; ctx.font = '700 8px Arial'; ctx.textAlign = 'center'; ctx.fillText(stations[i], x, kitchenHeight - 12); }
    ctx.textAlign = 'left'; ctx.letterSpacing = '0px';
  }
  drawHighway(ctx, w, h, run, track, t, reduced) {
    const top = h * .28, bottom = h * .98, ingredientWidth = w * .76, ingredientGap = ingredientWidth / 4, serveCenter = w * .88, targetY = bottom - 42, laneW = Math.min(130, ingredientGap * .78), approach = Math.max(2, track?.approachSeconds || 2.6), pxPerSecond = (targetY - top) / approach;
    ctx.fillStyle = '#211b22'; ctx.fillRect(0, top, w, h - top); ctx.fillStyle = '#2c242b'; ctx.fillRect(0, top, w, 3);
    for (let i = 0; i < 4; i++) { const x = ingredientGap * (i + .5); ctx.fillStyle = '#332a30'; ctx.fillRect(x - laneW / 2, top, laneW, h - top); ctx.strokeStyle = '#ffffff0d'; ctx.lineWidth = 1; ctx.strokeRect(x - laneW / 2, top, laneW, h - top); }
    const serveW = Math.max(54, w * .205); ctx.fillStyle = '#513d28'; ctx.fillRect(serveCenter - serveW / 2, top, serveW, h - top); ctx.strokeStyle = '#d99c4d88'; ctx.strokeRect(serveCenter - serveW / 2, top, serveW, h - top);
    const beatSeconds = 60 / (track?.bpm || 108), firstBeat = Math.floor(t / beatSeconds);
    for (let beat = firstBeat; beat < firstBeat + 8; beat++) { const y = targetY - (beat * beatSeconds - t) * pxPerSecond; if (y < top || y > targetY) continue; ctx.fillStyle = beat % 4 === 0 ? '#fff3d021' : '#fff3d00b'; ctx.fillRect(0, y, w, 1); }
    for (let lane = 0; lane < 5; lane++) { const x = lane === 4 ? serveCenter : ingredientGap * (lane + .5); ctx.globalAlpha = run?.held?.[lane] ? .45 : .1; fillRound(ctx, x - (lane === 4 ? serveW : 48) / 2, targetY - 20, lane === 4 ? serveW : 48, 40, 8, laneColors[lane]); } ctx.globalAlpha = 1;
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 3; ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 12; ctx.beginPath(); ctx.moveTo(0, targetY); ctx.lineTo(w, targetY); ctx.stroke(); ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff3d0'; ctx.font = '700 10px Arial'; ctx.textAlign = 'right'; ctx.fillText('TARGET / SERVE BEAT', w - 18, targetY - 10); ctx.textAlign = 'left';
    const notes = run?.notes || track?.notes || []; ctx.save(); ctx.beginPath(); ctx.rect(0, top, w, h - top); ctx.clip(); for (const note of notes) { if (!note || note.status === 'hit' || note.status === 'miss') continue; const x = note.lane === 4 ? serveCenter : ingredientGap * (note.lane + .5), travelY = targetY - (note.at - (run?.time || 0)) * pxPerSecond, isServe = note.type === 'serve', hold = Number(note.duration) > .12, y = note.status === 'holding' && hold ? targetY : travelY; if (y < top - 90 || y > h + 30) continue; const color = laneColors[note.lane] || laneColors[0];
      ctx.save(); ctx.globalAlpha = note.status === 'holding' ? .9 : 1; if (hold) { const tailY = note.status === 'holding' ? targetY - Math.max(0, note.at + note.duration - t) * pxPerSecond : y - note.duration * pxPerSecond; ctx.fillStyle = color + '88'; fillRound(ctx, x - 10, Math.max(top, tailY), 20, Math.max(4, y - Math.max(top, tailY)), 9, ctx.fillStyle); } ctx.shadowColor = color; ctx.shadowBlur = 13; if (isServe) { fillRound(ctx, x - serveW / 2, y - 16, serveW, 32, 16, color); ctx.strokeStyle = '#fff2c7'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#36252a'; ctx.font = '900 10px Arial'; ctx.textAlign = 'center'; ctx.fillText(w < 600 ? 'SPACE' : 'SPACE  ·  SERVE', x, y + 4); } else { fillRound(ctx, x - 20, y - 18, 40, 36, 8, color); ctx.fillStyle = '#2a2025'; ctx.font = '900 17px Arial'; ctx.textAlign = 'center'; ctx.fillText(['D', 'F', 'J', 'K'][note.lane] || '?', x, y + 6); } ctx.restore(); } ctx.restore();
    ctx.textAlign = 'center'; for (let i = 0; i < 4; i++) { const x = ingredientGap * (i + .5); ctx.fillStyle = '#f8edcf'; ctx.font = w < 600 ? '900 10px Arial' : '900 11px Arial'; ctx.fillText(w < 600 ? ['D', 'F', 'J', 'K'][i] : ['D  칼질', 'F  볶기', 'J  뒤집기', 'K  간하기'][i], x, h - 12); } ctx.fillStyle = '#ffd166'; ctx.font = '900 11px Arial'; ctx.fillText(w < 600 ? 'SPACE' : 'SPACE  ·  SERVE', serveCenter, h - 12); if (run && track && run.time < 4 * 60 / track.bpm) { const beat = Math.min(3, Math.max(0, Math.floor(run.time / (60 / track.bpm)))); ctx.fillStyle = '#fff1cf'; ctx.font = `900 ${Math.min(48, Math.max(24, w * .06))}px Georgia`; ctx.fillText(String(4 - beat), w * .5, top + 52); ctx.font = '700 9px Arial'; ctx.fillText('COUNT IN', w * .5, top + 70); } ctx.textAlign = 'left';
  }
  drawEffects(ctx, w, h, reduced) {
    for (const fx of this.effects) {
      fx.age += reduced ? .03 : .08; const alpha = clamp(1 - fx.age, 0, 1); ctx.save(); ctx.globalAlpha = alpha; ctx.strokeLinecap = 'round';
      if (fx.type === 'dish') {
        for (let i = 0; i < 8; i++) { const a = i * TAU / 8, r = fx.age * 45; ctx.fillStyle = i % 2 ? '#ffd166' : '#ef6a4c'; ctx.beginPath(); ctx.arc(w * .87 + Math.cos(a) * r, h * .46 + Math.sin(a) * r, 3, 0, TAU); ctx.fill(); }
        ctx.fillStyle = '#fff1cf'; ctx.font = '900 16px Arial'; ctx.textAlign = 'center'; ctx.fillText(fx.served ? '접시 완성!' : '태웠어요', w * .5, h * .09);
      } else if (fx.type === 'miss' || fx.type === 'ghost') {
        ctx.fillStyle = '#ef6a4c'; ctx.font = '900 18px Georgia'; ctx.textAlign = 'center'; ctx.fillText('SMOKE!', w * .48, h * .2 - fx.age * 12); ctx.beginPath(); ctx.arc(w * .48, h * .26 - fx.age * 20, 8 + fx.age * 9, 0, TAU); ctx.fill();
      } else if (fx.type === 'hit' || fx.type === 'hold-end' || fx.type === 'hold') {
        const lane = fx.lane ?? 2, x = lane === 4 ? w * .87 : (w * .76 / 4) * (lane + .5), y = h * .19;
        ctx.strokeStyle = fx.color; ctx.fillStyle = fx.color; ctx.lineWidth = 5;
        if (lane === 0) { // D: a decisive knife chop and diced ingredients
          ctx.beginPath(); ctx.moveTo(x - 28, y - 22 + fx.age * 18); ctx.lineTo(x + 25, y + 23); ctx.stroke(); for (let i = 0; i < 3; i++) { ctx.fillRect(x - 18 + i * 15, y + 24, 8, 8); }
        } else if (lane === 1) { // F: pan jump with a small flame under it
          ctx.beginPath(); ctx.ellipse(x, y + 16, 34, 11, 0, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + 30, y + 14); ctx.lineTo(x + 68, y - 1); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y + 34, 10, Math.PI, 0); ctx.stroke();
        } else if (lane === 2) { // J: ingredients arc over the pan
          ctx.beginPath(); ctx.arc(x, y + 22, 28, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke(); for (let i = 0; i < 3; i++) { const a = 3.4 + i * .45; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 23, y + 14 - Math.sin(a) * 18, 5, 0, TAU); ctx.fill(); }
        } else if (lane === 3) { // K: seasoning shake, falling copper specks
          ctx.save(); ctx.translate(x, y); ctx.rotate(-.42); ctx.strokeStyle = '#f8edcf'; ctx.strokeRect(-12, -25, 24, 42); ctx.restore(); for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(x - 18 + i * 9, y + 28 + (i % 2) * 10, 2.5, 0, TAU); ctx.fill(); }
        } else { // SPACE: a broad serving plate launches toward the customer
          ctx.beginPath(); ctx.ellipse(x, y + 20 + fx.age * 12, 34 + fx.age * 8, 10, 0, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y + 13 - fx.age * 28, 8, 0, TAU); ctx.fill();
        }
      }
      ctx.restore();
    }
    this.effects = this.effects.filter(fx => fx.age < 1); if (this.flash) { ctx.fillStyle = '#ffd166'; ctx.globalAlpha = this.flash * .16; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1; }
  }
  stats() { return { frames: this.frame, width: this.width, height: this.height, effects: this.effects.length }; }
}

export default KitchenRenderer;
