import { _decorator, Component, Node, Sprite, SpriteFrame, UIOpacity, Vec3, Color, UITransform } from 'cc';
import { Kit } from '../util/Kit';
import { Assets } from './Assets';

const { ccclass } = _decorator;

interface P {
    n: Node;
    sp: Sprite;
    op: UIOpacity;
    x: number; y: number; vx: number; vy: number; ax: number; ay: number; drag: number;
    rot: number; vr: number;
    s0: number; s1: number;
    a0: number; a1: number;
    life: number; t: number;
    /** 金幣翻轉 */
    flip: number;
    /** 是否淡入 */
    fin: boolean;
    w: number; h: number;
}

export interface SpawnOpt {
    vx?: number; vy?: number; ax?: number; ay?: number; drag?: number;
    rot?: number; vr?: number;
    s0?: number; s1?: number;
    a0?: number; a1?: number;
    life?: number;
    flip?: number;
    fadeIn?: boolean;
    add?: boolean;
    tint?: string;
    size?: number;
}

/** 輕量粒子系統：掛在最上層特效節點上，每幀更新 */
@ccclass('FxLayer')
export class FxLayer extends Component {
    static inst: FxLayer;
    private live: P[] = [];
    private pool: P[] = [];

    onLoad() { FxLayer.inst = this; }

    spawn(sfName: string, x: number, y: number, o: SpawnOpt = {}, parent?: Node): P | null {
        const sf: SpriteFrame | null = Assets.sf(sfName);
        if (!sf) return null;
        // 池中節點可能隨父層（例如大獎金幣層）一起被銷毀，略過失效者
        let p = this.pool.pop();
        while (p && !p.n.isValid) p = this.pool.pop();
        if (!p) {
            const n = Kit.mk('p', this.node);
            const sp = n.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.trim = false;
            const op = n.addComponent(UIOpacity);
            p = { n, sp, op } as P;
        }
        const tgt = parent || this.node;
        if (p.n.parent !== tgt) { p.n.removeFromParent(); tgt.addChild(p.n); }
        p.n.active = true;
        p.n.setSiblingIndex(tgt.children.length - 1);
        p.sp.spriteFrame = sf;
        const size = o.size || sf.originalSize.width;
        p.w = size; p.h = size * sf.originalSize.height / sf.originalSize.width;
        p.n.getComponent(UITransform)!.setContentSize(p.w, p.h);
        p.sp.color = o.tint ? Kit.color(o.tint) : Color.WHITE;
        if (o.add) Kit.additive(p.sp);
        p.x = x; p.y = y;
        p.vx = o.vx || 0; p.vy = o.vy || 0; p.ax = o.ax || 0; p.ay = o.ay || 0; p.drag = o.drag || 0;
        p.rot = o.rot || 0; p.vr = o.vr || 0;
        p.s0 = o.s0 ?? 1; p.s1 = o.s1 ?? p.s0;
        p.a0 = o.a0 ?? 255; p.a1 = o.a1 ?? 0;
        p.life = o.life || 1; p.t = 0;
        p.flip = o.flip || 0;
        p.fin = !!o.fadeIn;
        this.apply(p);
        this.live.push(p);
        return p;
    }

    private apply(p: P) {
        const k = Math.min(1, p.t / p.life);
        const s = p.s0 + (p.s1 - p.s0) * k;
        const fx = p.flip ? Math.cos(p.t * p.flip) : 1;
        p.n.setPosition(p.x, p.y, 0);
        p.n.setScale(s * fx, s, 1);
        p.n.angle = p.rot;
        // 透明度：線性 a0 → a1，fadeIn 時前 20% 淡入
        let a = p.a0 + (p.a1 - p.a0) * k;
        if (p.fin) a *= Math.min(1, k / 0.2);
        p.op.opacity = Math.max(0, Math.min(255, a));
    }

    update(dt: number) {
        dt *= Kit.speed > 1 ? 1.3 : 1;
        for (let i = this.live.length - 1; i >= 0; i--) {
            const p = this.live[i];
            p.t += dt;
            if (p.t >= p.life || !p.n.isValid) {
                p.n.active = false;
                this.live.splice(i, 1);
                if (p.n.isValid) this.pool.push(p);
                continue;
            }
            p.vx += p.ax * dt; p.vy += p.ay * dt;
            if (p.drag) { const d = Math.max(0, 1 - p.drag * dt); p.vx *= d; p.vy *= d; }
            p.x += p.vx * dt; p.y += p.vy * dt;
            p.rot += p.vr * dt;
            this.apply(p);
        }
    }

    clear() {
        for (const p of this.live) p.n.active = false;
        this.pool.push(...this.live.filter((p) => p.n.isValid));
        this.live.length = 0;
    }

    // ------------------------------------------------------------ 組合特效

    /** 消除爆炸：金色沙塵 + 星點 */
    burst(x: number, y: number, parent?: Node, tint = '#ffe9b0') {
        this.spawn('fx_burst', x, y, { s0: 0.5, s1: 1.5, a0: 255, a1: 0, life: 0.5, add: true, size: 220, rot: Kit.rand(0, 360), tint }, parent);
        for (let i = 0; i < 10; i++) {
            const a = Math.random() * Math.PI * 2, v = Kit.rand(120, 420);
            this.spawn('star', x, y, {
                vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 2.5, ay: -150,
                s0: Kit.rand(0.25, 0.5), s1: 0, a0: 255, a1: 0, life: Kit.rand(0.4, 0.8), add: true, size: 64,
                vr: Kit.rand(-360, 360), tint: '#fff2c8',
            }, parent);
        }
    }

    /** 金幣雨（大獎） */
    coinRain(w: number, h: number, count: number, parent?: Node) {
        for (let i = 0; i < count; i++) {
            const x = Kit.rand(-w / 2, w / 2);
            const fromBottom = Math.random() < 0.5;
            this.spawn('ui_coin', fromBottom ? Kit.rand(-w * 0.3, w * 0.3) : x, fromBottom ? -h / 2 - 60 : h / 2 + 60, {
                vx: fromBottom ? Kit.rand(-500, 500) : Kit.rand(-60, 60),
                vy: fromBottom ? Kit.rand(1300, 1900) : Kit.rand(-200, -50),
                ay: -1800, s0: Kit.rand(0.55, 1), a0: 255, a1: 255,
                life: Kit.rand(1.6, 2.4), flip: Kit.rand(6, 12), size: 110, vr: Kit.rand(-90, 90),
            }, parent);
        }
    }

    /** 環境飄浮火星 / 魔法粒子 */
    ember(x: number, y: number, tint: string, parent?: Node) {
        this.spawn('dot', x, y, {
            vx: Kit.rand(-25, 25), vy: Kit.rand(40, 120), s0: Kit.rand(0.2, 0.55), s1: 0,
            a0: 230, a1: 0, life: Kit.rand(1.5, 3), add: true, size: 40, tint, fadeIn: true,
        }, parent);
    }

    /** 拖尾（倍數球飛行用） */
    trail(x: number, y: number, tint: string, parent?: Node) {
        this.spawn('glow_purple', x, y, { s0: 0.5, s1: 0.05, a0: 220, a1: 0, life: 0.35, add: true, size: 120, tint }, parent);
    }
}
