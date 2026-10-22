import {
    Node, UITransform, Sprite, SpriteFrame, Label, Color, Vec3, Vec2, tween, Tween, UIOpacity,
    BitmapFont, gfx, UIRenderer, Font, director,
} from 'cc';
import { Assets } from '../view/Assets';

/** 共用小工具：建立節點、補間 Promise、按鈕、顏色 */
export class Kit {
    /** 全域動畫倍速（快速模式 > 1） */
    static speed = 1;
    /** DEV 編輯模式時暫停遊戲按鈕 */
    static inputLocked = false;

    static mk(name: string, parent: Node | null, w = 0, h = 0): Node {
        const n = new Node(name);
        if (parent) {
            n.layer = parent.layer;
            parent.addChild(n);
        }
        const ut = n.addComponent(UITransform);
        ut.setContentSize(w, h);
        return n;
    }

    static sprite(parent: Node, sf: SpriteFrame | null, name = 'sprite', w = 0, h = 0): Sprite {
        const n = Kit.mk(name, parent);
        const sp = n.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.trim = false;
        sp.spriteFrame = sf;
        const ut = n.getComponent(UITransform)!;
        if (w && h) ut.setContentSize(w, h);
        else if (sf) ut.setContentSize(sf.originalSize.width, sf.originalSize.height);
        return sp;
    }

    /** 以指定寬度等比顯示 */
    static fitWidth(sp: Sprite, w: number) {
        const sf = sp.spriteFrame;
        if (!sf) return;
        const r = sf.originalSize.height / sf.originalSize.width;
        sp.node.getComponent(UITransform)!.setContentSize(w, w * r);
    }

    static label(parent: Node, text: string, size = 32, color = '#ffffff', opts: {
        bold?: boolean; outline?: string; outlineW?: number; shadow?: boolean; font?: string; name?: string;
    } = {}): Label {
        const n = Kit.mk(opts.name || 'label', parent);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = size;
        l.lineHeight = Math.round(size * 1.2);
        l.isBold = opts.bold !== false;
        l.useSystemFont = true;
        l.fontFamily = opts.font || 'PingFang TC, Microsoft JhengHei, Arial Black, sans-serif';
        l.color = Kit.color(color);
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = Label.VerticalAlign.CENTER;
        l.overflow = Label.Overflow.NONE;
        if (opts.outline) Kit.outline(l, opts.outline, opts.outlineW ?? Math.max(2, Math.round(size / 12)));
        if (opts.shadow) Kit.shadow(l);
        return l;
    }

    /** 3.8 起 Label 內建描邊，舊版退回 LabelOutline 元件 */
    static outline(l: Label, color: string, width: number) {
        const a = l as any;
        if ('enableOutline' in a) {
            a.enableOutline = true;
            a.outlineColor = Kit.color(color);
            a.outlineWidth = width;
        }
    }

    static shadow(l: Label, color = '#000000aa', ox = 2, oy = -3, blur = 3) {
        const a = l as any;
        if ('enableShadow' in a) {
            a.enableShadow = true;
            a.shadowColor = Kit.color(color);
            a.shadowOffset = new Vec2(ox, oy);
            a.shadowBlur = blur;
        }
    }

    static bmLabel(parent: Node, font: BitmapFont | Font | null, text: string, size = 60, name = 'num'): Label {
        const n = Kit.mk(name, parent);
        const l = n.addComponent(Label);
        if (font) {
            l.useSystemFont = false;
            l.font = font;
        } else {
            l.useSystemFont = true;
            l.fontFamily = 'Arial Black';
            l.color = Kit.color('#ffd34a');
            Kit.outline(l, '#3a1600', 4);
        }
        l.fontSize = size;
        l.lineHeight = size * 1.15;
        l.string = text;
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = Label.VerticalAlign.CENTER;
        l.overflow = Label.Overflow.NONE;
        return l;
    }

    static color(hex: string): Color {
        const h = hex.replace('#', '');
        const r = parseInt(h.substring(0, 2), 16);
        const g = parseInt(h.substring(2, 4), 16);
        const b = parseInt(h.substring(4, 6), 16);
        const a = h.length >= 8 ? parseInt(h.substring(6, 8), 16) : 255;
        return new Color(r, g, b, a);
    }

    static opacity(n: Node): UIOpacity {
        return n.getComponent(UIOpacity) || n.addComponent(UIOpacity);
    }

