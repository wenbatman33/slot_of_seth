import { Node, Label, Sprite, Graphics, Vec3, tween, Tween, UITransform } from 'cc';
import { Kit } from '../util/Kit';
import { Assets } from './Assets';

const HEADER_TIPS_BASE = [
    '任意位置皆可支付',
    '倍數球可乘上贏分',
    '4 SCATTER 免費遊戲',
    '最高贏得 5000 倍',
];
const HEADER_TIPS_FREE = [
    '3 SCATTER 覺醒之力',
    '倍數球累加總倍數',
];
const HEADER_TIPS_AWAKEN = [
    '覺醒：法老百搭',
    '覺醒：太陽倍數球',
];

/** 購買特色按鈕（使用者要求先拿掉，之後要再開就改成 true） */
const BUY_ENABLED = false;

/** 圓形小按鈕（深色底 + 金框 + 圖示） */
function roundBtn(parent: Node, key: string, icon: string, r = 46): Node {
    const n = Kit.mk(key, parent, r * 2, r * 2);
    const g = n.addComponent(Graphics);
    g.fillColor = Kit.color('#1a0f2ed0');
    g.circle(0, 0, r);
    g.fill();
    g.lineWidth = 4;
    g.strokeColor = Kit.color('#d8a945');
    g.circle(0, 0, r - 2);
    g.stroke();
    g.lineWidth = 2;
    g.strokeColor = Kit.color('#fff0b066');
    g.circle(0, 0, r - 8);
    g.stroke();
    const l = Kit.label(n, icon, Math.round(r * 0.8), '#ffe7a6', { outline: '#2a1000', outlineW: 3, name: 'icon' });
    l.node.setPosition(0, 2, 0);
    return n;
}

export class Hud {
    /** 給 DEV 工具與版面系統用：key → 節點 */
    nodes: Record<string, Node> = {};
    labels: Record<string, Label[]> = {};

    private balanceL!: Label;
    private winL!: Label;
    private betL!: Label;
    private headerMsg!: Label;
    private headerNum!: Label;
    private multL!: Label;
    private fgNum!: Label;
    private jpL: Label[] = [];
    private spinArrow!: Node;
    private spinRing!: Node;
    private autoL!: Label;
    private turboIcon!: Label;
    private soundIcon!: Label;
    private tipIdx = 0;
    private tips = HEADER_TIPS_BASE;
    private headerBusy = false;
    private jpBar!: Node;
    private bottomBg!: Node;

    onSpin: () => void = () => {};
    onBet: (dir: number) => void = () => {};
    onAuto: () => void = () => {};
    onTurbo: () => void = () => {};
    onMenu: () => void = () => {};
    onBuy: () => void = () => {};
    onSound: () => void = () => {};

    constructor(parent: Node) {
        this.buildJackpots(parent);
        this.buildHeader(parent);
        this.buildMult(parent);
        this.buildFg(parent);
        this.buildBottom(parent);
        this.buildButtons(parent);
        // 每 3 秒輪播提示
        setInterval(() => this.nextTip(), 3200);
    }

    private reg(key: string, n: Node, ...labels: Label[]) {
        this.nodes[key] = n;
        if (labels.length) this.labels[key] = labels;
    }

    // ------------------------------------------------------------ 建立
    private buildJackpots(parent: Node) {
        const n = Kit.mk('jackpots', parent, 1920, 52);
        this.jpBar = Kit.mk('bar', n, 1920, 52);
        const names = ['GRAND', 'MAJOR', 'MINOR', 'MINI'];
        const colors = ['#ff6b5a', '#d98bff', '#6fc3ff', '#7dffb0'];
        const labels: Label[] = [];
        names.forEach((nm, i) => {
            const seg = Kit.mk('jp' + i, n, 460, 50);
            const t = Kit.label(seg, nm, 24, colors[i], { outline: '#000000', outlineW: 2, name: 'name' });
            t.horizontalAlign = Label.HorizontalAlign.LEFT;
            t.node.getComponent(UITransform)!.setAnchorPoint(0, 0.5);
            t.node.setPosition(-200, 0, 0);
            const v = Kit.label(seg, '0.00', 26, '#fff3cf', { outline: '#000000', outlineW: 2, name: 'val' });
            v.node.getComponent(UITransform)!.setAnchorPoint(1, 0.5);
            v.node.setPosition(200, 0, 0);
            this.jpL.push(v);
            labels.push(t, v);
        });
        this.reg('jackpots', n, ...labels);
    }

