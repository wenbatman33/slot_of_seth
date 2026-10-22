import { Node, Sprite, Label, Vec3, tween, Tween, UITransform, sp, BlockInputEvents } from 'cc';
import { Kit } from '../util/Kit';
import { Assets } from './Assets';
import { FxLayer } from './Fx';
import { WIN_TIERS } from '../core/SlotEngine';
import { Sfx } from './Sfx';

const TIER_TITLE = ['title_bigwin', 'title_superwin', 'title_megawin', 'title_legendary'];
const TIER_RAY = ['#7fc8ff', '#e38bff', '#ff7a5a', '#ffd76a'];

/** 全螢幕演出：大獎、轉場、免費遊戲開場/結算、覺醒特寫 */
export class Celebrations {
    root: Node;
    private size: () => { w: number; h: number };
    private skip = false;
    /** 目前開著的遮罩數（> 0 時主控不接受空白鍵旋轉，QA P0-2） */
    modal = 0;

    constructor(parent: Node, size: () => { w: number; h: number }) {
        this.root = Kit.mk('celebrations', parent);
        this.size = size;
    }

    /** 半透明遮罩（同時擋住下層點擊，點一下可略過）；Sprite 才能真的半透明（QA P0-3） */
    private dim(alpha = 170, tapSkip = true): Node {
        const { w, h } = this.size();
        const n = Kit.rect(this.root, w * 1.5, h * 1.5, '#05010c', 'dim').node;
        n.addComponent(BlockInputEvents);
        this.modal++;
        const op = Kit.opacity(n);
        op.opacity = 0;
        tween(op).to(0.25, { opacity: alpha }).start();
        if (tapSkip) n.on(Node.EventType.TOUCH_END, () => (this.skip = true));
        return n;
    }

    private async undim(n: Node) {
        this.modal = Math.max(0, this.modal - 1);
        await Kit.fade(n, 0, 0.3);
        n.destroy();
    }

