/**
 * 版面設定（DEV 工具按 💾 匯出後，把 JSON 貼回這裡即可鎖定）
 *
 * 座標系：設計解析度單位，原點 = 錨點（a）所在位置，x 向右、y 向上
 *   a: 'C' 畫面中心、'L' 左緣中點、'R' 右緣中點、'T' 上緣中點、'B' 下緣中點、
 *      'TL' 'TR' 'BL' 'BR' 四角、'P' 相對父元件（子元件用，例如牌匾裡的數字）
 *   s: 縮放、r: 旋轉（度）、o: 透明度 0~255、v: 是否顯示
 *   fs: 字級、c: 文字顏色（#rrggbb），只對有文字的元件有效
 */
export type Anchor = 'C' | 'L' | 'R' | 'T' | 'B' | 'TL' | 'TR' | 'BL' | 'BR' | 'P';

export interface ElemLayout {
    a: Anchor;
    x: number;
    y: number;
    s: number;
    r?: number;
    o?: number;
    v?: boolean;
    fs?: number;
    c?: string;
}

export type LayoutMap = Record<string, ElemLayout>;

/** 橫式設計解析度（PC / 手機橫拿） */
export const DESIGN_PC = { w: 1920, h: 1080 };
/** 直式設計解析度（手機直拿） */
export const DESIGN_MOBILE = { w: 1080, h: 1920 };

/** 盤面格子尺寸（設計單位） */
export const CELL_W = 172;
export const CELL_H = 150;

export const LAYOUT_PC: LayoutMap = {
    bg: { a: 'C', x: 0, y: 0, s: 1 },
    charL: { a: 'BL', x: 300, y: 60, s: 0.78 },
    charR: { a: 'BR', x: -390, y: 40, s: 0.74 },
    reel: { a: 'C', x: 0, y: -30, s: 0.8 },
    header: { a: 'C', x: 0, y: 336, s: 1, fs: 28, c: '#fff1c4' },
    multRing: { a: 'C', x: 462, y: 310, s: 0.85, fs: 46, c: '#fff4d0' },
    fgCounter: { a: 'BL', x: 230, y: 330, s: 1, fs: 92, c: '#ffd85a' },
    logo: { a: 'L', x: 175, y: 60, s: 1, v: false },
    jackpots: { a: 'T', x: 0, y: -26, s: 1, fs: 24 },
    bottomBar: { a: 'B', x: 0, y: 40, s: 1, fs: 30 },
    betCtrl: { a: 'B', x: 330, y: 40, s: 0.85, fs: 34 },
    // 右側按鈕貼右緣排成一欄（原作配置），角色在按鈕內側
    spinBtn: { a: 'BR', x: -135, y: 205, s: 0.92 },
    turboBtn: { a: 'BR', x: -95, y: 385, s: 0.72 },
    autoBtn: { a: 'BR', x: -95, y: 480, s: 0.72 },
    menuBtn: { a: 'TR', x: -60, y: -115, s: 0.75 },
    soundBtn: { a: 'TR', x: -60, y: -205, s: 0.75 },
    buyBtn: { a: 'BL', x: 125, y: 180, s: 0.9, fs: 28 },
    // 子元件（相對父元件）
    headerMsg: { a: 'P', x: 0, y: 0, s: 1 },
    headerNum: { a: 'P', x: 0, y: 0, s: 1 },
    multNum: { a: 'P', x: 0, y: 0, s: 1 },
    fgNum: { a: 'P', x: 0, y: 85, s: 1 },
};

export const LAYOUT_MOBILE: LayoutMap = {
    bg: { a: 'C', x: 0, y: 0, s: 1 },
    charL: { a: 'C', x: -290, y: 225, s: 0.66 },
    charR: { a: 'C', x: 295, y: 215, s: 0.63 },
    reel: { a: 'C', x: 0, y: -140, s: 0.82 },
    header: { a: 'C', x: 0, y: 232, s: 1, fs: 34, c: '#fff1c4' },
    multRing: { a: 'C', x: 468, y: 228, s: 0.9, fs: 46, c: '#fff4d0' },
    fgCounter: { a: 'C', x: -330, y: -610, s: 0.6, fs: 110, c: '#ffd85a' },
    logo: { a: 'T', x: 0, y: -175, s: 0.8 },
    jackpots: { a: 'T', x: 0, y: -40, s: 1, fs: 24 },
    bottomBar: { a: 'B', x: 0, y: 46, s: 1, fs: 30 },
    betCtrl: { a: 'B', x: 0, y: 145, s: 1, fs: 34 },
    spinBtn: { a: 'B', x: 0, y: 330, s: 1.05 },
    turboBtn: { a: 'B', x: -250, y: 330, s: 1 },
    autoBtn: { a: 'B', x: 250, y: 330, s: 1 },
    menuBtn: { a: 'B', x: 430, y: 330, s: 1 },
    soundBtn: { a: 'B', x: -430, y: 330, s: 1 },
    buyBtn: { a: 'C', x: -380, y: -560, s: 0.9, fs: 28 },
    // 子元件（相對父元件）
    headerMsg: { a: 'P', x: 0, y: 0, s: 1 },
    headerNum: { a: 'P', x: 0, y: 0, s: 1 },
    multNum: { a: 'P', x: 0, y: 0, s: 1 },
    fgNum: { a: 'P', x: 0, y: 85, s: 1 },
};

/** 動畫節奏（DEV 工具可調） */
export const TIMING = {
    dropIn: 0.42,      // 一軸落下時間
    colStagger: 0.07,  // 軸與軸之間的延遲
    winShow: 0.9,      // 中獎框顯示時間
    explode: 0.38,     // 消除爆炸
    tumbleDrop: 0.32,  // 消除後落下
    orbFly: 0.55,      // 倍數球飛到倍數框
    turbo: 2.2,        // 快速模式倍速
};