    private buildHeader(parent: Node) {
        const n = Kit.mk('header', parent, 330, 76);
        this.headerMsg = Kit.label(n, HEADER_TIPS_BASE[0], 34, '#fff1c4', { outline: '#0b2b2e', outlineW: 2, name: 'msg' });
        // 牌匾寬度固定，字太長就自動縮小
        this.headerMsg.overflow = Label.Overflow.SHRINK;
        this.headerMsg.enableWrapText = false;
        this.headerMsg.node.getComponent(UITransform)!.setContentSize(240, 48);
        this.headerNum = Kit.bmLabel(n, Assets.fonts.num_gold, '', 42, 'num');
        this.headerNum.overflow = Label.Overflow.SHRINK;
        this.headerNum.enableWrapText = false;
        this.headerNum.node.getComponent(UITransform)!.setContentSize(250, 52);
        this.headerNum.node.active = false;
        this.reg('header', n, this.headerMsg);
    }

    private buildMult(parent: Node) {
        const n = Kit.mk('multRing', parent, 150, 150);
        const ring = Kit.sprite(n, Assets.sf('ui_mult_ring'), 'ring', 150, 150);
        void ring;
        this.multL = Kit.bmLabel(n, Assets.fonts.num_white, '0x', 46, 'mult');
        this.multL.overflow = Label.Overflow.SHRINK;
        this.multL.enableWrapText = false;
        this.multL.node.getComponent(UITransform)!.setContentSize(84, 56);
        n.active = false;
        this.reg('multRing', n, this.multL);
    }

    private buildFg(parent: Node) {
        const n = Kit.mk('fgCounter', parent, 360, 300);
        const t = Kit.sprite(n, Assets.sf('title_freegames'), 'title');
        Kit.fitWidth(t, 300);
        t.node.setPosition(0, -60, 0);
        // 數字畫在標題之上，不被遮住
        this.fgNum = Kit.bmLabel(n, Assets.fonts.num_gold, '15', 110, 'num');
        this.fgNum.node.setPosition(0, 85, 0);
        n.active = false;
        this.reg('fgCounter', n, this.fgNum);
    }

    private buildBottom(parent: Node) {
        const n = Kit.mk('bottomBar', parent, 1920, 64);
        this.bottomBg = Kit.mk('bg', n, 1920, 64);
        // 玩家頭像 + 名稱
        const av = Kit.mk('avatar', n, 56, 56);
        const g = av.addComponent(Graphics);
        g.fillColor = Kit.color('#2c1b46');
        g.circle(0, 0, 26);
        g.fill();
        g.lineWidth = 3;
        g.strokeColor = Kit.color('#d8a945');
        g.circle(0, 0, 26);
        g.stroke();
        Kit.label(av, '☥', 30, '#ffd86a', { name: 'eye' });
        const name = Kit.label(n, '賽特勇士', 24, '#e9dcff', { name: 'name' });
        name.node.getComponent(UITransform)!.setAnchorPoint(0, 0.5);
        // 點數 / 贏分
        const mk = (key: string, cap: string, x: number) => {
            const box = Kit.mk(key, n, 260, 64);
            box.setPosition(x, 0, 0);
            const v = Kit.label(box, '0.00', 32, '#fff6dc', { outline: '#000000', outlineW: 2, name: 'val' });
            v.node.setPosition(0, 11, 0);
            const c = Kit.label(box, cap, 22, '#e2d4ff', { bold: false, name: 'cap' });
            c.node.setPosition(0, -19, 0);
            return v;
        };
        this.balanceL = mk('balance', '點數', -260);
        this.winL = mk('win', '贏分', -20);
        this.reg('bottomBar', n, this.balanceL, this.winL, name);
        av.name = 'avatar';
        this.layoutBottom(1920);
    }

