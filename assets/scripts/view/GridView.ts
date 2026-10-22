import { Node, Sprite, Label, Vec3, UITransform, Mask, Graphics, tween, Tween } from 'cc';
import { Kit } from '../util/Kit';
import { Assets } from './Assets';
import { FxLayer } from './Fx';
import { CELL_W, CELL_H, TIMING } from '../layout/Layouts';
import { Board, Cell, COLS, ROWS, TumbleStep, WinGroup } from '../core/SlotEngine';

/** 每種符號在格子裡的顯示尺寸（寬，等比） */
const SYM_SIZE: Record<string, number> = {
    ruby: 124, amethyst: 124, topaz: 124, emerald: 96, sapphire: 96,
    khopesh: 146, cobra: 146, bow: 146, eye: 146,
    pharaoh: 140, scatter: 168, orb: 136,
};

/** 單一符號 */
export class SymbolView {
    node: Node;
    cell!: Cell;
    private art: Sprite;
    private glow: Sprite;
    private text: Label | null = null;
    private sun = false;

    constructor(parent: Node) {
        this.node = Kit.mk('sym', parent, CELL_W, CELL_H);
        this.glow = Kit.sprite(this.node, Assets.sf('glow_gold'), 'glow', 200, 200);
        Kit.additive(this.glow);
        this.art = Kit.sprite(this.node, null, 'art');
    }

    set(cell: Cell, sun: boolean) {
        this.cell = cell;
        this.sun = sun;
        Kit.stop(this.node);
        this.node.setScale(1, 1, 1);
        this.node.angle = 0;
        Kit.opacity(this.node).opacity = 255;
        const id = cell.id;
        const key = id === 'orb' ? (sun ? 'orb_sun' : 'orb_green') : 'sym_' + id;
        this.art.spriteFrame = Assets.sf(key);
        Kit.fitWidth(this.art, SYM_SIZE[id] || 130);
        this.art.node.setPosition(0, id === 'scatter' ? 12 : 0, 0);
        this.art.node.setScale(1, 1, 1);
        // 特殊符號有底光
        const special = id === 'scatter' || id === 'orb' || id === 'pharaoh';
        this.glow.node.active = special;
        if (special) {
            this.glow.spriteFrame = Assets.sf(id === 'orb' && !sun ? 'glow_blue' : id === 'scatter' ? 'glow_purple' : 'glow_gold');
            this.glow.color = Kit.color(id === 'orb' && !sun ? '#7dffb0' : '#ffffff');
            Kit.opacity(this.glow.node).opacity = 150;
            tween(this.glow.node).repeatForever(
                tween(this.glow.node).to(0.8, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'sineInOut' })
                    .to(0.8, { scale: new Vec3(0.9, 0.9, 1) }, { easing: 'sineInOut' })).start();
        } else {
            Tween.stopAllByTarget(this.glow.node);
        }
        // 文字：倍數 / SCATTER / WILD
        const txt = id === 'orb' ? `${cell.mult}x` : id === 'scatter' ? 'SCATTER' : id === 'pharaoh' ? 'WILD' : '';
        if (txt) {
            if (!this.text) this.text = Kit.label(this.node, '', 30, '#ffe9a0', { outline: '#3b1300', outlineW: 4 });
            const t = this.text;
            t.node.active = true;
            if (id === 'orb') {
                t.useSystemFont = !Assets.fonts.num_white;
                if (Assets.fonts.num_white) t.font = Assets.fonts.num_white;
                t.fontSize = (cell.mult || 0) >= 100 ? 40 : 50;
                t.lineHeight = t.fontSize * 1.2;
                t.node.setPosition(0, -2, 0);
            } else {
                t.useSystemFont = true;
                t.fontFamily = 'Arial Black, Impact, sans-serif';
                t.fontSize = id === 'scatter' ? 30 : 28;
                t.lineHeight = t.fontSize * 1.2;
                t.color = Kit.color(id === 'scatter' ? '#ffe58a' : '#fff6cf');
                Kit.outline(t, id === 'scatter' ? '#5a1500' : '#3d2200', 5);
                t.node.setPosition(0, id === 'scatter' ? -56 : -60, 0);
            }
            t.string = txt;
        } else if (this.text) {
            this.text.node.active = false;
        }
    }

    /** 中獎跳動 */
    pulse() {
        const a = this.art.node;
        Tween.stopAllByTarget(a);
        tween(a).to(0.15 / Kit.speed, { scale: new Vec3(1.18, 1.18, 1) }, { easing: 'quadOut' })
            .to(0.2 / Kit.speed, { scale: new Vec3(1.05, 1.05, 1) }, { easing: 'quadIn' })
            .to(0.15 / Kit.speed, { scale: new Vec3(1.12, 1.12, 1) })
            .to(0.2 / Kit.speed, { scale: new Vec3(1, 1, 1) }).start();
    }

    /** 慶祝晃動（SCATTER / 倍數球） */
    wiggle(times = 3) {
        const a = this.art.node;
        Tween.stopAllByTarget(a);
        let t = tween(a);
        for (let i = 0; i < times; i++) {
            t = t.to(0.08, { angle: 8, scale: new Vec3(1.15, 1.15, 1) }).to(0.08, { angle: -8 });
        }
        t.to(0.1, { angle: 0, scale: new Vec3(1, 1, 1) }).start();
    }
}

