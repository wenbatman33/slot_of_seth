/**
 * 程序合成音效（WebAudio），不依賴外部音檔
 * 背景音樂：低音持續音 + 希賈茲（Hijaz）音階撥弦，營造埃及風
 */
type Name = 'click' | 'drop' | 'land' | 'win' | 'explode' | 'bigwin' | 'tier' | 'whoosh' | 'fg' | 'thunder'
    | 'orb' | 'cast' | 'scatter' | 'coin' | 'impact';

export class Sfx {
    static ctx: AudioContext | null = null;
    static master: GainNode | null = null;
    static enabled = true;
    private static musicTimer: any = null;
    private static step = 0;

    static unlock() {
        const W = window as any;
        if (!Sfx.ctx) {
            const AC = W.AudioContext || W.webkitAudioContext;
            if (!AC) return;
            Sfx.ctx = new AC();
            Sfx.master = Sfx.ctx!.createGain();
            Sfx.master.gain.value = 0.55;
            Sfx.master.connect(Sfx.ctx!.destination);
        }
        if (Sfx.ctx!.state === 'suspended') Sfx.ctx!.resume();
        if (Sfx.enabled && !Sfx.musicTimer) Sfx.music(true);
    }

    static toggle(): boolean {
        Sfx.enabled = !Sfx.enabled;
        if (Sfx.master) Sfx.master.gain.value = Sfx.enabled ? 0.55 : 0;
        Sfx.music(Sfx.enabled);
        return Sfx.enabled;
    }