    private buildButtons(parent: Node) {
        // 押注 - 值 +
        const bet = Kit.mk('betCtrl', parent, 330, 70);
        Kit.panel(bet, 330, 64, '#12081fd8', '#d8a94588', 32, 2, 'bg');
        this.betL = Kit.label(bet, '8.00', 32, '#ffffff', { name: 'val' });
        this.betL.node.setPosition(0, 10, 0);
        const cap = Kit.label(bet, '押注', 20, '#e2d4ff', { bold: false, name: 'cap' });
        cap.node.setPosition(0, -17, 0);
        const minus = roundBtn(bet, 'minus', '−', 26);
        minus.setPosition(-135, 0, 0);
        const plus = roundBtn(bet, 'plus', '+', 26);
        plus.setPosition(135, 0, 0);
        Kit.button(minus, () => this.onBet(-1));
        Kit.button(plus, () => this.onBet(1));
        this.reg('betCtrl', bet, this.betL);

        // SPIN 主按鈕：外圈魔法光環 + 金框紫底 + 旋轉箭頭
        const spin = Kit.mk('spinBtn', parent, 230, 230);
        this.spinRing = Kit.sprite(spin, Assets.sf('glow_purple'), 'ring', 330, 330).node;
        Kit.additive(this.spinRing.getComponent(Sprite)!);
        tween(this.spinRing).repeatForever(tween(this.spinRing)
            .to(1.4, { scale: new Vec3(1.08, 1.08, 1) }, { easing: 'sineInOut' })
            .to(1.4, { scale: new Vec3(0.94, 0.94, 1) }, { easing: 'sineInOut' })).start();
        // 只有中心（箭頭＋漩渦）旋轉，金框固定不動
        const core = Kit.sprite(spin, Assets.sf('ui_spin_core') || Assets.sf('ui_spin'), 'core', 220, 220);
        if (Assets.sf('ui_spin_rim')) Kit.sprite(spin, Assets.sf('ui_spin_rim'), 'rim', 220, 220);
        this.spinArrow = core.node;
        Kit.button(spin, () => this.onSpin(), 0.9);
        this.reg('spinBtn', spin);

        const turbo = roundBtn(parent, 'turboBtn', '⚡', 46);
        this.turboIcon = turbo.getChildByName('icon')!.getComponent(Label)!;
        Kit.button(turbo, () => this.onTurbo());
        this.reg('turboBtn', turbo);

        const auto = roundBtn(parent, 'autoBtn', '↻', 46);
        this.autoL = Kit.label(auto, '', 20, '#ffffff', { name: 'cnt', outline: '#000000', outlineW: 2 });
        this.autoL.node.setPosition(0, -30, 0);
        Kit.button(auto, () => this.onAuto());
        this.reg('autoBtn', auto);

        const menu = roundBtn(parent, 'menuBtn', '≡', 40);
        Kit.button(menu, () => this.onMenu());
        this.reg('menuBtn', menu);

        const snd = roundBtn(parent, 'soundBtn', '♪', 40);
        this.soundIcon = snd.getChildByName('icon')!.getComponent(Label)!;
        Kit.button(snd, () => this.onSound());
        this.reg('soundBtn', snd);

        // 購買特色
        const buy = Kit.mk('buyBtn', parent, 210, 120);
        Kit.panel(buy, 200, 112, '#3a1458e8', '#f2c75c', 22, 4, 'bg');
        const t1 = Kit.label(buy, '購買特色', 30, '#ffe7a0', { outline: '#2a0a3a', outlineW: 3, name: 't1' });
        t1.node.setPosition(0, 18, 0);
        const t2 = Kit.label(buy, '免費遊戲', 20, '#e8d4ff', { bold: false, name: 't2' });
        t2.node.setPosition(0, -22, 0);
        Kit.button(buy, () => this.onBuy());
        this.reg('buyBtn', buy, t1);
    }

