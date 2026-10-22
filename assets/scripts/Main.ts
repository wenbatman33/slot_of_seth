import {
    _decorator, Component, Node, view, ResolutionPolicy, screen, game, Sprite, Label, UITransform, Vec3, Vec2,
    tween, Tween, input, Input, EventKeyboard, KeyCode, Color, sys,
} from 'cc';
import { Kit } from './util/Kit';
import { Assets } from './view/Assets';
import { FxLayer } from './view/Fx';
import { GridView, SymbolView } from './view/GridView';
import { CharacterView } from './view/CharacterView';
import { Hud } from './view/Hud';
import { Celebrations } from './view/Celebrations';
import { Sfx } from './view/Sfx';
import { DevTool, DevHost, DEV_STORE_KEY } from './dev/DevTool';
import {
    LAYOUT_PC, LAYOUT_MOBILE, LayoutMap, ElemLayout, DESIGN_PC, DESIGN_MOBILE, TIMING,
} from './layout/Layouts';
import {
    SlotEngine, SpinResult, Mode, BUY_COST_X, PAYTABLE, winTier, round2, JACKPOTS, SCATTER_PAY, MAX_WIN_X,
} from './core/SlotEngine';

const { ccclass } = _decorator;

const BETS = [0.4, 0.8, 1, 2, 4, 8, 10, 20, 40, 80, 100, 200];
/** 手機橫拿（畫面矮）時 HUD 放大倍率，避免按鈕與說明字太小（QA P1-6） */
const HUD_KEYS = ['jackpots', 'bottomBar', 'betCtrl', 'spinBtn', 'turboBtn', 'autoBtn', 'menuBtn', 'soundBtn'];

/**
 * 主控：版面 / 流程 / 狀態
 * 掛在場景 Canvas 底下的 Game 節點上（由 cocos-mcp-server 建立）
 */
@ccclass('Main')
export class Main extends Component implements DevHost {
    private root!: Node;
    private bg!: Sprite;
    private bgFire!: Sprite;
    private ambient!: Node;
    private charL!: CharacterView;
    private charR!: CharacterView;
    private grid!: GridView;
    private hud!: Hud;
    private fxTop!: Node;
    private cele!: Celebrations;
    private dev: DevTool | null = null;
    private logo!: Node;

    private engine = new SlotEngine();
    private L: { pc: LayoutMap; mobile: LayoutMap } = { pc: clone(LAYOUT_PC), mobile: clone(LAYOUT_MOBILE) };
    private forcedLayout: 'auto' | 'pc' | 'mobile' = 'auto';
    private portrait = false;
    private vis = { w: 1920, h: 1080 };

    // 遊戲狀態
    private balance = 20000;
    private betIdx = 5;
    private mode: Mode = 'base';
    private busy = false;
    private auto = 0;
    private turbo = false;
    private fgLeft = 0;
    private fgTotal = 0;
    private totalMult = 0;
    private revealed = new Set<number>();
    private nextCaster = 0;
    private forceScatter = false;
    private forceOrb = false;
    /** Jackpot 累積獎池（以押注倍數記錄，見 SlotEngine.JACKPOTS） */
    private jpPool = JACKPOTS.map(() => 0);
    private loadingLabel: Label | null = null;
    private ready = false;

    get bet() { return BETS[this.betIdx]; }

    // ================================================================ 啟動
    onLoad() {
        this.loadStored();
        this.root = Kit.mk('root', this.node);
        this.applyResolution();
        // 載入畫面：網頁版用 index.ejs 的主題載入層；編輯器預覽沒有它時才在畫布上顯示文字
        const W = (typeof window !== 'undefined' ? window : {}) as any;
        const htmlLoading = typeof W.__seth2Loading === 'function';
        const ld = Kit.mk('loading', this.root);
        if (!htmlLoading) this.loadingLabel = Kit.label(ld, '載入中 0%', 40, '#f2c75c', { outline: '#000000', outlineW: 3 });
        Assets.load((p) => {
            if (htmlLoading) W.__seth2Loading(p);
            if (this.loadingLabel) this.loadingLabel.string = `載入中 ${Math.round(p * 100)}%`;
        }).then(() => {
            ld.destroy();
            this.loadingLabel = null;
            this.build();
            if (htmlLoading) W.__seth2LoadingDone();
        });

        const onResize = debounce(() => { this.applyResolution(); if (this.ready) this.applyLayout(); }, 80);
        view.on('canvas-resize', onResize);
        (screen as any).on?.('window-resize', onResize);
        (screen as any).on?.('orientation-change', onResize);
        if (typeof window !== 'undefined') window.addEventListener('resize', onResize);
        input.on(Input.EventType.KEY_DOWN, this.onKey, this);
    }

