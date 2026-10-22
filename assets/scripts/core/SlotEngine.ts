/**
 * 戰神賽特2 復刻 — 純邏輯引擎（不依賴 cc，可直接用 node --experimental-strip-types 模擬）
 *
 * 玩法：
 *  - 6 軸 × 5 列，盤面任意位置 8 個以上相同符號即中獎（pays anywhere）
 *  - 中獎符號消除、上方符號落下、補新符號（tumble），直到沒有新中獎
 *  - 倍數球：主遊戲有中獎時，盤面倍數球加總 × 贏分；免費遊戲累加到總倍數
 *  - 4 個以上 SCATTER → 15 次免費遊戲；免費遊戲中 3 個以上 SCATTER → 覺醒之力（+5 次）
 *  - 覺醒後：倍數球升級為金色太陽球（高倍數），並出現法老百搭（WILD）
 *  - 最高贏分 5000 倍
 */

export type SymId =
  | 'khopesh' | 'cobra' | 'bow' | 'eye'
  | 'ruby' | 'amethyst' | 'topaz' | 'emerald' | 'sapphire'
  | 'scatter' | 'orb' | 'pharaoh';

export type Mode = 'base' | 'free' | 'awaken';

export interface Cell {
  id: SymId;
  /** 倍數球數值（只有 orb 有） */
  mult?: number;
  /** 唯一編號，讓畫面層追蹤同一顆符號在落下後的位置 */
  uid: number;
}

/** 盤面：board[col][row]，row 0 在最上方 */
export type Board = Cell[][];

export interface WinGroup {
  sym: SymId;
  count: number;
  /** 參與中獎的格子（含百搭） */
  cells: [number, number][];
  amount: number;
}

export interface TumbleStep {
  /** 這一步消除前的盤面 */
  board: Board;
  wins: WinGroup[];
  stepWin: number;
  /** 消除後補進來的新符號：每軸由上往下 */
  refill: Cell[][];
}

export interface SpinResult {
  mode: Mode;
  /** 一開始落下的盤面 */
  initial: Board;
  steps: TumbleStep[];
  /** 最後靜止的盤面 */
  final: Board;
  /** 消除累計贏分（未乘倍數） */
  baseWin: number;
  /** 本轉出現在盤面的倍數球 */
  orbs: { col: number; row: number; mult: number }[];
  /** 套用的倍數（主遊戲 = 球加總；免費 = 累計總倍數），0 代表沒有套用 */
  appliedMult: number;
  /** 免費遊戲累計總倍數（本轉結束後） */
  totalMult: number;
  /** SCATTER 支付 */
  scatterPay: number;
  scatterCount: number;
  /** 本轉總贏分 */
  totalWin: number;
  /** 觸發 / 追加的免費遊戲次數 */
  freeSpinsAwarded: number;
  /** 本轉是否觸發覺醒 */
  awakenTriggered: boolean;
  capped: boolean;
}

export const ROWS = 5;
export const COLS = 6;
export const MIN_MATCH = 8;
export const MAX_WIN_X = 5000;

/** 賠率（× 總押注）：[8-9, 10-11, 12+] */
export const PAYTABLE: Record<string, [number, number, number]> = {
  khopesh: [10, 25, 50],
  cobra: [2.5, 10, 25],
  bow: [2, 5, 15],
  eye: [1.5, 2, 12],
  ruby: [1, 1.5, 10],
  amethyst: [0.8, 1.2, 8],
  topaz: [0.5, 1, 5],
  emerald: [0.4, 0.9, 4],
  sapphire: [0.25, 0.75, 2],
};
export const PAY_SYMS = Object.keys(PAYTABLE) as SymId[];
/** SCATTER 支付（× 押注）：數量 → 倍數 */
export const SCATTER_PAY: Record<number, number> = { 4: 3, 5: 5, 6: 100 };
export const FREE_SPINS_TRIGGER = 15;
export const AWAKEN_EXTRA_SPINS = 5;
export const BUY_COST_X = 110;

