// RTP 模擬：node --experimental-strip-types tools/sim.ts [轉數] ['{"base":{"scatter":3}}' 權重覆寫]
import { SlotEngine, BUY_COST_X, winTier, WEIGHTS } from '../assets/scripts/core/SlotEngine.ts';

const N = Number(process.argv[2] || 200000);
if (process.argv[3]) {
  const o = JSON.parse(process.argv[3]);
  for (const m of Object.keys(o)) Object.assign((WEIGHTS as any)[m], o[m]);
}
const bet = 1;
const eng = new SlotEngine(12345);
let awaken = 0;

function playFree(): number {
  let left = 15, total = 0, mult = 0, mode: 'free' | 'awaken' = 'free';
  while (left > 0) {
    left--;
    const r = eng.spin(mode, bet, mult);
    mult = r.totalMult;
    total += r.totalWin;
    if (r.freeSpinsAwarded) left += r.freeSpinsAwarded;
    if (r.awakenTriggered) { mode = 'awaken'; awaken++; }
  }
  return Math.min(total, 5000 * bet);
}

let wager = 0, baseRet = 0, scRet = 0, fg = 0, fgWin = 0, hits = 0, maxWin = 0;
const tiers = [0, 0, 0, 0];
for (let i = 0; i < N; i++) {
  wager += bet;
  const r = eng.spin('base', bet);
  let w = r.totalWin;
  baseRet += r.totalWin - r.scatterPay; scRet += r.scatterPay;
  if (w > 0) hits++;
  if (r.freeSpinsAwarded) { fg++; const f = playFree(); fgWin += f; w += f; }
  maxWin = Math.max(maxWin, w);
  const t = winTier(w, bet); if (t >= 0) tiers[t]++;
}
const aw0 = awaken;
let buyRet = 0; const B = Math.max(1000, N / 100);
for (let i = 0; i < B; i++) { const r = eng.spin('base', bet, 0, true); buyRet += r.totalWin + playFree(); }
const pct = (v: number) => (v / wager * 100).toFixed(1) + '%';
console.log(`RTP=${pct(baseRet + scRet + fgWin)} (base ${pct(baseRet)} scatter ${pct(scRet)} FG ${pct(fgWin)})  hit=${(hits / N * 100).toFixed(1)}%  FG 1/${(N / Math.max(1, fg)).toFixed(0)}  FGavg=${(fgWin / Math.max(1, fg)).toFixed(1)}x  awaken=${(aw0 / Math.max(1, fg) * 100).toFixed(0)}%  max=${maxWin.toFixed(0)}x`);
console.log(`tiers big/super/mega/legend=${tiers.join('/')}  buyRTP=${(buyRet / (B * BUY_COST_X) * 100).toFixed(1)}%`);