    private loadStored() {
        try {
            const raw = sys.localStorage.getItem(DEV_STORE_KEY);
            if (!raw) return;
            const d = JSON.parse(raw);
            // 只合併已知 key，避免舊存檔帶入錯誤欄位
            for (const k of Object.keys(this.L.pc)) if (d.pc?.[k]) this.L.pc[k] = { ...this.L.pc[k], ...d.pc[k] };
            for (const k of Object.keys(this.L.mobile)) if (d.mobile?.[k]) this.L.mobile[k] = { ...this.L.mobile[k], ...d.mobile[k] };
            if (d.timing) Object.assign(TIMING, d.timing);
        } catch (e) { /* 忽略損壞存檔 */ }
    }

    private build() {
        const R = this.root;
        // 背景（主遊戲紫色 / 覺醒火焰）
        this.bg = Kit.sprite(R, null, 'bg');
        this.bgFire = Kit.sprite(this.bg.node, null, 'fire');
        Kit.opacity(this.bgFire.node).opacity = 0;
        this.ambient = Kit.mk('ambient', R);
        // 角色（Spine 骨骼）
        this.charL = new CharacterView(R, 'seth', 'charL', 0.7);
        this.charR = new CharacterView(R, 'goddess', 'charR', 0.62);
        for (const c of [this.charL, this.charR]) {
            const ut = c.node.getComponent(UITransform)!;
            ut.setAnchorPoint(0.5, 0);
            ut.setContentSize(620, 1100);
        }
        // 盤面
        this.grid = new GridView(R);
        this.grid.isPending = (c) => !this.revealed.has(c.uid);
        // Logo（文字標誌）
        this.logo = Kit.mk('logo', R, 420, 160);
        const lt = Kit.label(this.logo, '戰神賽特 II', 72, '#ffd66b', { outline: '#3a1300', outlineW: 7, name: 't' });
        Kit.shadow(lt, '#000000cc', 0, -5, 6);
        const ls = Kit.label(this.logo, '覺 醒 之 力', 30, '#bfefff', { outline: '#071c3a', outlineW: 4, name: 's' });
        ls.node.setPosition(0, -60, 0);
        // HUD
        this.hud = new Hud(R);
        this.hud.nodes.logo = this.logo;
        this.hud.labels.logo = [lt];
        this.hud.onSpin = () => this.onSpinPressed();
        this.hud.onBet = (d) => this.changeBet(d);
        this.hud.onAuto = () => this.toggleAuto();
        this.hud.onTurbo = () => this.toggleTurbo();
        this.hud.onMenu = () => this.showInfo();
        this.hud.onBuy = () => this.buyFeature();
        this.hud.onSound = () => this.hud.setSound(Sfx.toggle());
        // 最上層特效 / 演出
        this.fxTop = Kit.mk('fx', R);
        this.fxTop.addComponent(FxLayer);
        this.cele = new Celebrations(R, () => this.vis);

        this.grid.setBoard(this.engine.spin('base', 1).final);
        this.grid.views.forEach((col) => col.forEach((v) => { this.revealed.add(v.cell.uid); if (v.cell.id === 'orb') v.setPending(false); }));
        this.refreshHud();
        this.hud.setMode('base');
        this.ready = true;
        this.applyLayout();

        // 第一次點擊解鎖音效
        const unlock = () => { Sfx.unlock(); };
        this.node.on(Node.EventType.TOUCH_START, unlock);
        if (typeof window !== 'undefined') {
            window.addEventListener('pointerdown', unlock, { once: true });
            this.dev = new DevTool(this);
            (window as any).__seth2 = this; // 方便除錯
            (window as any).__kit = Kit;    // 除錯：可改 __kit.speed 慢動作檢查演出
        }
        // 環境火星
        this.schedule(() => this.spawnAmbient(), 0.12);
    }

    // ================================================================ 解析度與版面
    private applyResolution() {
        const fs = screen.windowSize;
        const auto = fs.height > fs.width;
        this.portrait = this.forcedLayout === 'auto' ? auto : this.forcedLayout === 'mobile';
        const D = this.portrait ? DESIGN_MOBILE : DESIGN_PC;
        const ar = fs.width / Math.max(1, fs.height);
        const dar = D.w / D.h;
        view.setDesignResolutionSize(D.w, D.h, ar >= dar ? ResolutionPolicy.FIXED_HEIGHT : ResolutionPolicy.FIXED_WIDTH);
        const vs = view.getVisibleSize();
        this.vis = { w: vs.width, h: vs.height };
    }