/** 盤面：背板 + 遮罩內的符號 + 盤框 + 特效層 */
export class GridView {
    root: Node;
    back: Node;
    clip: Node;
    frame: Node;
    fx: Node;
    views: SymbolView[][] = [];
    private pool: SymbolView[] = [];
    sun = false;

    constructor(parent: Node) {
        const W = CELL_W * COLS, H = CELL_H * ROWS;
        this.root = Kit.mk('reel', parent, W, H);
        // 背板：深紫半透明 + 軸線
        this.back = Kit.mk('back', this.root, W, H);
        const g = this.back.addComponent(Graphics);
        g.fillColor = Kit.color('#1b0f2ee6');
        g.roundRect(-W / 2 - 8, -H / 2 - 8, W + 16, H + 16, 10);
        g.fill();
        g.lineWidth = 2;
        g.strokeColor = Kit.color('#ffffff12');
        for (let c = 1; c < COLS; c++) {
            const x = -W / 2 + c * CELL_W;
            g.moveTo(x, -H / 2 + 6);
            g.lineTo(x, H / 2 - 6);
        }
        g.stroke();
        // 遮罩：符號從上方落下時不會露出盤框外
        this.clip = Kit.mk('clip', this.root, W + 10, H + 10);
        const m = this.clip.addComponent(Mask);
        m.type = Mask.Type.GRAPHICS_RECT;
        // 盤框
        this.frame = Kit.mk('frame', this.root);
        const fsf = Assets.sf('ui_frame');
        if (fsf) {
            const fr = Kit.sprite(this.frame, fsf, 'img');
            const meta = Assets.frameMeta;
            // 依量測到的內框把框圖縮放到剛好包住盤面
            if (meta) {
                const sx = (W + 26) / meta.innerW, sy = (H + 26) / meta.innerH;
                fr.node.getComponent(UITransform)!.setContentSize(meta.w * sx, meta.h * sy);
                fr.node.setPosition((meta.w / 2 - meta.innerCx) * sx, (meta.innerCy - meta.h / 2) * sy, 0);
            } else {
                fr.node.getComponent(UITransform)!.setContentSize(W * 1.18, H * 1.32);
            }
        } else {
            const fg = this.frame.addComponent(Graphics);
            fg.lineWidth = 14;
            fg.strokeColor = Kit.color('#d9a640');
            fg.roundRect(-W / 2 - 14, -H / 2 - 14, W + 28, H + 28, 14);
            fg.stroke();
        }
        this.fx = Kit.mk('gridFx', this.root, W, H);
        for (let c = 0; c < COLS; c++) this.views.push([]);
    }

    static pos(c: number, r: number): Vec3 {
        return new Vec3((c - (COLS - 1) / 2) * CELL_W, ((ROWS - 1) / 2 - r) * CELL_H, 0);
    }

    private take(cell: Cell): SymbolView {
        const v = this.pool.pop() || new SymbolView(this.clip);
        v.node.active = true;
        v.set(cell, this.sun);
        return v;
    }

    private give(v: SymbolView) {
        Kit.stop(v.node);
        v.node.active = false;
        this.pool.push(v);
    }

    /** 直接擺好盤面（無動畫） */
    setBoard(b: Board) {
        for (let c = 0; c < COLS; c++) {
            for (const v of this.views[c]) this.give(v);
            this.views[c] = b[c].map((cell, r) => {
                const v = this.take(cell);
                v.node.setPosition(GridView.pos(c, r));
                return v;
            });
        }
    }

    /** 舊盤面往下掉出、新盤面從上方落下 */
    async spinIn(b: Board, onColLand?: (c: number) => void, slowCols: number[] = []) {
        const H = CELL_H * ROWS;
        // 舊符號掉出
        const outs: Promise<void>[] = [];
        for (let c = 0; c < COLS; c++) {
            const col = this.views[c];
            col.forEach((v, r) => {
                const p = v.node.position;
                outs.push(Kit.wait(c * 0.03 + (ROWS - 1 - r) * 0.015).then(() =>
                    Kit.to(v.node, 0.22, { position: new Vec3(p.x, p.y - H - CELL_H, 0) }, 'quadIn')).then(() => this.give(v)));
            });
            this.views[c] = [];
        }
        await Kit.wait(0.12);
        // 新符號落下
        const ins: Promise<void>[] = [];
        let delay = 0;
        for (let c = 0; c < COLS; c++) {
            if (slowCols.indexOf(c) >= 0) delay += 0.55;  // SCATTER 期待感：慢一點
            const colDelay = delay;
            const col = b[c].map((cell, r) => {
                const v = this.take(cell);
                const to = GridView.pos(c, r);
                v.node.setPosition(to.x, to.y + H + CELL_H * 0.5, 0);
                ins.push(Kit.wait(colDelay + (ROWS - 1 - r) * 0.035).then(() => this.land(v, to)));
                return v;
            });
            this.views[c] = col;
            const cc = c;
            ins.push(Kit.wait(colDelay + TIMING.dropIn).then(() => onColLand && onColLand(cc)));
            delay += TIMING.colStagger;
        }
        await Promise.all(outs.concat(ins));
    }