    // ------------------------------------------------------------ 版面（依可視寬度調整全寬元件）
    relayoutWidth(w: number, portrait: boolean) {
        // Jackpot 條
        const n = this.nodes.jackpots;
        const bar = this.jpBar;
        // 同一節點只能有一個渲染元件：重用並清空
        const g = bar.getComponent(Graphics) || bar.addComponent(Graphics);
        g.clear();
        g.fillColor = Kit.color('#0d0618e0');
        g.rect(-w / 2, -26, w, 52);
        g.fill();
        g.lineWidth = 2;
        g.strokeColor = Kit.color('#d8a94599');
        g.moveTo(-w / 2, -26); g.lineTo(w / 2, -26); g.stroke();
        n.getComponent(UITransform)!.setContentSize(w, 52);
        // 直式：2x2；橫式：一排 4 個
        const segs = [0, 1, 2, 3].map((i) => n.getChildByName('jp' + i)!);
        if (portrait) {
            const sw = w / 2;
            segs.forEach((s, i) => {
                s.setPosition((i % 2 - 0.5) * sw, i < 2 ? 0 : -50, 0);
                this.segWidth(s, sw - 30);
            });
            g.rect(-w / 2, -76, w, 50);
            g.fill();
        } else {
            const sw = Math.min(480, w / 4);
            segs.forEach((s, i) => {
                s.setPosition((i - 1.5) * sw, 0, 0);
                this.segWidth(s, sw - 30);
                if (i) {
                    g.lineWidth = 2;
                    g.strokeColor = Kit.color('#d8a94566');
                    g.moveTo((i - 2) * sw, -18); g.lineTo((i - 2) * sw, 18); g.stroke();
                }
            });
        }
        this.layoutBottom(w);
    }

    private segWidth(seg: Node, w: number) {
        seg.getChildByName('name')!.setPosition(-w / 2, 0, 0);
        seg.getChildByName('val')!.setPosition(w / 2, 0, 0);
    }

    private layoutBottom(w: number) {
        const n = this.nodes.bottomBar;
        if (!n) return;
        const bg = this.bottomBg;
        const g = bg.getComponent(Graphics) || bg.addComponent(Graphics);
        g.clear();
        g.fillColor = Kit.color('#0d0618e8');
        g.rect(-w / 2, -40, w, 80);
        g.fill();
        g.lineWidth = 2;
        g.strokeColor = Kit.color('#d8a94588');
        g.moveTo(-w / 2, 40); g.lineTo(w / 2, 40); g.stroke();
        n.getComponent(UITransform)!.setContentSize(w, 80);
        const av = n.getChildByName('avatar');
        const nm = n.getChildByName('name');
        const narrow = w < 1300;
        if (av) av.setPosition(-w / 2 + 50, 0, 0);
        if (nm) { nm.setPosition(-w / 2 + 90, 0, 0); nm.active = !narrow; }
        n.getChildByName('balance')!.setPosition(narrow ? -w / 2 + 230 : -260, 0, 0);
        n.getChildByName('win')!.setPosition(narrow ? w / 2 - 170 : -20, 0, 0);
    }