    private anchorPos(e: ElemLayout): Vec3 {
        if (e.a === 'P') return new Vec3(e.x, e.y, 0);  // 子元件：相對父元件
        const W = this.vis.w / 2, H = this.vis.h / 2;
        let x = 0, y = 0;
        if (e.a.indexOf('L') >= 0) x = -W;
        if (e.a.indexOf('R') >= 0) x = W;
        if (e.a.indexOf('T') >= 0) y = H;
        if (e.a.indexOf('B') >= 0) y = -H;
        return new Vec3(x + e.x, y + e.y, 0);
    }

    private elem(key: string): Node | null {
        switch (key) {
            case 'bg': return this.bg?.node || null;
            case 'charL': return this.charL?.node || null;
            case 'charR': return this.charR?.node || null;
            case 'reel': return this.grid?.root || null;
            default: return this.hud?.nodes[key] || null;
        }
    }

    applyLayout() {
        if (!this.ready) return;
        const lay = this.portrait ? this.L.mobile : this.L.pc;
        // 背景：蓋滿可視範圍
        const bgName = this.portrait ? 'bg_port_purple' : 'bg_land_purple';
        const fireName = this.portrait ? 'bg_port_fire' : 'bg_land_fire';
        this.bg.spriteFrame = Assets.sf(bgName);
        this.bgFire.spriteFrame = Assets.sf(fireName);
        const sf = this.bg.spriteFrame;
        if (sf) {
            const sc = Math.max(this.vis.w / sf.originalSize.width, this.vis.h / sf.originalSize.height);
            this.bg.node.getComponent(UITransform)!.setContentSize(sf.originalSize.width * sc, sf.originalSize.height * sc);
            this.bgFire.node.getComponent(UITransform)!.setContentSize(sf.originalSize.width * sc, sf.originalSize.height * sc);
        }
        const cssH = typeof window !== 'undefined' ? window.innerHeight : 1080;
        const boost = !this.portrait && cssH < 520 ? 1.35 : 1;
        for (const key of Object.keys(lay)) {
            const n = this.elem(key);
            if (!n) continue;
            const e = lay[key];
            const k = HUD_KEYS.indexOf(key) >= 0 ? boost : 1;
            n.setPosition(this.anchorPos({ ...e, x: e.x * k, y: e.y * k }));
            const s = e.s * k;
            n.setScale(s, s, 1);
            (n as any).__ls = s;  // 數字彈跳動畫結束時回到這個縮放
            n.angle = e.r || 0;
            Kit.opacity(n).opacity = e.o ?? 255;
            if (key === 'multRing' || key === 'fgCounter' || key === 'buyBtn' || key === 'headerMsg' || key === 'headerNum') {
                // 依遊戲狀態控制顯示，版面只控制「是否允許顯示」
                if (e.v === false) n.active = false;
            } else {
                n.active = e.v !== false;
            }
            const labels = this.hud.labels[key];
            if (labels && labels.length) {
                if (e.fs) labels[0].fontSize = e.fs, labels[0].lineHeight = e.fs * 1.2;
                if (e.c && labels[0].useSystemFont) labels[0].color = Kit.color(e.c);
            }
        }
        this.hud.relayoutWidth(this.vis.w / boost, this.portrait);
        this.hud.setMode(this.mode);
        if (lay.multRing?.v === false) this.hud.nodes.multRing.active = false;
    }

    // ================================================================ DevHost
    layoutKey(): 'pc' | 'mobile' { return this.portrait ? 'mobile' : 'pc'; }
    forced() { return this.forcedLayout; }
    forceLayout(k: 'auto' | 'pc' | 'mobile') { this.forcedLayout = k; this.applyResolution(); this.applyLayout(); }
    layouts() { return this.L; }
    apply() { this.applyLayout(); }
    resetLayouts() {
        this.L = { pc: clone(LAYOUT_PC), mobile: clone(LAYOUT_MOBILE) };
        try { sys.localStorage.removeItem(DEV_STORE_KEY); } catch (e) { /* 無所謂 */ }
        this.applyLayout();
    }

    private clientToLocal(cx: number, cy: number) {
        const r = (game.canvas as HTMLCanvasElement).getBoundingClientRect();
        return { x: ((cx - r.left) / r.width - 0.5) * this.vis.w, y: (0.5 - (cy - r.top) / r.height) * this.vis.h };
    }