/** 各模式符號權重（tools/sim.ts 模擬約 RTP 95%、免費遊戲約 1/390 轉） */
export const WEIGHTS: Record<Mode, Record<string, number>> = {
  base: {
    khopesh: 4, cobra: 6, bow: 8, eye: 10,
    ruby: 12, amethyst: 14, topaz: 16, emerald: 18, sapphire: 20,
    scatter: 2.4, orb: 0.82, pharaoh: 0,
  },
  free: {
    khopesh: 4, cobra: 6, bow: 8, eye: 10,
    ruby: 12, amethyst: 14, topaz: 16, emerald: 18, sapphire: 20,
    scatter: 2.0, orb: 4.3, pharaoh: 0,
  },
  awaken: {
    khopesh: 4, cobra: 6, bow: 8, eye: 10,
    ruby: 12, amethyst: 14, topaz: 16, emerald: 18, sapphire: 20,
    scatter: 0.5, orb: 4.5, pharaoh: 1.8,
  },
};

/** 倍數球數值與權重 */
export const ORB_TABLE: Record<'green' | 'sun', [number, number][]> = {
  green: [[2, 300], [3, 200], [4, 130], [5, 100], [6, 60], [8, 40], [10, 30], [12, 15], [15, 10], [20, 6], [25, 4], [50, 2], [100, 0.6], [250, 0.15], [500, 0.05]],
  sun: [[4, 120], [5, 110], [6, 100], [8, 80], [10, 60], [12, 40], [15, 30], [18, 20], [20, 16], [25, 10], [50, 5], [100, 1.5], [250, 0.4], [500, 0.12]],
};

// ---------------------------------------------------------------- RNG
export class RNG {
  private s: number;
  constructor(seed = (Date.now() ^ 0x5eed) >>> 0) { this.s = seed >>> 0; }
  next(): number { // mulberry32
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  pick<T>(entries: [T, number][]): T {
    let total = 0;
    for (const e of entries) total += e[1];
    let r = this.next() * total;
    for (const e of entries) { r -= e[1]; if (r < 0) return e[0]; }
    return entries[entries.length - 1][0];
  }
}

// ---------------------------------------------------------------- 引擎
export class SlotEngine {
  rng: RNG;
  private uid = 1;
  private tables: Record<Mode, [SymId, number][]>;

  constructor(seed?: number) {
    this.rng = new RNG(seed);
    this.tables = {} as Record<Mode, [SymId, number][]>;
    for (const m of ['base', 'free', 'awaken'] as Mode[]) {
      this.tables[m] = Object.entries(WEIGHTS[m]).filter(([, w]) => w > 0) as [SymId, number][];
    }
  }

  private newCell(mode: Mode, noScatter = false): Cell {
    let id = this.rng.pick(this.tables[mode]);
    while (noScatter && id === 'scatter') id = this.rng.pick(this.tables[mode]);
    const c: Cell = { id, uid: this.uid++ };
    if (id === 'orb') c.mult = this.rng.pick(ORB_TABLE[mode === 'awaken' ? 'sun' : 'green']);
    return c;
  }

  /** 產生初始盤面；forceScatter 用於購買免費遊戲（保證 4~5 個 SCATTER） */
  private makeBoard(mode: Mode, forceScatter = 0): Board {
    const b: Board = [];
    for (let c = 0; c < COLS; c++) {
      const col: Cell[] = [];
      let hasScatter = false;
      for (let r = 0; r < ROWS; r++) {
        // 每軸最多一個 SCATTER
        const cell = this.newCell(mode, hasScatter || forceScatter > 0);
        if (cell.id === 'scatter') hasScatter = true;
        col.push(cell);
      }
      b.push(col);
    }
    if (forceScatter > 0) {
      const cols = [0, 1, 2, 3, 4, 5].sort(() => this.rng.next() - 0.5).slice(0, forceScatter);
      for (const c of cols) {
        const r = Math.floor(this.rng.next() * ROWS);
        b[c][r] = { id: 'scatter', uid: this.uid++ };
      }
    }
    return b;
  }

  static clone(b: Board): Board { return b.map((col) => col.map((c) => ({ ...c }))); }