    private static tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.2, slide = 0, delay = 0) {
        const c = Sfx.ctx;
        if (!c || !Sfx.master || !Sfx.enabled) return;
        const t = c.currentTime + delay;
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, t);
        if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(Sfx.master);
        o.start(t); o.stop(t + dur + 0.05);
    }

    private static noise(dur: number, vol = 0.2, freq = 1200, q = 0.8, delay = 0, sweep = 1) {
        const c = Sfx.ctx;
        if (!c || !Sfx.master || !Sfx.enabled) return;
        const t = c.currentTime + delay;
        const len = Math.floor(c.sampleRate * dur);
        const buf = c.createBuffer(1, len, c.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        const src = c.createBufferSource();
        src.buffer = buf;
        const f = c.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.setValueAtTime(freq, t);
        if (sweep !== 1) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
        f.Q.value = q;
        const g = c.createGain();
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(f); f.connect(g); g.connect(Sfx.master);
        src.start(t); src.stop(t + dur);
    }

    static play(n: Name) {
        if (!Sfx.ctx || !Sfx.enabled) return;
        switch (n) {
            case 'click': Sfx.tone(880, 0.06, 'triangle', 0.15); break;
            case 'drop': Sfx.noise(0.18, 0.12, 500, 1, 0, 0.5); break;
            case 'land': Sfx.tone(140, 0.12, 'sine', 0.22, 0.6); break;
            case 'win': [0, 4, 7, 12].forEach((s, i) => Sfx.tone(523 * Math.pow(2, s / 12), 0.25, 'triangle', 0.13, 1, i * 0.06)); break;
            case 'explode': Sfx.noise(0.35, 0.22, 1800, 0.7, 0, 0.3); Sfx.tone(90, 0.25, 'sine', 0.2, 0.5); break;
            case 'impact': Sfx.noise(0.25, 0.25, 900, 0.8, 0, 0.4); Sfx.tone(220, 0.2, 'square', 0.08, 0.5); break;
            case 'cast': Sfx.noise(0.6, 0.15, 400, 2, 0, 6); Sfx.tone(300, 0.5, 'sawtooth', 0.05, 2.5); break;
            case 'orb': [0, 7, 12, 19].forEach((s, i) => Sfx.tone(660 * Math.pow(2, s / 12), 0.3, 'sine', 0.12, 1, i * 0.05)); break;
            case 'scatter': Sfx.tone(1046, 0.5, 'sine', 0.18); Sfx.tone(1568, 0.6, 'sine', 0.1, 1, 0.08); break;
            case 'coin': Sfx.tone(1318, 0.08, 'square', 0.05); Sfx.tone(1760, 0.1, 'square', 0.04, 1, 0.05); break;
            case 'tier': [0, 4, 7, 11, 14].forEach((s, i) => Sfx.tone(392 * Math.pow(2, s / 12), 0.5, 'sawtooth', 0.06, 1, i * 0.07)); break;
            case 'bigwin':
                [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => Sfx.tone(262 * Math.pow(2, s / 12), 0.6, 'triangle', 0.14, 1, i * 0.09));
                Sfx.noise(1.2, 0.08, 6000, 0.5, 0.3);
                break;
            case 'whoosh': Sfx.noise(1.1, 0.3, 300, 0.6, 0, 8); Sfx.tone(60, 0.9, 'sine', 0.25, 0.5); break;
            case 'fg': [0, 1, 4, 5, 7, 8, 11, 12].forEach((s, i) => Sfx.tone(294 * Math.pow(2, s / 12), 0.3, 'triangle', 0.12, 1, i * 0.08)); break;
            case 'thunder': Sfx.noise(1.6, 0.45, 150, 0.4, 0, 0.4); Sfx.noise(0.3, 0.3, 3000, 0.6); Sfx.tone(45, 1.4, 'sine', 0.35, 0.7); break;
        }
    }

    // ================================================================ 背景音樂
    // 神秘埃及氛圍：大殿殘響 + 呼吸低音 + 西塔琴撥弦（Karplus-Strong）+ 蘆笛旋律（顫音、滑音）
    // + Maqsum 手鼓 + 和聲長音 + 沙漠風聲；音階為 D 希賈茲（D E♭ F♯ G A B♭ C）
    private static bus: GainNode | null = null;
    private static drones: AudioScheduledSourceNode[] = [];
    private static nextTime = 0;
    private static intensity = 0;
    private static phrase = 0;
    private static fluteOsc: OscillatorNode | null = null;
    private static ksCache: Record<string, AudioBuffer> = {};
    private static readonly SCALE = [0, 1, 4, 5, 7, 8, 10, 12, 13, 16, 17, 19];
    private static readonly PHRASES: number[][][] = [
        // [起始拍, 音階級數, 長度拍]（一拍 = 八分音符）
        [[0, 4, 4], [4, 5, 2], [6, 4, 2], [8, 3, 4], [12, 2, 2], [14, 1, 2], [16, 0, 10]],
        [[0, 7, 6], [6, 6, 2], [8, 5, 2], [10, 4, 2], [12, 5, 4], [16, 4, 2], [18, 3, 2], [20, 1, 2], [22, 2, 2], [24, 1, 6]],
        [[0, 0, 2], [2, 1, 2], [4, 2, 4], [8, 3, 2], [10, 4, 6], [16, 5, 2], [18, 4, 2], [20, 3, 2], [22, 2, 2], [24, 1, 8]],
        [[0, 4, 3], [3, 5, 1], [4, 7, 6], [10, 6, 2], [12, 5, 2], [14, 4, 2], [16, 5, 3], [19, 4, 1], [20, 2, 4], [24, 1, 4], [28, 0, 4]],
    ];

    /** 遊戲狀態改變音樂強度：0 主遊戲、1 免費遊戲、2 覺醒 */
    static setIntensity(v: number) { Sfx.intensity = v; }

    private static impulse(c: AudioContext, sec: number, decay: number): AudioBuffer {
        const len = Math.floor(c.sampleRate * sec);
        const b = c.createBuffer(2, len, c.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const d = b.getChannelData(ch);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
        }
        return b;
    }

    static music(on: boolean) {
        const c = Sfx.ctx;
        if (Sfx.musicTimer) { clearInterval(Sfx.musicTimer); Sfx.musicTimer = null; }
        for (const d of Sfx.drones) { try { d.stop(); } catch (e) { /* 已停止 */ } }
        Sfx.drones = [];
        if (Sfx.bus) { const b = Sfx.bus; b.gain.setTargetAtTime(0.0001, c ? c.currentTime : 0, 0.3); setTimeout(() => b.disconnect(), 1500); Sfx.bus = null; }
        if (!on || !c || !Sfx.master) return;

        const bus = c.createGain();
        bus.gain.setValueAtTime(0.0001, c.currentTime);
        bus.gain.exponentialRampToValueAtTime(0.85, c.currentTime + 3);
        const dry = c.createGain(); dry.gain.value = 0.55;
        const wet = c.createGain(); wet.gain.value = 0.7;
        const verb = c.createConvolver(); verb.buffer = Sfx.impulse(c, 3.6, 2.4);
        bus.connect(dry); dry.connect(Sfx.master);
        bus.connect(verb); verb.connect(wet); wet.connect(Sfx.master);
        Sfx.bus = bus;

        // 呼吸低音：D2 與 A2 鋸齒波經低通濾波，濾波頻率被極慢的 LFO 推動
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 5;
        const lfo = c.createOscillator(); lfo.frequency.value = 0.06;
        const lfoAmt = c.createGain(); lfoAmt.gain.value = 200;
        lfo.connect(lfoAmt); lfoAmt.connect(lp.frequency);
        const dg = c.createGain(); dg.gain.value = 0.5;
        lp.connect(dg); dg.connect(bus);
        for (const [f, v] of [[73.42, 0.05], [73.42 * 1.006, 0.05], [110, 0.03], [36.71, 0.06]] as [number, number][]) {
            const o = c.createOscillator(); o.type = f < 50 ? 'sine' : 'sawtooth'; o.frequency.value = f;
            const g = c.createGain(); g.gain.value = v;
            o.connect(g); g.connect(lp); o.start();
            Sfx.drones.push(o);
        }
        lfo.start(); Sfx.drones.push(lfo);

        Sfx.nextTime = c.currentTime + 0.2;
        Sfx.step = 0;
        Sfx.musicTimer = setInterval(() => Sfx.schedule(), 60);
    }

    private static schedule() {
        const c = Sfx.ctx;
        if (!c || !Sfx.bus || !Sfx.enabled) return;
        const bpm = [84, 96, 108][Sfx.intensity] || 84;
        const dur = 60 / bpm / 2;
        while (Sfx.nextTime < c.currentTime + 0.25) {
            Sfx.playStep(Sfx.step, Sfx.nextTime, dur);
            Sfx.nextTime += dur;
            Sfx.step++;
        }
    }

    private static hz(base: number, semi: number) { return base * Math.pow(2, semi / 12); }

    private static playStep(i: number, t: number, dur: number) {
        const s = i % 8, cycle = Math.floor(i / 32), inCycle = i % 32;
        const I = Sfx.intensity;
        // 手鼓 Maqsum：咚 噠 . 噠 咚 . 噠 .（開場前兩小節只有低音與撥弦）
        if (i >= 16 || I > 0) {
            if (s === 0 || s === 4) Sfx.doum(t, s === 0 ? 0.42 : 0.3);
            if (s === 1 || s === 3 || s === 6) Sfx.tek(t, 0.09 + (I > 0 ? 0.04 : 0));
            if (I > 0 && (s === 7 || s === 5) && Math.random() < 0.5) Sfx.tek(t, 0.05);
        }
        // 西塔琴撥弦固定音型
        const oud = [0, -1, -1, 7, 0, -1, 1, -1];
        if (oud[s] >= 0) Sfx.pluck(Sfx.hz(146.83, oud[s]), t, 0.16);
        if (I > 0 && s === 2) Sfx.pluck(Sfx.hz(146.83, 12), t, 0.08);
        // 和聲長音：每兩小節換一次（I → ♭II → I → ♭VII）
        if (inCycle % 16 === 0) {
            const chords = [[0, 7, 12], [1, 8, 13], [0, 7, 12], [-2, 5, 10]];
            const ch = chords[(Math.floor(i / 16)) % 4];
            for (const n of ch) Sfx.pad(Sfx.hz(146.83, n), t, dur * 16, 0.022);
        }
        // 蘆笛旋律：主遊戲隔一個樂句吹一次，免費遊戲每句都吹
        if (inCycle === 0) Sfx.phrase = Math.floor(Math.random() * Sfx.PHRASES.length);
        if (cycle % 2 === 1 || I > 0) {
            for (const [st, deg, len] of Sfx.PHRASES[Sfx.phrase]) {
                if (st === inCycle) Sfx.flute(Sfx.hz(293.66, Sfx.SCALE[deg] + (I === 2 ? 12 : 0)), t, dur * len);
            }
        }
        // 沙漠風聲：偶爾一陣
        if (inCycle === 24 && Math.random() < 0.6) Sfx.wind(t, dur * 10);
    }

    private static out(): AudioNode { return Sfx.bus as AudioNode; }

    private static doum(t: number, v: number) {
        const c = Sfx.ctx!;
        const o = c.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.18);
        const g = c.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        o.connect(g); g.connect(Sfx.out()); o.start(t); o.stop(t + 0.4);
    }

    private static tek(t: number, v: number) {
        const c = Sfx.ctx!;
        const len = Math.floor(c.sampleRate * 0.06);
        const b = c.createBuffer(1, len, c.sampleRate);
        const d = b.getChannelData(0);
        for (let k = 0; k < len; k++) d[k] = (Math.random() * 2 - 1) * Math.pow(1 - k / len, 3);
        const src = c.createBufferSource(); src.buffer = b;
        const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 1.4;
        const g = c.createGain(); g.gain.value = v;
        src.connect(f); f.connect(g); g.connect(Sfx.out()); src.start(t);
    }

    /** Karplus-Strong 撥弦（類似烏德琴／西塔琴） */
    private static pluck(freq: number, t: number, v: number) {
        const c = Sfx.ctx!;
        const key = freq.toFixed(2);
        let buf = Sfx.ksCache[key];
        if (!buf) {
            const sr = c.sampleRate, len = Math.floor(sr * 1.6), N = Math.max(2, Math.round(sr / freq));
            buf = c.createBuffer(1, len, sr);
            const y = buf.getChannelData(0);
            for (let k = 0; k < N; k++) y[k] = Math.random() * 2 - 1;
            for (let k = N; k < len; k++) y[k] = 0.4985 * (y[k - N] + y[k - N + 1]);
            Sfx.ksCache[key] = buf;
        }
        const src = c.createBufferSource(); src.buffer = buf;
        const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
        const g = c.createGain(); g.gain.value = v;
        src.connect(f); f.connect(g); g.connect(Sfx.out()); src.start(t);
    }

    /** 蘆笛：正弦 + 少量三角波，顫音、吹氣聲，音與音之間滑音 */
    private static flute(freq: number, t: number, len: number) {
        const c = Sfx.ctx!;
        const o = c.createOscillator(); o.type = 'sine';
        const o2 = c.createOscillator(); o2.type = 'triangle';
        const prev = Sfx.fluteOsc ? Sfx.fluteOsc.frequency.value : freq;
        o.frequency.setValueAtTime(prev, t); o.frequency.exponentialRampToValueAtTime(freq, t + 0.07);
        o2.frequency.setValueAtTime(freq * 2, t);
        const vib = c.createOscillator(); vib.frequency.value = 5.2;
        const vibAmt = c.createGain(); vibAmt.gain.setValueAtTime(0, t); vibAmt.gain.linearRampToValueAtTime(freq * 0.006, t + 0.35);
        vib.connect(vibAmt); vibAmt.connect(o.frequency);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.06, t + 0.09);
        g.gain.setValueAtTime(0.055, t + Math.max(0.1, len - 0.12));
        g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.25);
        const g2 = c.createGain(); g2.gain.value = 0.18;
        o.connect(g); o2.connect(g2); g2.connect(g); g.connect(Sfx.out());
        // 吹氣聲
        const nb = c.createBuffer(1, Math.floor(c.sampleRate * 0.25), c.sampleRate);
        const nd = nb.getChannelData(0);
        for (let k = 0; k < nd.length; k++) nd[k] = (Math.random() * 2 - 1) * (1 - k / nd.length);
        const ns = c.createBufferSource(); ns.buffer = nb;
        const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = freq * 3; nf.Q.value = 2;
        const ng = c.createGain(); ng.gain.value = 0.02;
        ns.connect(nf); nf.connect(ng); ng.connect(Sfx.out());
        const end = t + len + 0.3;
        for (const x of [o, o2, vib]) { x.start(t); x.stop(end); }
        ns.start(t);
        Sfx.fluteOsc = o;
    }

    private static pad(freq: number, t: number, len: number, v: number) {
        const c = Sfx.ctx!;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(v, t + 1.6);
        g.gain.setValueAtTime(v, t + len - 0.5);
        g.gain.exponentialRampToValueAtTime(0.0001, t + len + 1.5);
        g.connect(Sfx.out());
        for (const det of [-4, 4]) {
            const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = freq; o.detune.value = det;
            o.connect(g); o.start(t); o.stop(t + len + 1.6);
        }
    }

    private static wind(t: number, len: number) {
        const c = Sfx.ctx!;
        const n = c.createBuffer(1, Math.floor(c.sampleRate * len), c.sampleRate);
        const d = n.getChannelData(0);
        for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
        const src = c.createBufferSource(); src.buffer = n;
        const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3;
        f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(1400, t + len * 0.5);
        f.frequency.exponentialRampToValueAtTime(500, t + len);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + len * 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
        src.connect(f); f.connect(g); g.connect(Sfx.out()); src.start(t);
    }
}