    clientDelta(dx: number, dy: number) {
        const r = (game.canvas as HTMLCanvasElement).getBoundingClientRect();
        return { x: (dx / r.width) * this.vis.w, y: (-dy / r.height) * this.vis.h };
    }

    hitTest(cx: number, cy: number): string | null {
        const p = this.clientToLocal(cx, cy);
        const wp = this.root.worldPosition;
        const world = new Vec3(wp.x + p.x, wp.y + p.y, 0);
        const lay = this.portrait ? this.L.mobile : this.L.pc;
        // 由上層往下找（bg 不參與點選）
        const keys = Object.keys(lay).filter((k) => k !== 'bg').reverse();
        for (const k of keys) {
            const n = this.elem(k);
            if (!n || !n.activeInHierarchy) continue;
            const ut = n.getComponent(UITransform);
            if (!ut) continue;
            const box = ut.getBoundingBoxToWorld();
            if (box.width > 0 && box.contains(new Vec2(world.x, world.y))) return k;
        }
        return null;
    }

    trigger(action: string) {
        const bet = this.bet;
        switch (action) {
            case 'big': this.cele.bigWin(bet * 25, bet); break;
            case 'super': this.cele.bigWin(bet * 80, bet); break;
            case 'mega': this.cele.bigWin(bet * 220, bet); break;
            case 'legendary': this.cele.bigWin(bet * 900, bet); break;
            case 'fgIntro': this.cele.freeGamesIntro(15); break;
            case 'fgEnter': this.setMode('free'); this.fgLeft = 15; this.hud.setFgCount(15); this.hud.setMult(0, false); break;
            case 'awaken': this.cele.awaken(() => this.setMode('awaken')); break;
            case 'fgOutro': this.cele.freeGamesOutro(bet * 123.4); break;
            case 'fire': this.cele.wave('fire'); break;
            case 'purple': this.cele.wave('purple'); break;
            case 'castL': this.castTo(this.charL, []); break;
            case 'castR': this.castTo(this.charR, []); break;
            case 'jackpot': this.cele.jackpot(JACKPOTS[2].name, this.jpAmount(2)); break;
            case 'force4': this.forceScatter = true; break;
            case 'forceOrb': this.forceOrb = true; break;
            case 'base': this.setMode('base'); break;
        }
    }

    // ================================================================ 操作
    private onKey(e: EventKeyboard) {
        if (this.dev?.isOpen) return;
        if (e.keyCode === KeyCode.SPACE) this.onSpinPressed();
    }

    private onSpinPressed() {
        Sfx.unlock();
        if (this.cele.modal > 0) return;  // 確認窗、說明窗等開著時不旋轉（QA P0-2）
        if (this.auto) { this.auto = 0; this.hud.setAuto(0); return; }
        if (this.busy || this.mode !== 'base') return;
        this.playBaseSpin(false);
    }

    private changeBet(d: number) {
        if (this.busy || this.mode !== 'base') return;
        this.betIdx = Math.max(0, Math.min(BETS.length - 1, this.betIdx + d));
        Sfx.play('click');
        this.refreshHud();
    }

    private toggleAuto() {
        Sfx.unlock();
        this.auto = this.auto ? 0 : -1;
        this.hud.setAuto(this.auto);
        if (this.auto && !this.busy && this.mode === 'base') this.playBaseSpin(false);
    }

    private toggleTurbo() {
        this.turbo = !this.turbo;
        Kit.speed = this.turbo ? TIMING.turbo : 1;
        this.hud.setTurbo(this.turbo);
        this.charL.setSpeed(this.turbo ? 1.6 : 1);
        this.charR.setSpeed(this.turbo ? 1.6 : 1);
    }

    private async buyFeature() {
        if (this.busy || this.mode !== 'base') return;
        Sfx.unlock();
        // 確認窗開著期間鎖住流程，避免同時開始一般旋轉後購買被吃掉（QA P0-2）
        this.busy = true;
        const cost = round2(this.bet * BUY_COST_X);
        const ok = await this.cele.confirm('購買免費遊戲', `花費 ${Kit.fmt(cost)}（${BUY_COST_X} 倍押注）\n直接獲得 15 次免費遊戲`, '購買');
        this.busy = false;
        if (!ok) return;
        if (this.balance < cost) { this.toast('點數不足'); return; }
        // 扣款後立刻開始（playBaseSpin 在第一個 await 前就會設 busy，不會被插隊）
        this.balance = round2(this.balance - cost);
        this.refreshHud();
        this.playBaseSpin(true);
    }