  /** 找出所有中獎組合（含百搭） */
  static findWins(b: Board, bet: number): WinGroup[] {
    const pos: Record<string, [number, number][]> = {};
    const wilds: [number, number][] = [];
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const id = b[c][r].id;
        if (id === 'pharaoh') wilds.push([c, r]);
        else if (PAYTABLE[id]) { if (!pos[id]) pos[id] = []; pos[id].push([c, r]); }
      }
    }
    const wins: WinGroup[] = [];
    for (const sym of PAY_SYMS) {
      const own = pos[sym];
      if (!own || !own.length) continue;
      const count = own.length + wilds.length;
      if (count < MIN_MATCH) continue;
      const t = PAYTABLE[sym];
      const x = count >= 12 ? t[2] : count >= 10 ? t[1] : t[0];
      wins.push({ sym, count, cells: own.concat(wilds), amount: round2(x * bet) });
    }
    return wins;
  }

  /**
   * 一轉完整結果（包含所有消除步驟）
   * @param totalMultBefore 免費遊戲目前累計倍數
   */
  spin(mode: Mode, bet: number, totalMultBefore = 0, buy = false): SpinResult {
    const initial = this.makeBoard(mode, buy ? (this.rng.next() < 0.85 ? 4 : 5) : 0);
    let board = SlotEngine.clone(initial);
    const steps: TumbleStep[] = [];
    let baseWin = 0;
    for (let guard = 0; guard < 50; guard++) {
      const wins = SlotEngine.findWins(board, bet);
      if (!wins.length) break;
      const stepWin = round2(wins.reduce((s, w) => s + w.amount, 0));
      baseWin = round2(baseWin + stepWin);
      // 消除 → 落下 → 補充
      const dead = new Set<string>();
      for (const w of wins) for (const [c, r] of w.cells) dead.add(c + ',' + r);
      const next: Board = [];
      const refill: Cell[][] = [];
      for (let c = 0; c < COLS; c++) {
        const keep = board[c].filter((_, r) => !dead.has(c + ',' + r));
        const add: Cell[] = [];
        let hasScatter = keep.some((x) => x.id === 'scatter');
        for (let i = keep.length; i < ROWS; i++) {
          const cell = this.newCell(mode, hasScatter);
          if (cell.id === 'scatter') hasScatter = true;
          add.push(cell);
        }
        refill.push(add);
        next.push(add.concat(keep));
      }
      steps.push({ board: SlotEngine.clone(board), wins, stepWin, refill });
      board = next;
    }
    // 倍數球
    const orbs: { col: number; row: number; mult: number }[] = [];
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
      const cell = board[c][r];
      if (cell.id === 'orb') orbs.push({ col: c, row: r, mult: cell.mult || 0 });
    }
    const orbSum = orbs.reduce((s, o) => s + o.mult, 0);
    let appliedMult = 0;
    let totalMult = totalMultBefore;
    let win = baseWin;
    if (baseWin > 0 && orbSum > 0) {
      if (mode === 'base') appliedMult = orbSum;
      else { totalMult = totalMultBefore + orbSum; appliedMult = totalMult; }
      win = round2(baseWin * appliedMult);
    }
    // SCATTER
    let scatterCount = 0;
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) if (board[c][r].id === 'scatter') scatterCount++;
    let scatterPay = 0;
    let freeSpinsAwarded = 0;
    let awakenTriggered = false;
    if (mode === 'base') {
      if (scatterCount >= 4) {
        scatterPay = round2((SCATTER_PAY[Math.min(6, scatterCount)] || 0) * bet);
        freeSpinsAwarded = FREE_SPINS_TRIGGER;
      }
    } else if (scatterCount >= 3) {
      freeSpinsAwarded = AWAKEN_EXTRA_SPINS;
      awakenTriggered = mode === 'free';
    }
    let totalWin = round2(win + scatterPay);
    let capped = false;
    if (totalWin > bet * MAX_WIN_X) { totalWin = bet * MAX_WIN_X; capped = true; }
    return {
      mode, initial, steps, final: board, baseWin, orbs, appliedMult, totalMult,
      scatterPay, scatterCount, totalWin, freeSpinsAwarded, awakenTriggered, capped,
    };
  }
}

export function round2(v: number): number { return Math.round(v * 100) / 100; }

/** 大獎等級（× 押注） */
export const WIN_TIERS: { key: 'big' | 'super' | 'mega' | 'legendary'; x: number }[] = [
  { key: 'big', x: 20 },
  { key: 'super', x: 50 },
  { key: 'mega', x: 150 },
  { key: 'legendary', x: 500 },
];
export function winTier(win: number, bet: number): number {
  let t = -1;
  WIN_TIERS.forEach((w, i) => { if (win >= w.x * bet) t = i; });
  return t;
}
