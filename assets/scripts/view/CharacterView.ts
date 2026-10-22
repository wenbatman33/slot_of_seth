import { Node, sp, UITransform, Vec3 } from 'cc';
import { Kit } from '../util/Kit';
import { Assets } from './Assets';

/**
 * Spine 骨骼角色
 *  idle：待機循環（火焰跳動、呼吸、布料擺動）
 *  cast：施法（依影片逐格分析：泛光 → 舉過頭蓄力 → 甩出 → 收回、火焰重燃）
 */
export class CharacterView {
    node: Node;
    skel: sp.Skeleton | null = null;
    private busy = false;
    /** 施法動畫中「甩出」的時間點（秒），在這一刻發射能量球 */
    private throwAt: number;

    constructor(parent: Node, name: string, key: string, throwAt: number) {
        this.node = Kit.mk(key, parent);
        this.throwAt = throwAt;
        const data = Assets.spines[name];
        if (!data) {
            console.warn('[CharacterView] 缺少 spine', name);
            return;
        }
        const sk = this.node.addComponent(sp.Skeleton);
        sk.premultipliedAlpha = false;
        sk.skeletonData = data;
        sk.setMix('idle', 'cast', 0.12);
        sk.setMix('cast', 'idle', 0.25);
        sk.setAnimation(0, 'idle', true);
        this.skel = sk;
    }

    /**
     * 施法；在甩出的瞬間 resolve，回傳火焰（手掌）的世界座標
     */
    cast(): Promise<Vec3> {
        const sk = this.skel;
        if (!sk) return Promise.resolve(this.node.worldPosition.clone());
        this.busy = true;
        sk.setAnimation(0, 'cast', false);
        sk.addAnimation(0, 'idle', true, 0);
        setTimeout(() => (this.busy = false), 1500 / Math.max(1, sk.timeScale));
        return new Promise((resolve) => {
            setTimeout(() => resolve(this.flameWorld()), (this.throwAt * 1000) / Math.max(0.1, sk.timeScale));
        });
    }

    get isBusy() { return this.busy; }

    /** 中大獎時也施法（不發射） */
    win() {
        if (!this.busy) this.cast();
    }

    /** 火焰骨頭的世界座標 */
    flameWorld(): Vec3 {
        const sk = this.skel;
        const ut = this.node.getComponent(UITransform)!;
        if (sk) {
            const b: any = sk.findBone('flame');
            if (b) return ut.convertToWorldSpaceAR(new Vec3(b.worldX, b.worldY, 0));
        }
        return this.node.worldPosition.clone();
    }

    setSpeed(v: number) {
        if (this.skel) this.skel.timeScale = v;
    }
}