    private showInfo() {
        if (this.cele.modal > 0) return;
        const p = (k: string) => PAYTABLE[k].map((v) => v + 'x').join(' / ');
        const sc = SCATTER_PAY;
        this.cele.info([
            [
                '【玩法】',
                '6 軸 × 5 列，任意位置出現',
                '8 個以上相同符號即中獎。',
                '中獎符號消除後上方落下補位，',
                '可連續消除。',
                '',
                '【倍數球】',
                '賽特與女祭司施法打入盤面，',
                '主遊戲：倍數加總後乘上贏分。',
                '免費遊戲：倍數累加成總倍數。',
            ],
            [
                '【免費遊戲】',
                '4 個以上 SCATTER 贏得 15 次。',
                '',
                '【覺醒之力】',
                '免費遊戲中 3 個以上 SCATTER，',
                '賽特覺醒，再加 5 次，',
                '並出現法老百搭與太陽倍數球。',
                '',
                `最高贏分 ${MAX_WIN_X} 倍押注。`,
            ],
            [
                '【賠率】8-9 / 10-11 / 12+ 個',
                `彎刀　　 ${p('khopesh')}`,
                `眼鏡蛇　 ${p('cobra')}`,
                `弓　　　 ${p('bow')}`,
                `荷魯斯眼 ${p('eye')}`,
                `紅寶石　 ${p('ruby')}`,
                `紫晶　　 ${p('amethyst')}`,
                `黃玉　　 ${p('topaz')}`,
                `祖母綠　 ${p('emerald')}`,
                `藍寶石　 ${p('sapphire')}`,
                `SCATTER 4/5/6 個：${sc[4]}x / ${sc[5]}x / ${sc[6]}x`,
            ],
        ]);
    }

    private toast(msg: string) {
        const l = Kit.label(this.root, msg, 40, '#ffe7a0', { outline: '#000000', outlineW: 4, name: 'toast' });
        l.node.setPosition(0, 0, 0);
        tween(l.node).by(1.2, { position: new Vec3(0, 80, 0) }).call(() => l.node.destroy()).start();
    }

    private refreshHud() {
        this.hud.setBalance(this.balance);
        this.hud.setBet(this.bet);
        this.hud.setJackpots(JACKPOTS.map((_, i) => this.jpAmount(i)));
    }

    /** Jackpot 實際派彩金額：(固定倍數 + 累積) × 目前押注，條上顯示的就是這個數 */
    private jpAmount(i: number) { return round2((JACKPOTS[i].x + this.jpPool[i]) * this.bet); }

    private setMode(m: Mode) {
        this.mode = m;
        Sfx.setIntensity(m === 'base' ? 0 : m === 'free' ? 1 : 2);
        this.grid.setSun(m === 'awaken');
        this.hud.setMode(m);
        const fireOp = Kit.opacity(this.bgFire.node);
        Tween.stopAllByTarget(fireOp);
        tween(fireOp).to(0.6, { opacity: m === 'awaken' ? 255 : 0 }).start();
        if (m === 'base') this.totalMult = 0;
    }

    // ================================================================ 流程
    /** 主遊戲一轉（buy = 購買免費遊戲） */
    private async playBaseSpin(buy: boolean) {
        if (this.busy) return;
        if (!buy) {
            if (this.balance < this.bet) { this.toast('點數不足'); this.auto = 0; this.hud.setAuto(0); return; }
            this.balance = round2(this.balance - this.bet);
        }
        this.busy = true;
        this.hud.setWin(0);
        this.refreshHud();
        const res = this.engine.spin('base', this.bet, 0, buy || this.consumeForceScatter(), { forceOrb: this.consumeForceOrb() });
        if (!buy) { JACKPOTS.forEach((j, i) => (this.jpPool[i] += j.grow)); this.refreshHud(); }
        const win = await this.runSpin(res);
        if (res.jackpot >= 0) await this.payJackpot(res.jackpot);
        if (res.freeSpinsAwarded) {
            this.balance = round2(this.balance + win);
            this.refreshHud();
            await this.runFreeGames(res.freeSpinsAwarded, win, res.scatterPay);
        } else {
            if (winTier(win, this.bet) >= 0) await this.cele.bigWin(win, this.bet, (v) => this.hud.setWin(v));
            this.balance = round2(this.balance + win);
            this.refreshHud();
        }
        this.busy = false;
        this.hud.headerIdle();
        if (this.auto) {
            await Kit.wait(0.35);
            if (this.auto && this.mode === 'base') this.playBaseSpin(false);
        }
    }

