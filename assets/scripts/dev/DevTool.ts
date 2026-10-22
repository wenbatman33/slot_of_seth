import { LayoutMap, ElemLayout, Anchor, TIMING } from '../layout/Layouts';
import { Kit } from '../util/Kit';

/**
 * DEV 開發者微調工具（HTML 疊層，只在瀏覽器執行）
 *  - 開關：鍵盤 D 或右下角齒輪
 *  - 在畫面上直接拖曳元件移動；滾輪縮放、Shift+滾輪旋轉
 *  - 面板滑桿：x / y / 縮放 / 旋轉 / 透明度 / 顯示 / 字級 / 顏色 / 錨點
 *  - PC / MOBILE 版型切換，分別調整
 *  - 狀態觸發：BIG/SUPER/MEGA/LEGENDARY、免費遊戲、覺醒、結算、轉場、Jackpot
 *  - 💾 匯出：輸出 JSON（複製到剪貼簿 + 下載），貼回 Layouts.ts 即可鎖定
 * 調整值會即時存到 localStorage，重新整理也會保留
 */
export interface DevHost {
    layoutKey(): 'pc' | 'mobile';
    forced(): 'auto' | 'pc' | 'mobile';
    forceLayout(k: 'auto' | 'pc' | 'mobile'): void;
    layouts(): { pc: LayoutMap; mobile: LayoutMap };
    apply(): void;
    hitTest(clientX: number, clientY: number): string | null;
    clientDelta(dx: number, dy: number): { x: number; y: number };
    trigger(action: string): void;
    resetLayouts(): void;
}

// 版面預設值大改時遞增版本，讓瀏覽器裡的舊微調值失效
export const DEV_STORE_KEY = 'seth2_layout_v4';

const TRIGGERS: [string, string][] = [
    ['big', 'BIG WIN'], ['super', 'SUPER WIN'], ['mega', 'MEGA WIN'], ['legendary', 'LEGENDARY'],
    ['fgIntro', '免費遊戲開場'], ['fgEnter', '進入免費遊戲'], ['awaken', '覺醒之力'], ['fgOutro', '免費遊戲結算'],
    ['fire', '火焰轉場'], ['purple', '紫焰轉場'], ['castL', '賽特施法'], ['castR', '女祭司施法'],
    ['jackpot', 'Jackpot'], ['force4', '下一轉 4 SCATTER'], ['forceOrb', '下一轉倍數球'], ['base', '回主遊戲'],
];

export class DevTool {
    private host: DevHost;
    private root!: HTMLDivElement;
    private gear!: HTMLDivElement;
    private open = false;
    private sel = 'reel';
    private fields: Record<string, HTMLInputElement | HTMLSelectElement> = {};
    private drag: { key: string; x: number; y: number } | null = null;
    private highlight!: HTMLDivElement;
    private side: 'left' | 'right' = 'right';
    private mini = false;

    /** 面板左右位置與收合狀態 */
    private applySide() {
        this.root.className = (this.side === 'left' ? 'left' : '') + (this.mini ? ' mini' : '');
        this.gear.className = this.open ? 'open' + (this.side === 'left' ? ' left' : '') : '';
    }