    /**
     * 等待（遊戲時間，會套用倍速）。用 Cocos tween 計時而不是 setTimeout：
     * 分頁切到背景時遊戲迴圈暫停，等待也一起暫停，演出不會錯拍（QA P2-15）
     */
    static wait(sec: number): Promise<void> {
        return Kit.delay(sec / Kit.speed);
    }

    /** 等待（遊戲時間，不套倍速） */
    static delay(sec: number): Promise<void> {
        return new Promise((r) => { tween({ t: 0 }).delay(Math.max(0, sec)).call(() => r()).start(); });
    }

    /** 遊戲時間（毫秒，背景分頁時不前進） */
    static now(): number { return director.getTotalTime(); }

    /** 每隔 sec 秒（遊戲時間）呼叫一次，回傳停止函式 */
    static every(sec: number, fn: () => void): () => void {
        let alive = true;
        const loop = () => { if (!alive) return; fn(); Kit.delay(sec).then(loop); };
        Kit.delay(sec).then(loop);
        return () => { alive = false; };
    }

    /** tween → Promise（時間會套用倍速） */
    static to(target: any, dur: number, props: any, easing: any = 'quadOut'): Promise<void> {
        return new Promise((resolve) => {
            tween(target).to(dur / Kit.speed, props, { easing }).call(() => resolve()).start();
        });
    }

    static fade(n: Node, to: number, dur: number, easing: any = 'linear'): Promise<void> {
        return Kit.to(Kit.opacity(n), dur, { opacity: to }, easing);
    }

    static stop(n: Node) {
        Tween.stopAllByTarget(n);
        const op = n.getComponent(UIOpacity);
        if (op) Tween.stopAllByTarget(op);
    }

    static v3(x: number, y: number, z = 0) { return new Vec3(x, y, z); }

    /** 加色混合（發光特效）；不支援時維持一般混合 */
    static additive(r: UIRenderer) {
        try {
            const a = r as any;
            a.srcBlendFactor = gfx.BlendFactor.SRC_ALPHA;
            a.dstBlendFactor = gfx.BlendFactor.ONE;
        } catch (e) { /* 舊版本不支援就算了 */ }
    }

    /** 讓節點變成按鈕：按下縮小、放開回彈並觸發 */
    static button(n: Node, onClick: () => void, pressScale = 0.92) {
        let base = n.scale.clone();
        n.on(Node.EventType.TOUCH_START, () => {
            if (Kit.inputLocked) return;
            base = n.scale.clone();
            Tween.stopAllByTarget(n);
            tween(n).to(0.06, { scale: new Vec3(base.x * pressScale, base.y * pressScale, 1) }).start();
        });
        const release = (fire: boolean) => {
            Tween.stopAllByTarget(n);
            tween(n).to(0.12, { scale: base }, { easing: 'backOut' }).start();
            if (fire && !Kit.inputLocked) onClick();
        };
        n.on(Node.EventType.TOUCH_END, () => release(true));
        n.on(Node.EventType.TOUCH_CANCEL, () => release(false));
    }

    /**
     * 實心矩形（遮罩、閃光用）。用 Sprite + 白色貼圖染色，才會吃 UIOpacity 做半透明與淡入淡出
     * （Graphics 的頂點色不吃節點透明度，QA P0-3）
     */
    static rect(parent: Node, w: number, h: number, color: string, name = 'rect'): Sprite {
        const sp = Kit.sprite(parent, Assets.sf('white'), name, w, h);
        sp.color = Kit.color(color);
        return sp;
    }

    /** 圓角面板：九宮格 Sprite（底色）＋九宮格外框，可整塊淡入淡出 */
    static panel(parent: Node, w: number, h: number, fill: string, stroke?: string, radius = 16, strokeW = 3, name = 'panel'): Sprite {
        void strokeW;
        if (radius <= 0) return Kit.rect(parent, w, h, fill, name);
        const sp = Kit.sprite(parent, Assets.sf('ui_round_fill'), name, w, h);
        sp.type = Sprite.Type.SLICED;
        sp.color = Kit.color(fill);
        if (stroke) {
            const st = Kit.sprite(sp.node, Assets.sf('ui_round_stroke'), 'stroke', w, h);
            st.type = Sprite.Type.SLICED;
            st.color = Kit.color(stroke);
        }
        return sp;
    }

    static fmt(v: number): string {
        return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    static rand(a: number, b: number) { return a + Math.random() * (b - a); }
}