    private consumeForceOrb(): number {
        if (!this.forceOrb) return 0;
        this.forceOrb = false;
        return 10;
    }

    private consumeForceScatter(): boolean {
        if (!this.forceScatter) return false;
        this.forceScatter = false;
        return true;
    }

    /**
     * 播放一轉的完整演出，回傳本轉贏分
     */
    private async runSpin(res: SpinResult): Promise<number> {
        this.hud.setSpinning(true);
        Sfx.play('drop');
        // 1) 落下（SCATTER 已有 3 個時，後面幾軸放慢製造期待感）
        const scCols: number[] = [];
        let sc = 0;
        res.initial.forEach((col, c) => {
            if (sc >= (this.mode === 'base' ? 3 : 2)) scCols.push(c);
            if (col.some((x) => x.id === 'scatter')) sc++;
        });
        await this.grid.spinIn(res.initial, (c) => {
            Sfx.play('land');
            if (res.initial[c].some((x) => x.id === 'scatter')) Sfx.play('scatter');
        }, scCols);
        this.hideNewOrbs();
        await this.revealOrbs();
        // 2) 連續消除
        let acc = 0;
        for (const step of res.steps) {
            acc = round2(acc + step.stepWin);
            this.hud.headerWin(Kit.fmt(acc));
            this.hud.setWin(this.mode === 'base' ? acc : round2(this.fgTotal + acc));
            Sfx.play('win');
            await this.grid.showWins(step, (w) => Kit.fmt(w.amount));
            Sfx.play('explode');
            await this.grid.tumble(step);
            this.hideNewOrbs();
            await this.revealOrbs();
        }
        // 3) 倍數
        let win = res.totalWin;
        if (res.appliedMult > 0 && acc > 0) {
            await this.collectOrbs(res, acc);
        }
        if (res.scatterPay > 0) {
            for (const s of this.grid.find('scatter')) s.v.wiggle();
            Sfx.play('scatter');
        }
        this.hud.setSpinning(false);
        if (win > 0) {
            this.hud.headerWin(Kit.fmt(win));
            this.hud.setWin(this.mode === 'base' ? win : round2(this.fgTotal + win));
            if (winTier(win, this.bet) < 0 && Math.random() < 0.5) (this.nextCaster++ % 2 ? this.charR : this.charL).win();
        }
        return win;
    }

    /** 新出現的倍數球先藏起數字，等角色施法打中才揭曉 */
    private hideNewOrbs() {
        for (const { v } of this.grid.find('orb')) {
            if (!this.revealed.has(v.cell.uid)) v.setPending(true);
        }
    }

    /** 角色施法：發射能量球到每一顆新倍數球的位置 */
    private async revealOrbs() {
        const fresh = this.grid.find('orb').filter((o) => !this.revealed.has(o.v.cell.uid));
        if (!fresh.length) return;
        fresh.forEach((o) => this.revealed.add(o.v.cell.uid));
        const caster = this.nextCaster++ % 2 === 0 ? this.charL : this.charR;
        await this.castTo(caster, fresh.map((o) => o.v));
    }