    // ------------------------------------------------------------ 大獎（逐級升級）
    async bigWin(amount: number, bet: number, onCount?: (v: number) => void) {
        const top = WIN_TIERS.reduce((t, w, i) => (amount >= w.x * bet ? i : t), -1);
        if (top < 0) return;
        this.skip = false;
        Sfx.play('bigwin');
        const d = this.dim(150);
        // 過場（依原作）：畫面壓暗 → 紅金色放射光暈由中心炸開 → 白閃 → 標題彈出、數字開始累加
        await this.bigWinIntro(top);
        // 金幣層放在標題與數字後方，避免遮住金額
        const coins = Kit.mk('coins', this.root);
        const box = Kit.mk('bigwin', this.root);
        const rays = Kit.sprite(box, Assets.sf('rays'), 'rays', 1100, 1100);
        Kit.additive(rays);
        rays.node.setPosition(0, 70, 0);
        tween(rays.node).by(8, { angle: 360 }).repeatForever().start();
        const title = Kit.sprite(box, Assets.sf(TIER_TITLE[0]), 'title');
        Kit.fitWidth(title, 760);
        title.node.setPosition(0, 120, 0);
        // 數字後面墊一塊暗色光暈，金幣飛過時金額仍清楚
        const plate = Kit.sprite(box, Assets.sf('radial'), 'plate', 980, 300);
        plate.color = Kit.color('#1a0600');
        Kit.opacity(plate.node).opacity = 190;
        plate.node.setPosition(0, -215, 0);
        const num = Kit.bmLabel(box, Assets.fonts.num_gold, '0.00', 120, 'amount');
        num.node.setPosition(0, -215, 0);

        const { w, h } = this.size();
        const coinTimer = setInterval(() => FxLayer.inst?.coinRain(w, h, 4, coins), 160);
        let tier = 0;
        const popTitle = (i: number) => {
            title.spriteFrame = Assets.sf(TIER_TITLE[i]);
            Kit.fitWidth(title, 760);
            rays.color = Kit.color(TIER_RAY[i]);
            Tween.stopAllByTarget(title.node);
            title.node.setScale(0.2, 0.2, 1);
            tween(title.node).to(0.45, { scale: new Vec3(1, 1, 1) }, { easing: 'elasticOut' })
                .call(() => tween(title.node).repeatForever(tween(title.node)
                    .to(0.6, { scale: new Vec3(1.05, 1.05, 1) }, { easing: 'sineInOut' })
                    .to(0.6, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' })).start()).start();
            Sfx.play('tier');
        };
        popTitle(0);
        // 分段計數：每一級各自從上一級門檻跑到下一級門檻（約 1.7 秒），跨級時標題彈出並停 0.3 秒，最後一段跑到終值
        const marks: number[] = [0];
        for (let i = 1; i <= top; i++) marks.push(WIN_TIERS[i].x * bet);
        marks.push(amount);
        const SEG = 1.7, PAUSE = 0.3;
        let coinTick = 0;
        await new Promise<void>((res) => {
            let seg = 0, segT0 = Date.now(), pausedUntil = 0;
            const step = () => {
                const now = Date.now();
                if (this.skip) { num.string = Kit.fmt(amount); onCount && onCount(amount); res(); return; }
                if (now < pausedUntil) { setTimeout(step, 33); return; }
                const k = Math.min(1, ((now - segT0) / 1000) * Kit.speed / SEG);
                const v = marks[seg] + (marks[seg + 1] - marks[seg]) * (1 - Math.pow(1 - k, 1.4));
                num.string = Kit.fmt(v);
                onCount && onCount(v);
                if (now - coinTick > 110) { coinTick = now; Sfx.play('coin'); }
                if (k >= 1) {
                    seg++;
                    if (seg >= marks.length - 1) { res(); return; }
                    tier = seg;
                    popTitle(tier);
                    pausedUntil = now + (PAUSE * 1000) / Kit.speed;
                    segT0 = pausedUntil;
                }
                setTimeout(step, 33);
            };
            step();
        });
        if (tier < top) { tier = top; popTitle(tier); }
        num.string = Kit.fmt(amount);
        Tween.stopAllByTarget(num.node);
        num.node.setScale(1.25, 1.25, 1);
        tween(num.node).to(0.3, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        this.skip = false;
        await this.holdOrTap(2.2);
        clearInterval(coinTimer);
        await Promise.all([Kit.fade(box, 0, 0.3), Kit.fade(coins, 0, 0.3)]);
        box.destroy();
        coins.destroy();
        if (this.glowBg) { const g = this.glowBg; this.glowBg = null; Kit.fade(g, 0, 0.35).then(() => g.destroy()); }
        await this.undim(d);
    }

    /** 大獎背景光暈（演出期間持續存在） */
    private glowBg: Node | null = null;

    private async bigWinIntro(tier: number) {
        const { w, h } = this.size();
        const color = ['#ff5a1e', '#c23cff', '#ff3a2a', '#ffb52e'][tier] || '#ff5a1e';
        // 1) 放射光暈：從中心一點炸開到蓋滿畫面
        const bg = Kit.mk('bwGlow', this.root);
        // 光暈只蓋住中央（約畫面高度 1.25 倍），四周保留盤面與角色透出來
        const hs = Math.min(w, h) * 1.25;
        const halo = Kit.sprite(bg, Assets.sf('radial'), 'halo', hs * 1.5, hs);
        halo.color = Kit.color(color);
        Kit.opacity(halo.node).opacity = 200;  // 保留四周的盤面透出來（原作是盤面上疊一層紅光）
        const rays = Kit.sprite(bg, Assets.sf('rays'), 'rays', hs * 1.15, hs * 1.15);
        Kit.additive(rays);
        rays.color = Kit.color('#ffd27a');
        Kit.opacity(rays.node).opacity = 150;
        tween(rays.node).by(14, { angle: -360 }).repeatForever().start();
        bg.setScale(0.05, 0.05, 1);
        this.glowBg = bg;
        // 2) 中心能量球先收縮再爆開
        const core = Kit.sprite(this.root, Assets.sf('glow_gold'), 'core', 260, 260);
        Kit.additive(core);
        core.node.setScale(0.2, 0.2, 1);
        Sfx.play('whoosh');
        await Kit.to(core.node, 0.28, { scale: new Vec3(1.6, 1.6, 1) }, 'quadIn');
        tween(bg).to(0.45, { scale: new Vec3(1, 1, 1) }, { easing: 'expoOut' }).start();
        // 3) 白閃 + 震動 + 一圈爆裂粒子
        const flash = Kit.rect(this.root, w * 1.3, h * 1.3, '#fff3d0', 'flash');
        Kit.opacity(flash.node).opacity = 0;
        tween(Kit.opacity(flash.node)).to(0.05, { opacity: 210 }).to(0.4, { opacity: 0 }).call(() => flash.node.destroy()).start();
        this.shake(this.root.parent!, 0.4, 14);
        for (let i = 0; i < 26; i++) {
            const ang = (i / 26) * Math.PI * 2, v = Kit.rand(700, 1300);
            FxLayer.inst?.spawn('star', 0, 0, {
                vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, drag: 2.2, s0: Kit.rand(0.5, 0.9), s1: 0,
                a0: 255, a1: 0, life: Kit.rand(0.5, 0.9), add: true, size: 80, tint: '#fff2c8',
            }, this.root);
        }
        tween(core.node).to(0.25, { scale: new Vec3(4, 4, 1) }).start();
        Kit.fade(core.node, 0, 0.25).then(() => core.node.destroy());
        await Kit.wait(0.15);
    }

    private async holdOrTap(sec: number) {
        const t0 = Date.now();
        while (!this.skip && Date.now() - t0 < sec * 1000) await new Promise((r) => setTimeout(r, 50));
        this.skip = false;
    }

    // ------------------------------------------------------------ 轉場
    /** 火焰（橘）或紫焰橫掃整個畫面；midway 在畫面被蓋滿時呼叫 */
    async wave(kind: 'fire' | 'purple', midway?: () => void) {
        Sfx.play('whoosh');
        const { w, h } = this.size();
        const box = Kit.mk('wave', this.root);
        const fromLeft = kind === 'fire';
        const sf = Assets.sf(kind === 'fire' ? 'fx_fire_wave' : 'fx_purple_wave');
        const layers: Node[] = [];
        for (let i = 0; i < 3; i++) {
            const s = Kit.sprite(box, sf, 'w' + i, w * 1.6, h * 1.5);
            Kit.additive(s);
            s.node.setPosition((fromLeft ? -1 : 1) * w * (1.4 + i * 0.25), (i - 1) * h * 0.18, 0);
            s.node.angle = (i - 1) * 6;
            if (!fromLeft) s.node.setScale(-1, 1, 1);
            layers.push(s.node);
        }
        const flash = Kit.rect(box, w * 1.2, h * 1.2, kind === 'fire' ? '#ffb347' : '#c06bff', 'flash');
        Kit.opacity(flash.node).opacity = 0;
        const dur = 0.9;
        layers.forEach((n, i) => {
            tween(n).delay(i * 0.08).to(dur, { position: new Vec3((fromLeft ? 1 : -1) * w * 0.05, n.position.y, 0) }, { easing: 'quadOut' })
                .to(0.6, { position: new Vec3((fromLeft ? 1 : -1) * w * 1.6, n.position.y, 0) }, { easing: 'quadIn' }).start();
        });
        await Kit.wait(0.55);
        tween(Kit.opacity(flash.node)).to(0.25, { opacity: 170 }).to(0.45, { opacity: 0 }).start();
        await Kit.wait(0.3);
        midway && midway();
        await Kit.wait(1.0);
        box.destroy();
    }

    // ------------------------------------------------------------ 免費遊戲開場
    async freeGamesIntro(count: number) {
        this.skip = false;
        const d = this.dim(150);
        const box = Kit.mk('fgIntro', this.root);
        const rays = Kit.sprite(box, Assets.sf('rays'), 'rays', 1000, 1000);
        Kit.additive(rays);
        rays.color = Kit.color('#ffcf7a');
        tween(rays.node).by(10, { angle: 360 }).repeatForever().start();
        const num = Kit.bmLabel(box, Assets.fonts.num_gold, String(count), 200, 'num');
        num.node.setPosition(0, 150, 0);
        const t = Kit.label(box, '免費遊戲', 120, '#7dffe0', { outline: '#063a33', outlineW: 9, name: 'txt' });
        Kit.shadow(t, '#000000cc', 0, -6, 8);
        t.node.setPosition(0, -60, 0);
        const sub = Kit.label(box, '點擊任意處開始', 32, '#f3e6ff', { bold: false, name: 'sub' });
        sub.node.setPosition(0, -200, 0);
        tween(Kit.opacity(sub.node)).repeatForever(tween(Kit.opacity(sub.node)).to(0.6, { opacity: 80 }).to(0.6, { opacity: 255 })).start();
        box.setScale(0.3, 0.3, 1);
        tween(box).to(0.5, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        Sfx.play('fg');
        await this.holdOrTap(3.5);
        await Kit.to(box, 0.25, { scale: new Vec3(1.2, 1.2, 1) });
        await Kit.fade(box, 0, 0.2);
        box.destroy();
        await this.undim(d);
    }

    // ------------------------------------------------------------ 免費遊戲結算
    async freeGamesOutro(total: number) {
        this.skip = false;
        const d = this.dim(190);
        const box = Kit.mk('fgOutro', this.root);
        const panel = Kit.panel(box, 900, 480, '#2a0b45f0', '#f2c75c', 40, 6, 'panel');
        void panel;
        const glow = Kit.sprite(box, Assets.sf('glow_purple'), 'glow', 1400, 900);
        Kit.additive(glow);
        glow.node.setSiblingIndex(0);
        const t = Kit.label(box, '贏得獎金', 84, '#9dfcff', { outline: '#062a3a', outlineW: 7, name: 'title' });
        Kit.shadow(t, '#000000cc', 0, -5, 8);
        t.node.setPosition(0, 140, 0);
        const num = Kit.bmLabel(box, Assets.fonts.num_gold, '0.00', 110, 'amount');
        num.node.setPosition(0, 10, 0);
        const ok = Kit.mk('ok', box, 220, 70);
        Kit.panel(ok, 220, 66, '#0f6b6b', '#9dfcff', 33, 3, 'bg');
        Kit.label(ok, '確定', 34, '#ffffff', { name: 't' });
        ok.setPosition(0, -170, 0);
        Kit.button(ok, () => (this.skip = true));
        box.setScale(0.4, 0.4, 1);
        tween(box).to(0.4, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        Sfx.play('tier');
        const t0 = Date.now();
        const dur = 1.8;
        await new Promise<void>((res) => {
            const step = () => {
                const k = this.skip ? 1 : Math.min(1, (Date.now() - t0) / 1000 / dur);
                num.string = Kit.fmt(total * k);
                if (k >= 1) { res(); return; }
                setTimeout(step, 33);
            };
            step();
        });
        this.skip = false;
        await this.holdOrTap(4);
        await Kit.fade(box, 0, 0.25);
        box.destroy();
        await this.undim(d);
    }

    // ------------------------------------------------------------ 覺醒特寫
    async awaken(onFlash?: () => void) {
        this.skip = false;
        const { w, h } = this.size();
        Sfx.play('thunder');
        const d = this.dim(225, false);
        const box = Kit.mk('awaken', this.root);
        // 隨機閃電畫在角色與標題後面，不要劈過「覺醒之力」字樣
        const boltLayer = Kit.mk('bolts', box);
        const data = Assets.spines['seth_awaken'];
        let sk: sp.Skeleton | null = null;
        const holder = Kit.mk('seth', box);
        if (data) {
            const k = holder.addComponent(sp.Skeleton);
            k.premultipliedAlpha = false;
            k.skeletonData = data;
            k.setMix('intro', 'power', 0.1);
            k.setAnimation(0, 'intro', false);
            k.addAnimation(0, 'power', true, 0);
            sk = k;
        }
        void sk;
        // 角色由下往上衝入 + 放大
        const base = Math.min(w / 1300, h / 900) * 1.05;
        holder.setScale(base * 0.8, base * 0.8, 1);
        holder.setPosition(0, -h / 2 - 200, 0);
        tween(holder).to(0.45, { position: new Vec3(0, -h / 2 + 10, 0), scale: new Vec3(base, base, 1) }, { easing: 'backOut' }).start();
        // 閃電
        const bolts = setInterval(() => {
            const b = Kit.sprite(boltLayer, Assets.sf('fx_lightning'), 'bolt', Kit.rand(500, 900), Kit.rand(500, 900));
            Kit.additive(b);
            b.node.setPosition(Kit.rand(-w / 2, w / 2), Kit.rand(-h / 3, h / 2), 0);
            b.node.angle = Kit.rand(0, 360);
            const op = Kit.opacity(b.node);
            tween(op).to(0.05, { opacity: 255 }).to(0.18, { opacity: 0 }).call(() => b.node.destroy()).start();
        }, 140);
        await Kit.wait(0.6);
        // 白閃 + 震動
        const flash = Kit.rect(box, w * 1.3, h * 1.3, '#d8f4ff', 'flash');
        Kit.opacity(flash.node).opacity = 0;
        tween(Kit.opacity(flash.node)).to(0.06, { opacity: 235 }).to(0.5, { opacity: 0 }).start();
        onFlash && onFlash();
        this.shake(this.root.parent!, 0.6, 18);
        const t = Kit.label(box, '覺醒之力', 150, '#bfefff', { outline: '#062048', outlineW: 10, name: 'title' });
        Kit.shadow(t, '#2d8cff', 0, 0, 24);
        t.node.setPosition(0, -h / 2 + 170, 0);
        t.node.setScale(3, 3, 1);
        Kit.opacity(t.node).opacity = 0;
        tween(t.node).to(0.35, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        tween(Kit.opacity(t.node)).to(0.2, { opacity: 255 }).start();
        await this.holdOrTap(2.4);
        clearInterval(bolts);
        await Promise.all([Kit.fade(box, 0, 0.35)]);
        box.destroy();
        await this.undim(d);
    }

    /** 畫面震動 */
    shake(n: Node, dur: number, amp: number) {
        const p0 = n.position.clone();
        const t0 = Date.now();
        const it = setInterval(() => {
            const k = (Date.now() - t0) / 1000 / dur;
            if (k >= 1) { clearInterval(it); n.setPosition(p0); return; }
            const a = amp * (1 - k);
            n.setPosition(p0.x + Kit.rand(-a, a), p0.y + Kit.rand(-a, a), 0);
        }, 30);
    }

    // ------------------------------------------------------------ Jackpot
    async jackpot(name: string, amount: number) {
        this.skip = false;
        const d = this.dim(190);
        const coins = Kit.mk('coins', this.root);
        const box = Kit.mk('jackpot', this.root);
        const rays = Kit.sprite(box, Assets.sf('rays'), 'rays', 1100, 1100);
        Kit.additive(rays);
        tween(rays.node).by(6, { angle: 360 }).repeatForever().start();
        const t = Kit.label(box, name, 140, '#ffd56a', { outline: '#4a1200', outlineW: 10, name: 'name', font: 'Arial Black, Impact, sans-serif' });
        t.node.setPosition(0, 120, 0);
        const sub = Kit.label(box, 'JACKPOT', 70, '#ffffff', { outline: '#4a1200', outlineW: 6, name: 'sub', font: 'Arial Black, Impact, sans-serif' });
        sub.node.setPosition(0, 10, 0);
        const num = Kit.bmLabel(box, Assets.fonts.num_gold, Kit.fmt(amount), 110, 'amount');
        num.node.setPosition(0, -140, 0);
        box.setScale(0.3, 0.3, 1);
        tween(box).to(0.5, { scale: new Vec3(1, 1, 1) }, { easing: 'elasticOut' }).start();
        const { w, h } = this.size();
        const coinTimer = setInterval(() => FxLayer.inst?.coinRain(w, h, 8, coins), 150);
        Sfx.play('bigwin');
        await this.holdOrTap(4);
        clearInterval(coinTimer);
        await Promise.all([Kit.fade(box, 0, 0.3), Kit.fade(coins, 0, 0.3)]);
        box.destroy();
        coins.destroy();
        await this.undim(d);
    }

    // ------------------------------------------------------------ 確認 / 資訊視窗
    confirm(title: string, body: string, okText = '確定'): Promise<boolean> {
        return new Promise((resolve) => {
            const d = this.dim(170, false);
            const box = Kit.mk('confirm', this.root);
            Kit.panel(box, 760, 420, '#22093af2', '#f2c75c', 36, 5, 'panel');
            const t = Kit.label(box, title, 56, '#ffe27a', { outline: '#3a1000', outlineW: 5, name: 'title' });
            t.node.setPosition(0, 130, 0);
            const b = Kit.label(box, body, 32, '#f0e4ff', { bold: false, name: 'body' });
            b.node.setPosition(0, 20, 0);
            const mkBtn = (txt: string, x: number, color: string, val: boolean) => {
                const n = Kit.mk('btn', box, 240, 76);
                Kit.panel(n, 240, 72, color, '#f2c75c', 36, 3, 'bg');
                Kit.label(n, txt, 34, '#ffffff', { name: 't' });
                n.setPosition(x, -130, 0);
                Kit.button(n, async () => {
                    await Kit.fade(box, 0, 0.15);
                    box.destroy();
                    this.undim(d);
                    resolve(val);
                });
            };
            mkBtn('取消', -150, '#3b2a52', false);
            mkBtn(okText, 150, '#7a2fb0', true);
            box.setScale(0.5, 0.5, 1);
            tween(box).to(0.3, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        });
    }

    /** 遊戲說明：pages 每頁一組短行（手動斷行，不讓 Label 自動斷出孤字），手機字更大 */
    info(pages: string[][]): Promise<void> {
        return new Promise((resolve) => {
            const { w, h } = this.size();
            const portrait = h > w;
            const d = this.dim(200, false);
            const box = Kit.mk('info', this.root);
            const W = Math.min(w * 0.92, 1000), H = Math.min(h * (portrait ? 0.78 : 0.88), 1000);
            Kit.panel(box, W, H, '#1a0830f4', '#f2c75c', 30, 4, 'panel');
            const t = Kit.label(box, '遊戲說明', 54, '#ffe27a', { outline: '#3a1000', outlineW: 5, name: 'title' });
            t.node.setPosition(0, H / 2 - 60, 0);
            const fs = portrait ? 38 : 30;
            const body = Kit.label(box, '', fs, '#efe4ff', { bold: false, name: 'body' });
            body.lineHeight = Math.round(fs * 1.5);
            body.horizontalAlign = Label.HorizontalAlign.LEFT;
            body.verticalAlign = Label.VerticalAlign.TOP;
            body.enableWrapText = false;
            body.overflow = Label.Overflow.SHRINK;
            body.node.getComponent(UITransform)!.setContentSize(W - 100, H - 250);
            body.node.setPosition(0, -15, 0);
            const pageL = Kit.label(box, '', 26, '#b9a3d9', { bold: false, name: 'page' });
            pageL.node.setPosition(0, -H / 2 + 125, 0);
            let page = 0;
            const show = () => {
                body.string = pages[page].join('\n');
                pageL.string = `${page + 1} / ${pages.length}`;
            };
            const mkBtn = (txt: string, x: number, fn: () => void) => {
                const n = Kit.mk('btn', box, 200, 70);
                Kit.panel(n, 200, 66, '#7a2fb0', '#f2c75c', 33, 3, 'bg');
                Kit.label(n, txt, 30, '#ffffff', { name: 't' });
                n.setPosition(x, -H / 2 + 60, 0);
                Kit.button(n, fn);
            };
            const gap = Math.min(240, W / 3.4);
            mkBtn('上一頁', -gap, () => { page = (page + pages.length - 1) % pages.length; show(); });
            mkBtn('關閉', 0, async () => {
                await Kit.fade(box, 0, 0.15);
                box.destroy();
                this.undim(d);
                resolve();
            });
            mkBtn('下一頁', gap, () => { page = (page + 1) % pages.length; show(); });
            show();
        });
    }
}

export { Sprite };