    constructor(host: DevHost) {
        this.host = host;
        if (typeof document === 'undefined') return;
        this.build();
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.open) { this.toggle(); return; }
            const t = e.target as HTMLInputElement;
            const typing = t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && (t.type === 'number' || t.type === 'text')));
            if (typing) return;
            if (e.key === 'd' || e.key === 'D') this.toggle();
        });
        this.bindCanvas();
    }

    get isOpen() { return this.open; }

    private css() {
        const s = document.createElement('style');
        s.textContent = `
#devGear{position:fixed;right:8px;bottom:8px;width:34px;height:34px;border-radius:17px;background:#1b1030cc;color:#f2c75c;
 font:20px/34px sans-serif;text-align:center;cursor:pointer;z-index:100000;opacity:.45;user-select:none;border:1px solid #f2c75c66}
#devGear.open{right:350px;opacity:1}
#devGear.open.left{right:auto;left:350px}
#devPanel.left{right:auto;left:0;border-left:none;border-right:2px solid #f2c75c}
#devPanel.mini{bottom:auto;height:auto;max-height:46px;overflow:hidden}
#devPanel .tools{display:flex;gap:4px;margin:2px 0 6px}
#devPanel .close{position:sticky;top:0;float:right;font-size:18px;padding:2px 10px;background:#7a2fb0}
#devGear:hover{opacity:1}
#devPanel{position:fixed;right:0;top:0;bottom:0;width:340px;overflow:auto;background:#120a1fc8;color:#eee;z-index:99999;
 font:12px/1.4 -apple-system,"PingFang TC",sans-serif;padding:10px 12px;box-sizing:border-box;display:none;border-left:2px solid #f2c75c}
#devPanel h3{margin:4px 0 8px;color:#f2c75c;font-size:15px}
#devPanel h4{margin:12px 0 6px;color:#c9a6ff;font-size:12px;border-bottom:1px solid #ffffff22;padding-bottom:3px}
#devPanel .row{display:flex;align-items:center;gap:6px;margin:3px 0}
#devPanel .row label{width:46px;color:#bbb}
#devPanel input[type=range]{flex:1}
#devPanel input[type=number]{width:64px;background:#000a;color:#fff;border:1px solid #555;border-radius:3px}
#devPanel select{background:#000a;color:#fff;border:1px solid #555;border-radius:3px}
#devPanel button{background:#3a1d5c;color:#fff;border:1px solid #f2c75c88;border-radius:4px;padding:4px 7px;margin:2px;cursor:pointer;font-size:12px}
#devPanel button.on{background:#f2c75c;color:#000}
#devPanel textarea{width:100%;height:150px;background:#000;color:#9f9;font:11px monospace}
#devHL{position:fixed;border:2px dashed #3ff;pointer-events:none;z-index:99997;display:none}
`;
        document.head.appendChild(s);
    }

    private build() {
        this.css();
        this.gear = document.createElement('div');
        this.gear.id = 'devGear';
        this.gear.textContent = '⚙';
        this.gear.title = 'DEV 微調工具（D）';
        this.gear.onclick = () => this.toggle();
        // 正式畫面不顯示齒輪（QA P1-8）：網址加 ?dev=1 或在 Cocos 編輯器預覽（7456）時才出現；D 鍵一律可開
        const q = new URLSearchParams(location.search);
        if (!(q.has('dev') || location.port === '7456')) this.gear.style.display = 'none';
        document.body.appendChild(this.gear);
        this.highlight = document.createElement('div');
        this.highlight.id = 'devHL';
        document.body.appendChild(this.highlight);

        const p = document.createElement('div');
        p.id = 'devPanel';
        this.root = p;
        document.body.appendChild(p);
        this.render();
    }

    toggle() {
        this.open = !this.open;
        this.root.style.display = this.open ? 'block' : 'none';
        this.applySide();
        this.gear.textContent = this.open ? '✕' : '⚙';
        // 開啟時鎖住遊戲按鈕，拖曳元件不會誤觸旋轉、押注
        Kit.inputLocked = this.open;
        if (this.open) this.gear.style.display = '';
        if (!this.open && document.activeElement instanceof HTMLElement) document.activeElement.blur();
        this.highlight.style.display = 'none';
        if (this.open) this.render();
    }

    private cur(): LayoutMap { const L = this.host.layouts(); return this.host.layoutKey() === 'pc' ? L.pc : L.mobile; }

    private render() {
        const p = this.root;
        p.innerHTML = '';
        const close = this.btn('✕ 關閉', () => this.toggle());
        close.className = 'close';
        close.title = '關閉 DEV（也可按 Esc 或 D）';
        p.appendChild(close);
        const tools = this.div('tools');
        tools.appendChild(this.btn(this.side === 'left' ? '⇢ 移到右邊' : '⇠ 移到左邊', () => {
            this.side = this.side === 'left' ? 'right' : 'left';
            this.applySide();
            this.render();
        }));
        tools.appendChild(this.btn(this.mini ? '▾ 展開' : '▴ 收合', () => {
            this.mini = !this.mini;
            this.applySide();
            this.render();
        }));
        p.appendChild(tools);
        const h = document.createElement('h3');
        h.textContent = `🛠 DEV 版面微調（目前：${this.host.layoutKey() === 'pc' ? 'PC 橫式' : 'MOBILE 直式'}）`;
        p.appendChild(h);

        // 版型切換
        const lay = this.div('row');
        (['auto', 'pc', 'mobile'] as const).forEach((k) => {
            const b = this.btn(k === 'auto' ? '自動' : k === 'pc' ? 'PC' : 'MOBILE', () => { this.host.forceLayout(k); this.render(); });
            if (this.host.forced() === k) b.className = 'on';
            lay.appendChild(b);
        });
        p.appendChild(lay);
        p.appendChild(this.note('在遊戲畫面上拖曳元件可直接移動；滾輪縮放、Shift+滾輪旋轉。'));

        // 元件選擇
        p.appendChild(this.h4('元件'));
        const sel = document.createElement('select');
        Object.keys(this.cur()).forEach((k) => {
            const o = document.createElement('option');
            o.value = k; o.textContent = k;
            if (k === this.sel) o.selected = true;
            sel.appendChild(o);
        });
        sel.onchange = () => { this.sel = sel.value; this.render(); };
        p.appendChild(sel);

        const e = this.cur()[this.sel];
        if (e) {
            const anc = document.createElement('select');
            (['C', 'L', 'R', 'T', 'B', 'TL', 'TR', 'BL', 'BR', 'P'] as Anchor[]).forEach((a) => {
                const o = document.createElement('option');
                o.value = a; o.textContent = '錨點 ' + a;
                if (a === e.a) o.selected = true;
                anc.appendChild(o);
            });
            anc.onchange = () => { e.a = anc.value as Anchor; this.commit(); };
            p.appendChild(anc);
            this.slider(p, 'x', e, 'x', -1600, 1600, 1);
            this.slider(p, 'y', e, 'y', -1600, 1600, 1);
            this.slider(p, '縮放', e, 's', 0.1, 3, 0.01);
            this.slider(p, '旋轉', e, 'r', -180, 180, 1);
            this.slider(p, '透明', e, 'o', 0, 255, 1);
            if (e.fs !== undefined) this.slider(p, '字級', e, 'fs', 8, 200, 1);
            const vis = this.div('row');
            const cb = document.createElement('input');
            cb.type = 'checkbox'; cb.checked = e.v !== false;
            cb.onchange = () => { e.v = cb.checked; this.commit(); };
            vis.appendChild(this.lbl('顯示')); vis.appendChild(cb);
            if (e.c !== undefined) {
                const col = document.createElement('input');
                col.type = 'color'; col.value = e.c;
                col.oninput = () => { e.c = col.value; this.commit(); };
                vis.appendChild(this.lbl('顏色')); vis.appendChild(col);
            }
            p.appendChild(vis);
        }

        // 動畫節奏
        p.appendChild(this.h4('動畫節奏（秒）'));
        Object.keys(TIMING).forEach((k) => this.slider(p, k, TIMING as any, k, 0.02, k === 'turbo' ? 5 : 2, 0.01, true));

        // 狀態觸發
        p.appendChild(this.h4('狀態觸發'));
        const tr = this.div('');
        TRIGGERS.forEach(([k, t]) => tr.appendChild(this.btn(t, () => this.host.trigger(k))));
        p.appendChild(tr);

        // 匯出
        p.appendChild(this.h4('匯出 / 鎖定'));
        const ta = document.createElement('textarea');
        const ex = this.div('');
        ex.appendChild(this.btn('💾 匯出 JSON', () => {
            const L = this.host.layouts();
            const json = JSON.stringify({ LAYOUT_PC: L.pc, LAYOUT_MOBILE: L.mobile, TIMING }, null, 2);
            ta.value = json;
            try { navigator.clipboard.writeText(json); } catch (err) { /* 沒權限就算了 */ }
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
            a.download = 'seth2_layout_export.json';
            a.click();
        }));
        ex.appendChild(this.btn('↺ 重置為程式預設', () => {
            if (confirm('清除所有微調，回到 Layouts.ts 預設值？')) { this.host.resetLayouts(); this.render(); }
        }));
        p.appendChild(ex);
        p.appendChild(ta);
        p.appendChild(this.note('匯出後把 JSON 交給 Claude：「我調好了，鎖定」，就會寫回 Layouts.ts。'));
    }

    private slider(p: HTMLElement, label: string, obj: any, key: string, min: number, max: number, step: number, timing = false) {
        const r = this.div('row');
        r.appendChild(this.lbl(label));
        const rng = document.createElement('input');
        rng.type = 'range'; rng.min = String(min); rng.max = String(max); rng.step = String(step);
        const def = key === 'o' ? 255 : key === 'r' ? 0 : 0;
        rng.value = String(obj[key] ?? def);
        const num = document.createElement('input');
        num.type = 'number'; num.step = String(step); num.value = rng.value;
        const set = (v: number) => {
            obj[key] = v; rng.value = String(v); num.value = String(v);
            if (!timing) this.commit(); else this.save();
        };
        rng.oninput = () => set(parseFloat(rng.value));
        num.onchange = () => set(parseFloat(num.value));
        r.appendChild(rng); r.appendChild(num);
        if (!timing) this.fields[key] = num;
        p.appendChild(r);
    }

    /** 套用並存檔 */
    private commit() {
        this.host.apply();
        this.save();
    }

    private save() {
        try {
            const L = this.host.layouts();
            localStorage.setItem(DEV_STORE_KEY, JSON.stringify({ pc: L.pc, mobile: L.mobile, timing: TIMING }));
        } catch (e) { /* 無痕模式等情況存不了 */ }
    }

    private refreshFields() {
        const e = this.cur()[this.sel];
        if (!e) return;
        (['x', 'y', 's', 'r'] as (keyof ElemLayout)[]).forEach((k) => {
            const f = this.fields[k as string] as HTMLInputElement;
            if (f) f.value = String(e[k] ?? 0);
        });
    }

    // ------------------------------------------------------------ 畫面拖曳
    private bindCanvas() {
        // 面板與齒輪上的操作不攔截
        const onPanel = (ev: Event) => {
            const t = ev.target as Node | null;
            return !!t && (this.root.contains(t as any) || this.gear.contains(t as any));
        };
        const down = (ev: PointerEvent) => {
            if (!this.open || onPanel(ev)) return;
            const key = this.host.hitTest(ev.clientX, ev.clientY);
            if (!key) return;
            ev.stopPropagation(); ev.preventDefault();
            if (key !== this.sel) { this.sel = key; this.render(); }
            this.drag = { key, x: ev.clientX, y: ev.clientY };
        };
        const move = (ev: PointerEvent) => {
            if (!this.open || !this.drag) return;
            ev.stopPropagation(); ev.preventDefault();
            const d = this.host.clientDelta(ev.clientX - this.drag.x, ev.clientY - this.drag.y);
            this.drag.x = ev.clientX; this.drag.y = ev.clientY;
            const e = this.cur()[this.drag.key];
            e.x = Math.round((e.x + d.x) * 10) / 10;
            e.y = Math.round((e.y + d.y) * 10) / 10;
            this.host.apply();
            this.refreshFields();
        };
        const up = () => { if (this.drag) { this.drag = null; this.save(); } };
        const wheel = (ev: WheelEvent) => {
            if (!this.open || onPanel(ev)) return;
            const key = this.host.hitTest(ev.clientX, ev.clientY) || this.sel;
            const e = this.cur()[key];
            if (!e) return;
            ev.preventDefault();
            this.sel = key;
            if (ev.shiftKey) e.r = Math.round((e.r || 0) + (ev.deltaY > 0 ? 2 : -2));
            else e.s = Math.max(0.05, Math.round((e.s * (ev.deltaY > 0 ? 0.97 : 1.03)) * 1000) / 1000);
            this.host.apply();
            this.render();
            this.save();
        };
        window.addEventListener('pointerdown', down, true);
        window.addEventListener('pointermove', move, true);
        window.addEventListener('pointerup', up, true);
        window.addEventListener('wheel', wheel, { passive: false, capture: true });
    }

    // ------------------------------------------------------------ 小工具
    private div(cls: string) { const d = document.createElement('div'); if (cls) d.className = cls; return d; }
    private h4(t: string) { const h = document.createElement('h4'); h.textContent = t; return h; }
    private lbl(t: string) { const l = document.createElement('label'); l.textContent = t; return l; }
    private note(t: string) { const d = document.createElement('div'); d.style.color = '#999'; d.style.margin = '4px 0'; d.textContent = t; return d; }
    private btn(t: string, fn: () => void) { const b = document.createElement('button'); b.textContent = t; b.onclick = fn; return b; }
}