    /** 落地：加速落下 + 小彈跳 */
    private async land(v: SymbolView, to: Vec3) {
        await Kit.to(v.node, TIMING.dropIn, { position: to }, 'quadIn');
        await Kit.to(v.node, 0.07, { position: new Vec3(to.x, to.y + 12, 0) }, 'quadOut');
        await Kit.to(v.node, 0.08, { position: to }, 'quadIn');
    }

    /** 中獎展示：發光框 + 跳動 + 金額 */
    async showWins(step: TumbleStep, fmtAmount: (w: WinGroup) => string) {
        const frames: Node[] = [];
        const seen = new Set<string>();
        for (const w of step.wins) {
            for (const [c, r] of w.cells) {
                const k = c + ',' + r;
                if (seen.has(k)) continue;
                seen.add(k);
                const sf = Assets.sf('win_frame');
                const fr = Kit.sprite(this.fx, sf, 'winFrame');
                fr.node.setPosition(GridView.pos(c, r));
                Kit.additive(fr);
                const op = Kit.opacity(fr.node);
                op.opacity = 0;
                tween(op).to(0.12, { opacity: 255 }).start();
                tween(fr.node).repeatForever(tween(fr.node).to(0.3, { scale: new Vec3(1.04, 1.04, 1) }).to(0.3, { scale: new Vec3(1, 1, 1) })).start();
                frames.push(fr.node);
                this.views[c][r]?.pulse();
            }
        }
        // 每組在重心附近顯示贏分
        const labels: Node[] = [];
        step.wins.forEach((w, i) => {
            let sx = 0, sy = 0;
            for (const [c, r] of w.cells) { const p = GridView.pos(c, r); sx += p.x; sy += p.y; }
            const cx = sx / w.cells.length, cy = sy / w.cells.length;
            const l = Kit.bmLabel(this.fx, Assets.fonts.num_gold, fmtAmount(w), 44, 'amt');
            l.node.setPosition(cx, cy + i * 8, 0);
            l.node.setScale(0.3, 0.3, 1);
            tween(l.node).delay(0.05 * i).to(0.25, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
            labels.push(l.node);
        });
        await Kit.wait(TIMING.winShow);
        for (const n of frames) { Kit.stop(n); n.destroy(); }
        for (const n of labels) { Kit.stop(n); n.destroy(); }
    }

    /** 消除 → 剩下的往下掉 → 補新符號 */
    async tumble(step: TumbleStep) {
        const dead = new Set<string>();
        for (const w of step.wins) for (const [c, r] of w.cells) dead.add(c + ',' + r);
        // 爆炸
        const fx = FxLayer.inst;
        dead.forEach((k) => {
            const [c, r] = k.split(',').map(Number);
            const v = this.views[c][r];
            const p = GridView.pos(c, r);
            fx?.burst(p.x, p.y, this.fx);
            if (v) {
                Kit.to(v.node, TIMING.explode, { scale: new Vec3(0.2, 0.2, 1) }, 'backIn');
                Kit.fade(v.node, 0, TIMING.explode);
            }
        });
        await Kit.wait(TIMING.explode);
        // 重新排列每一軸
        const H = CELL_H * ROWS;
        const jobs: Promise<void>[] = [];
        for (let c = 0; c < COLS; c++) {
            const keep = this.views[c].filter((_, r) => !dead.has(c + ',' + r));
            this.views[c].filter((_, r) => dead.has(c + ',' + r)).forEach((v) => this.give(v));
            const add = step.refill[c].map((cell, i) => {
                const v = this.take(cell);
                const n = step.refill[c].length;
                const to = GridView.pos(c, i);
                v.node.setPosition(to.x, to.y + n * CELL_H + 40, 0);
                return v;
            });
            const col = add.concat(keep);
            col.forEach((v, r) => {
                const to = GridView.pos(c, r);
                if (v.node.position.y !== to.y) {
                    jobs.push(Kit.wait(c * 0.04 + (ROWS - r) * 0.02).then(() => this.land(v, to)));
                }
            });
            this.views[c] = col;
        }
        void H;
        await Promise.all(jobs);
    }

    /** 找出盤面上的符號（例如倍數球、SCATTER） */
    find(id: string): { c: number; r: number; v: SymbolView }[] {
        const out: { c: number; r: number; v: SymbolView }[] = [];
        for (let c = 0; c < COLS; c++) this.views[c].forEach((v, r) => { if (v.cell.id === id) out.push({ c, r, v }); });
        return out;
    }

    /** 換皮（覺醒後倍數球改太陽球） */
    setSun(sun: boolean) {
        this.sun = sun;
    }
}
