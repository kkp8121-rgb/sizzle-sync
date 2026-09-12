const SETTINGS_KEY = 'sizzle-sync.audio.v1';
function clamp(value, min, max) { return Math.max(min, Math.min(max, Number(value) || 0)); }

export class KitchenAudio {
  constructor() {
    this.context = null; this.master = null; this.track = null; this.anchor = null; this.cursor = 0;
    this.paused = false; this.pausedAt = 0; this.muted = false; this.volume = .22; this.sources = []; this.noise = null;
    Object.defineProperty(this, 'timeAnchor', { enumerable: true, get: () => this.anchor });
    try { const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); this.muted = !!saved.muted; this.volume = clamp(saved.volume ?? .22, 0, 1); } catch (_) {}
  }

  async unlock() {
    if (!this.context) {
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextClass) return false;
      try {
        this.context = new AudioContextClass(); this.master = this.context.createGain(); this.master.gain.value = this.muted ? 0 : this.volume; this.master.connect(this.context.destination);
        this.noise = this.context.createBuffer(1, Math.floor(this.context.sampleRate * .35), this.context.sampleRate);
        const data = this.noise.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      } catch (_) { this.context = null; this.master = null; return false; }
    }
    try { await this.context.resume(); } catch (_) { return false; }
    return true;
  }

  async start(track) {
    if (!track || !(await this.unlock())) return false;
    this.stop(); this.track = track; this.paused = false; this.pausedAt = 0; this.cursor = 0; this.anchor = this.context.currentTime + .15; this.schedule(); return true;
  }

  now() {
    if (!this.context || this.anchor === null) return 0;
    return this.paused ? this.pausedAt : this.context.currentTime - this.anchor;
  }

  async pause() {
    if (!this.context || this.paused) return;
    this.pausedAt = Math.max(0, this.now()); this.paused = true;
    try { await this.context.suspend(); } catch (_) {}
  }

  async resume() {
    if (!this.context || !this.paused) return;
    try { await this.context.resume(); } catch (_) { return; }
    this.anchor = this.context.currentTime - this.pausedAt; this.paused = false; this.schedule();
  }

  stop() {
    for (const entry of this.sources.splice(0)) { try { entry.source.stop(); } catch (_) {} for (const node of entry.nodes) { try { node.disconnect(); } catch (_) {} } }
    this.track = null; this.anchor = null; this.cursor = 0; this.paused = false; this.pausedAt = 0;
  }

  setMuted(muted) {
    this.muted = !!muted; this.persist();
    if (this.master && this.context) { try { this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.context.currentTime, .035); } catch (_) {} }
  }

  setVolume(value) {
    this.volume = clamp(value, 0, 1); this.persist();
    if (this.master && this.context) { try { this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.context.currentTime, .035); } catch (_) {} }
  }

  persist() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ muted: this.muted, volume: this.volume })); } catch (_) {} }

  update() { if (this.context && this.track && !this.paused) this.schedule(); }

  schedule() {
    if (!this.context || !this.track || this.paused || !Array.isArray(this.track.music?.events)) return;
    const beatSeconds = 60 / this.track.bpm, current = this.context.currentTime, horizon = current + .25, events = this.track.music.events;
    while (this.cursor < events.length) {
      const event = events[this.cursor], when = this.anchor + event.beat * beatSeconds;
      if (when > horizon) break;
      this.cursor++;
      if (when < current - .08 || when > this.anchor + this.track.duration + 1) continue;
      this.scheduleEvent(event, when);
    }
  }

  scheduleEvent(event, when) {
    const velocity = clamp(event.velocity ?? .1, 0, .3), pan = clamp(event.pan ?? 0, -1, 1);
    if (event.type === 'count') this.voice(event.value || 880, when, event.duration || .1, 'sine', velocity, pan, 5000);
    else if (event.type === 'drum' || event.type === 'kick' || event.type === 'snare' || event.type === 'hat') this.drum(when, event.value || (event.type === 'kick' ? 86 : 180), velocity, pan, event.type);
    else if (event.type === 'cue') this.voice(event.value || 440, when, event.duration || .08, event.lane === 4 ? 'sine' : 'triangle', velocity, pan, event.lane === 4 ? 4200 : 3000);
    else if (event.type === 'bass') this.voice((event.value || 110), when, event.duration || .35, 'triangle', velocity, pan, 900);
    else if (event.type === 'melody') this.voice((event.value || 440), when, event.duration || .25, 'triangle', velocity, pan, 2800);
    else if (event.type === 'chord') {
      const tones = Array.isArray(event.tones) && event.tones.length ? event.tones : [event.value || 220];
      tones.forEach((tone, index) => this.voice(tone, when, event.duration || 2, 'sine', velocity / tones.length, (index - (tones.length - 1) / 2) * .28, 1800 + index * 280));
    }
  }

  voice(frequency, when, duration, type, volume, pan = 0, filterHz = 3000) {
    if (!this.context || !this.master || this.muted) return;
    try {
      const oscillator = this.context.createOscillator(), gain = this.context.createGain(), filter = this.context.createBiquadFilter();
      const panner = this.context.createStereoPanner ? this.context.createStereoPanner() : null;
      oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, when); filter.type = 'lowpass'; filter.frequency.setValueAtTime(filterHz, when);
      gain.gain.setValueAtTime(.0001, when); gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), when + .012); gain.gain.exponentialRampToValueAtTime(.0001, when + duration);
      if (panner) { panner.pan.setValueAtTime(pan, when); oscillator.connect(filter).connect(gain).connect(panner).connect(this.master); } else oscillator.connect(filter).connect(gain).connect(this.master);
      oscillator.start(when); oscillator.stop(when + duration + .04); this.register(oscillator, [oscillator, filter, gain, panner].filter(Boolean));
    } catch (_) {}
  }

  drum(when, frequency, volume, pan = 0, kind = 'drum') {
    if (!this.context || !this.master || !this.noise || this.muted) return;
    if (kind === 'kick') { this.kick(when, volume, pan); return; }
    if (kind === 'snare') { this.noiseHit(when, 1800, .12, volume, pan, kind); this.voice(190, when, .08, 'sine', volume * .22, pan, 2200); return; }
    if (kind === 'hat') { this.noiseHit(when, 7000, .045, volume, pan, kind); return; }
    this.noiseHit(when, frequency, .12, volume, pan, kind);
  }

  kick(when, volume, pan = 0) {
    if (!this.context || !this.master || this.muted) return;
    try {
      const oscillator = this.context.createOscillator(), gain = this.context.createGain(), panner = this.context.createStereoPanner ? this.context.createStereoPanner() : null;
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(130, when); oscillator.frequency.exponentialRampToValueAtTime(45, when + .12); gain.gain.setValueAtTime(Math.max(.0002, volume), when); gain.gain.exponentialRampToValueAtTime(.0001, when + .13);
      if (panner) { panner.pan.setValueAtTime(pan, when); oscillator.connect(gain).connect(panner).connect(this.master); } else oscillator.connect(gain).connect(this.master);
      oscillator.start(when); oscillator.stop(when + .15); this.register(oscillator, [oscillator, gain, panner].filter(Boolean));
      this.noiseHit(when, 1200, .035, volume * .35, pan, 'kick-noise');
    } catch (_) {}
  }

  noiseHit(when, frequency, duration, volume, pan = 0, kind = 'noise') {
    if (!this.context || !this.master || !this.noise || this.muted) return;
    try {
      const source = this.context.createBufferSource(), gain = this.context.createGain(), filter = this.context.createBiquadFilter(), panner = this.context.createStereoPanner ? this.context.createStereoPanner() : null;
      source.buffer = this.noise; filter.type = kind === 'hat' ? 'highpass' : 'bandpass'; filter.frequency.setValueAtTime(frequency, when); gain.gain.setValueAtTime(Math.max(.0002, volume), when); gain.gain.exponentialRampToValueAtTime(.0001, when + duration);
      if (panner) { panner.pan.setValueAtTime(pan, when); source.connect(filter).connect(gain).connect(panner).connect(this.master); } else source.connect(filter).connect(gain).connect(this.master);
      source.start(when); source.stop(when + duration + .02); this.register(source, [source, filter, gain, panner].filter(Boolean));
    } catch (_) {}
  }

  register(source, nodes) {
    const entry = { source, nodes }, cleanup = () => {
      const index = this.sources.indexOf(entry); if (index >= 0) this.sources.splice(index, 1);
      for (const node of nodes) { try { node.disconnect(); } catch (_) {} }
    };
    try { source.addEventListener('ended', cleanup, { once: true }); } catch (_) { source.onended = cleanup; }
    this.sources.push(entry);
  }

  hit(lane, judgement = 'perfect') {
    if (!this.context || this.muted) return;
    const volume = judgement === 'perfect' ? .075 : judgement === 'good' ? .06 : .045;
    this.noiseHit(this.context.currentTime + .005, 1400 + (lane || 0) * 350, .055, volume, (lane - 1.5) / 2, 'cook');
  }

  dish(served, quality = 0) {
    if (!this.context || this.muted) return;
    const when = this.context.currentTime + .008, root = this.track?.music?.tonic || 261.63;
    if (served) { this.voice(root, when, .22, 'sine', .08, -.2, 2600); this.voice(root * 1.5, when + .08, .3, 'triangle', .065, .2, 3000); }
    else this.noiseHit(when, 380, .16, .07, 0, 'cook');
  }

  async dispose() { this.stop(); if (this.context) { try { await this.context.close(); } catch (_) {} } this.context = null; this.master = null; }
}