    private async castTo(caster: CharacterView, targets: SymbolView[]) {
        Sfx.play('cast');
        const hand = await caster.cast();
        const blue = caster === this.charL;
        const fx = FxLayer.inst;
        const local = (w: Vec3) => this.fxTop.getComponent(UITransform)!.convertToNodeSpaceAR(w);
        const from = local(hand);
        const jobs = targets.map((v, i) => new Promise<void>((resolve) => {
            const to = local(v.node.worldPosition);
            const ball = Kit.sprite(this.fxTop, Assets.sf(blue ? 'fx_flame_blue' : 'fx_flame_purple'), 'ball', 150, 150);
            Kit.additive(ball);
            const glow = Kit.sprite(ball.node, Assets.sf(blue ? 'glow_blue' : 'glow_purple'), 'g', 260, 260);
            Kit.additive(glow);
            ball.node.setPosition(from);
            ball.node.setScale(0.4, 0.4, 1);
            const ctrl = new Vec3((from.x + to.x) / 2, Math.max(from.y, to.y) + 260, 0);
            const st = { t: 0 };
            const dur = 0.42 / Kit.speed;
            tween(st).delay(i * 0.08).to(dur, { t: 1 }, {
                easing: 'quadIn',
                onUpdate: () => {
                    const t = st.t, u = 1 - t;
                    const x = u * u * from.x + 2 * u * t * ctrl.x + t * t * to.x;
                    const y = u * u * from.y + 2 * u * t * ctrl.y + t * t * to.y;
                    ball.node.setPosition(x, y, 0);
                    const s = 0.4 + t * 0.6;
                    ball.node.setScale(s, s, 1);
                    ball.node.angle = Math.atan2(to.y - y, to.x - x) * 57.3 - 90;
                    fx?.trail(x, y, blue ? '#7fc4ff' : '#e58bff', this.fxTop);
                },
            }).call(() => {
                ball.node.destroy();
                fx?.burst(to.x, to.y, this.fxTop, blue ? '#9fd8ff' : '#ffb0ff');
                Sfx.play('impact');
                // 倍數揭曉：球彈一下、數字從大縮回
                v.reveal();
                tween(v.node).to(0.12, { scale: new Vec3(1.2, 1.2, 1) }, { easing: 'quadOut' })
                    .to(0.2, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
                Sfx.play('orb');
                resolve();
            }).start();
        }));
        await Promise.all(jobs);
    }

    /** 倍數球飛向標題列（主遊戲）或倍數框（免費遊戲），套用倍數 */
    private async collectOrbs(res: SpinResult, acc: number) {
        const orbs = this.grid.find('orb');
        const toWorld = this.mode === 'base' ? this.hud.headerWorld() : this.hud.multWorld();
        const local = (w: Vec3) => this.fxTop.getComponent(UITransform)!.convertToNodeSpaceAR(w);
        const target = local(toWorld);
        let sum = 0;
        let mult = this.totalMult;
        for (const o of orbs) {
            o.v.wiggle(2);
            await Kit.wait(0.15);
            const from = local(o.v.node.worldPosition);
            const ghost = Kit.sprite(this.fxTop, Assets.sf(this.mode === 'awaken' ? 'orb_sun' : 'orb_green'), 'ghost', 120, 120);
            ghost.node.setPosition(from);
            const lbl = Kit.bmLabel(ghost.node, Assets.fonts.num_white, `${o.v.cell.mult}x`, 46);
            void lbl;
            Sfx.play('orb');
            await new Promise<void>((resolve) => {
                const st = { t: 0 };
                tween(st).to(TIMING.orbFly / Kit.speed, { t: 1 }, {
                    easing: 'quadIn',
                    onUpdate: () => {
                        const x = from.x + (target.x - from.x) * st.t, y = from.y + (target.y - from.y) * st.t;
                        ghost.node.setPosition(x, y, 0);
                        FxLayer.inst?.trail(x, y, '#ff7ae6', this.fxTop);
                    },
                }).call(() => { ghost.node.destroy(); resolve(); }).start();
            });
            sum += o.v.cell.mult || 0;
            if (this.mode === 'base') {
                this.hud.headerWin(`${Kit.fmt(acc)} x ${sum}`);
            } else {
                mult += o.v.cell.mult || 0;
                this.hud.setMult(mult);
                this.hud.headerWin(`${Kit.fmt(acc)} x ${mult}`);
            }
            FxLayer.inst?.burst(target.x, target.y, this.fxTop, '#ffd0ff');
        }
        if (this.mode !== 'base') this.totalMult = res.totalMult;
        await Kit.wait(0.5);
        this.hud.headerWin(Kit.fmt(res.totalWin));
        Sfx.play('win');
        await Kit.wait(0.4);
    }

    // ================================================================ 免費遊戲
    private async runFreeGames(count: number, triggerWin = 0, scatterPay = 0) {
        // 觸發順序依原作（QA P2-8）：SCATTER 晃動、標題列累加 SCATTER 贏分 → 「15 免費遊戲」→ 火焰龍捲轉場 → 開始
        for (const s of this.grid.find('scatter')) s.v.wiggle(4);
        Sfx.play('scatter');
        this.charL.win();
        this.charR.win();
        if (scatterPay > 0) {
            const from = round2(triggerWin - scatterPay);
            const steps = 18;
            for (let i = 1; i <= steps; i++) {
                const v = round2(from + (scatterPay * i) / steps);
                this.hud.headerWin(Kit.fmt(v));
                this.hud.setWin(v);
                if (i % 3 === 0) Sfx.play('coin');
                await Kit.wait(0.07);
            }
            await Kit.wait(0.4);
        } else {
            await Kit.wait(0.8);
        }
        await this.cele.freeGamesIntro(count);
        await this.cele.wave('fire', () => {
            this.setMode('free');
            this.totalMult = 0;
            this.fgTotal = 0;
            this.hud.setMult(0, false);
            this.hud.setFgCount(count);
        });
        // 5000 倍上限包含觸發那一轉的贏分（QA P2-13）
        const cap = Math.max(0, this.bet * MAX_WIN_X - triggerWin);
        this.fgLeft = count;
        while (this.fgLeft > 0) {
            this.fgLeft--;
            this.hud.setFgCount(this.fgLeft);
            this.busy = true;
            const res = this.engine.spin(this.mode, this.bet, this.totalMult, false, { forceOrb: this.consumeForceOrb() });
            if (this.consumeForceScatter()) this.forceThreeScatters(res);
            const win = await this.runSpin(res);
            this.totalMult = res.totalMult;
            this.fgTotal = round2(Math.min(this.fgTotal + win, cap));
            this.hud.setWin(this.fgTotal);
            if (res.awakenTriggered) {
                for (const s of this.grid.find('scatter')) s.v.wiggle(4);
                await Kit.wait(0.6);
                await this.cele.awaken(() => this.setMode('awaken'));
                await this.extraSpins(res.freeSpinsAwarded);
            } else if (res.freeSpinsAwarded) {
                await this.extraSpins(res.freeSpinsAwarded);
            }
            if (this.fgTotal >= cap) { this.fgLeft = 0; this.toast(`達到最高贏分 ${MAX_WIN_X} 倍`); }
            await Kit.wait(0.45);
        }
        await Kit.wait(0.4);
        await this.cele.freeGamesOutro(this.fgTotal);
        const featureWin = round2(triggerWin + this.fgTotal);
        if (winTier(featureWin, this.bet) >= 0) await this.cele.bigWin(featureWin, this.bet);
        this.balance = round2(this.balance + this.fgTotal);
        this.refreshHud();
        await this.cele.wave('purple', () => {
            this.setMode('base');
            this.hud.setWin(featureWin);  // 底列贏分 = 觸發那一轉 + 免費遊戲（QA P2-13）
        });
    }

    /** DEV：免費遊戲中強制 3 個 SCATTER（測試覺醒） */
    private forceThreeScatters(res: SpinResult) {
        const cols = [0, 2, 4];
        cols.forEach((c, i) => {
            res.initial[c][1 + (i % 3)] = { id: 'scatter', uid: 800000 + i + Math.floor(Math.random() * 9999) };
        });
        // 重新計算觸發（演出用：直接當作觸發覺醒）
        res.freeSpinsAwarded = 5;
        res.awakenTriggered = this.mode === 'free';
        res.steps = [];
        res.final = res.initial;
        res.totalWin = 0;
        res.appliedMult = 0;
    }

    private async extraSpins(n: number) {
        this.fgLeft += n;
        this.hud.setFgCount(this.fgLeft);
        const l = Kit.bmLabel(this.root, Assets.fonts.num_gold, `+${n}`, 160, 'plus');
        l.node.setScale(0.2, 0.2, 1);
        Sfx.play('fg');
        await Kit.to(l.node, 0.35, { scale: new Vec3(1, 1, 1) }, 'backOut');
        await Kit.wait(0.6);
        const tgt = this.hud.nodes.fgCounter.position;
        await Kit.to(l.node, 0.4, { position: tgt, scale: new Vec3(0.3, 0.3, 1) }, 'quadIn');
        l.node.destroy();
    }

    // ================================================================ Jackpot / 環境
    private async payJackpot(i: number) {
        const amt = this.jpAmount(i);
        await this.cele.jackpot(JACKPOTS[i].name, amt);
        this.balance = round2(this.balance + amt);
        this.jpPool[i] = 0;
        this.refreshHud();
    }

    private spawnAmbient() {
        const fx = FxLayer.inst;
        if (!fx || !this.ready) return;
        const { w, h } = this.vis;
        const fire = this.mode === 'awaken';
        const tint = fire ? '#ffb14a' : Math.random() < 0.5 ? '#ffb86b' : '#d79bff';
        fx.ember(Kit.rand(-w / 2, w / 2), Kit.rand(-h / 2, -h / 4), tint, this.ambient);
    }
}

function clone<T>(o: T): T { return JSON.parse(JSON.stringify(o)); }

function debounce(fn: () => void, ms: number) {
    let t: any = null;
    return () => { if (t) clearTimeout(t); t = setTimeout(fn, ms); };
}

export { Color, Label };