    // ------------------------------------------------------------ 狀態
    setBalance(v: number) { this.balanceL.string = Kit.fmt(v); }
    setWin(v: number) { this.winL.string = Kit.fmt(v); }
    setBet(v: number) { this.betL.string = Kit.fmt(v); }
    /** Jackpot 條顯示的就是實際派彩金額（由主控依押注與累積獎池算好，QA P1-19） */
    setJackpots(vals: number[]) { this.jpL.forEach((l, i) => (l.string = Kit.fmt(vals[i] || 0))); }

    setMode(mode: 'base' | 'free' | 'awaken') {
        if (this.tips !== (mode === 'base' ? HEADER_TIPS_BASE : mode === 'free' ? HEADER_TIPS_FREE : HEADER_TIPS_AWAKEN)) this.headerBusy = false;
        this.tips = mode === 'base' ? HEADER_TIPS_BASE : mode === 'free' ? HEADER_TIPS_FREE : HEADER_TIPS_AWAKEN;
        this.tipIdx = 0;
        this.nodes.multRing.active = mode !== 'base';
        this.nodes.fgCounter.active = mode !== 'base';
        this.nodes.buyBtn.active = BUY_ENABLED && mode === 'base';
        if (!this.headerBusy) this.showTip();
    }

    private nextTip() {
        if (this.headerBusy) return;
        this.tipIdx = (this.tipIdx + 1) % this.tips.length;
        this.showTip();
    }

    private showTip() {
        this.headerNum.node.active = false;
        this.headerMsg.node.active = true;
        this.headerMsg.string = this.tips[this.tipIdx];
        // 淡入切換（不用壓扁縮放，避免版面重排時停在半途）
        const n = this.headerMsg.node;
        Tween.stopAllByTarget(n);
        n.setScale(1, 1, 1);
        const op = Kit.opacity(n);
        Tween.stopAllByTarget(op);
        op.opacity = 90;
        tween(op).to(0.25, { opacity: 255 }).start();
    }

    /** 標題列顯示累計贏分（例如 12.80 或 18.00 x 24） */
    headerWin(text: string) {
        this.headerBusy = true;
        this.headerMsg.node.active = false;
        const l = this.headerNum;
        l.node.active = true;
        l.string = text;
        Tween.stopAllByTarget(l.node);
        l.node.setScale(1.25, 1.25, 1);
        tween(l.node).to(0.2, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
    }

    headerIdle() {
        this.headerBusy = false;
        this.showTip();
    }

    setMult(v: number, pop = true) {
        this.multL.string = `${v}x`;
        if (pop) {
            const n = this.multL.node;
            Tween.stopAllByTarget(n);
            n.setScale(1.6, 1.6, 1);
            tween(n).to(0.3, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        }
    }

    setFgCount(v: number) {
        this.fgNum.string = String(v);
        const n = this.fgNum.node;
        Tween.stopAllByTarget(n);
        n.setScale(1.3, 1.3, 1);
        tween(n).to(0.25, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
    }

    /** 旋轉中：SPIN 箭頭轉動、光環變亮 */
    setSpinning(on: boolean) {
        Tween.stopAllByTarget(this.spinArrow);
        if (on) {
            tween(this.spinArrow).by(0.6, { angle: -360 }).repeatForever().start();
        } else {
            tween(this.spinArrow).to(0.3, { angle: Math.round(this.spinArrow.angle / 360) * 360 }, { easing: 'quadOut' }).start();
        }
        Kit.opacity(this.spinRing).opacity = on ? 255 : 170;
    }

    setAuto(count: number) { this.autoL.string = count > 0 ? String(count) : count < 0 ? '∞' : ''; }
    setTurbo(on: boolean) { this.turboIcon.color = Kit.color(on ? '#7df9ff' : '#ffe7a6'); }
    setSound(on: boolean) { this.soundIcon.string = on ? '♪' : '✕'; }

    /** 取得倍數框世界座標（倍數球飛行目標） */
    multWorld(): Vec3 { return this.nodes.multRing.worldPosition.clone(); }
    headerWorld(): Vec3 { return this.nodes.header.worldPosition.clone(); }
}
