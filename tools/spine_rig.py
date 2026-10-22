#!/usr/bin/env python3
"""
程式化 Spine 3.8 骨架產生器（不需要 Spine 編輯器）

流程：
  1. 讀角色去背圖 + rig 規格（tools/rigs/<name>.py 的 RIG）
  2. 每個像素依「最近骨段」自動分配骨頭，再用多邊形覆寫（披風、法杖…）
  3. 依 parts 把角色切成數個部件（披風、身體、左臂、右臂），各自建網格
  4. 平滑的骨段標籤圖 → 每個網格頂點的蒙皮權重（最多 3 根骨頭）
  5. 輸出 Spine 3.8 JSON + libgdx atlas + PNG（Cocos Creator 3.8 可直接匯入成 sp.SkeletonData）

用法：tools/.venv/bin/python tools/spine_rig.py seth [--debug]
"""
import importlib.util, json, math, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "assets/resources/spine"


# ---------------------------------------------------------------- 基本工具
def load_rig(name):
    p = ROOT / "tools/rigs" / f"{name}.py"
    spec = importlib.util.spec_from_file_location(f"rig_{name}", p)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m.RIG


def seg_dist(px, py, ax, ay, bx, by):
    """點到線段距離（向量化）"""
    vx, vy = bx - ax, by - ay
    L2 = vx * vx + vy * vy + 1e-9
    t = np.clip(((px - ax) * vx + (py - ay) * vy) / L2, 0, 1)
    dx, dy = px - (ax + t * vx), py - (ay + t * vy)
    return np.sqrt(dx * dx + dy * dy)


class Bone:
    def __init__(self, d, s, root):
        self.name = d["name"]
        self.parent = d.get("parent", "root")
        rx, ry = root
        # 影像座標（y 向下）→ Spine 座標（y 向上，以 root 為原點）
        self.ih = (d["head"][0] * s, d["head"][1] * s)
        self.it = (d["tail"][0] * s, d["tail"][1] * s)
        self.wx, self.wy = self.ih[0] - rx, ry - self.ih[1]
        tx, ty = self.it[0] - rx, ry - self.it[1]
        self.wrot = math.degrees(math.atan2(ty - self.wy, tx - self.wx))
        self.length = math.hypot(tx - self.wx, ty - self.wy)
        self.auto = d.get("auto", True)
        self.sigma = d.get("sigma", None)

    def to_local(self, x, y):
        """世界座標點 → 本骨頭 setup pose 的區域座標"""
        c, s = math.cos(math.radians(self.wrot)), math.sin(math.radians(self.wrot))
        dx, dy = x - self.wx, y - self.wy
        return c * dx + s * dy, -s * dx + c * dy


# ---------------------------------------------------------------- 主流程
def build(name, debug=False):
    rig = load_rig(name)
    s = rig.get("texture_scale", 1.0)
    src = Image.open(ROOT / rig["image"]).convert("RGBA")
    if s != 1.0:
        src = src.resize((round(src.width * s), round(src.height * s)), Image.LANCZOS)
    W, H = src.size
    rgba = np.asarray(src).copy()
    A = rgba[..., 3] > 6
    root = (rig["root"][0] * s, rig["root"][1] * s)

    bones = {"root": None}
    order = ["root"]
    for d in rig["bones"]:
        b = Bone(d, s, root)
        bones[b.name] = b
        order.append(b.name)
    names = order[1:]
    idx = {n: i for i, n in enumerate(order)}

    # ---- 1. 像素標籤：最近骨段（只考慮 auto 骨頭）
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    auto = [n for n in names if bones[n].auto]
    dist = np.stack([seg_dist(xx, yy, *bones[n].ih, *bones[n].it) for n in auto])
    label = np.array([idx[n] for n in auto])[dist.argmin(0)]
    # ---- 2. 多邊形覆寫（依序）
    for poly in rig.get("polygons", []):
        m = Image.new("L", (W, H), 0)
        ImageDraw.Draw(m).polygon([(x * s, y * s) for x, y in poly["pts"]], fill=255)
        mm = np.asarray(m) > 0
        if "only_from" in poly:  # 只覆寫原本屬於某些骨頭的像素
            allow = np.isin(label, [idx[n] for n in poly["only_from"]])
            mm &= allow
        label[mm] = idx[poly["bone"]]
    label[~A] = -1
    # ---- 2b. 清掉各部件的小孤島：例如手臂輪廓外緣有幾個像素被分到身體，手臂一動就變成懸空碎片（QA P1-12）
    part_of = {}
    for pi, part in enumerate(rig["parts"]):
        for bn in part["bones"]:
            part_of[idx[bn]] = pi
    plabel = np.full(label.shape, -1, np.int32)
    for lid, pi in part_of.items():
        plabel[label == lid] = pi
    for pi in range(len(rig["parts"])):
        m = plabel == pi
        comps, n = ndimage.label(m)
        if n <= 1:
            continue
        sizes = ndimage.sum(m, comps, range(1, n + 1))
        small = [k + 1 for k, sz in enumerate(sizes) if sz < 0.03 * sizes.max()]
        if not small:
            continue
        isl = np.isin(comps, small)
        other = (plabel >= 0) & (plabel != pi)
        _, (iy, ix) = ndimage.distance_transform_edt(~other, return_indices=True)
        label[isl] = label[iy[isl], ix[isl]]
        plabel[isl] = plabel[iy[isl], ix[isl]]
        print(f"  · part {rig['parts'][pi]['name']}: 併掉 {len(small)} 個小孤島（{int(isl.sum())} px）")

    # ---- 3. 平滑權重圖（normalized convolution，1/2 解析度加速）
    ds = 2
    Ad = A[::ds, ::ds].astype(np.float32)
    lab_d = label[::ds, ::ds]
    sigma_default = rig.get("sigma", 9.0) * s / ds
    wmaps = {}
    for n in names:
        sg = (bones[n].sigma or rig.get("sigma", 9.0)) * s / ds
        ind = (lab_d == idx[n]).astype(np.float32)
        if ind.sum() == 0:
            continue
        num = ndimage.gaussian_filter(ind, sg)
        den = ndimage.gaussian_filter(Ad, sg) + 1e-6
        wmaps[n] = num / den

    def weights_at(x, y, allowed):
        ix = int(min(max(x / ds, 0), Ad.shape[1] - 1))
        iy = int(min(max(y / ds, 0), Ad.shape[0] - 1))
        ws = {n: float(wmaps[n][iy, ix]) for n in allowed if n in wmaps}
        ws = {k: v for k, v in ws.items() if v > 0.02}
        if not ws:  # 透明區：找最近的骨段
            best = min(allowed, key=lambda n: seg_dist(np.float32(x), np.float32(y), *bones[n].ih, *bones[n].it))
            return {best: 1.0}
        top = sorted(ws.items(), key=lambda kv: -kv[1])[:3]
        tot = sum(v for _, v in top)
        return {k: v / tot for k, v in top}

    # ---- 4. 部件切割 + 網格
    step = rig.get("grid", 18) * s
    parts_out = []  # (part, image, region offset, mesh)
    for part in rig["parts"]:
        pb = set(part["bones"])
        own = np.isin(label, [idx[n] for n in pb])
        mask = own.copy()
        if part.get("grow"):
            grow_ok = np.isin(label, [idx[n] for n in part["grow"]])
            dil = ndimage.binary_dilation(own, iterations=max(1, int(part.get("grow_px", 14) * s)))
            mask |= dil & grow_ok
        if part.get("under"):  # 墊在別的部件下面：往被遮住的區域多延伸，避免擺動露縫
            under_ok = np.isin(label, [idx[n] for n in part["under"]])
            dil = ndimage.binary_dilation(own, iterations=max(1, int(part.get("under_px", 30) * s)))
            mask |= dil & under_ok
        mask &= A
        # 濾掉極小的零碎像素塊（去背殘留的髮絲、雜點），否則會跟著骨頭飄在空中
        cc, ncc = ndimage.label(mask)
        if ncc > 1:
            sz = ndimage.sum(mask, cc, range(1, ncc + 1))
            tiny = [k + 1 for k, v in enumerate(sz) if v < 150 * s * s]
            if tiny:
                mask &= ~np.isin(cc, tiny)
        fill = np.zeros_like(mask)
        if part.get("fill"):  # 被前方部件（手臂）遮住的區域：用最近的本部件顏色補畫，手臂移開時不會露洞
            fb = np.isin(label, [idx[n] for n in part["fill"]]) & A
            dist, (iy, ix) = ndimage.distance_transform_edt(~mask, return_indices=True)
            k = max(2, int(part.get("fill_px", 50) * s / 2))
            closed = ndimage.binary_closing(np.pad(mask, k), iterations=k)[k:-k, k:-k]  # 只補被身體包圍的凹洞
            fill = fb & closed & ~mask
        if part.get("fill_band"):  # 肩關節一圈：手臂像素離身體 px 以內的都用身體顏色補底，手臂轉動時不露縫
            fb2 = np.isin(label, [idx[n] for n in part["fill_band"]["bones"]]) & A
            if part["fill_band"].get("radius"):  # 只補肩關節附近，不要沿整條手臂補（否則手臂一動就露出補在身上的碎片）
                rr = part["fill_band"]["radius"] * s
                near_sh = np.zeros_like(fb2)
                for bn in part["fill_band"]["bones"]:
                    hx, hy = bones[bn].ih
                    near_sh |= (xx - hx) ** 2 + (yy - hy) ** 2 <= rr * rr
                fb2 &= near_sh
            near = ndimage.binary_dilation(mask, iterations=max(1, int(part["fill_band"]["px"] * s)))
            fill = fill | (fb2 & near & ~mask)
            if not part.get("fill"):
                dist, (iy, ix) = ndimage.distance_transform_edt(~mask, return_indices=True)
        ys, xs = np.nonzero(mask | fill)
        if len(xs) == 0:
            print(f"  ! part {part['name']} 沒有像素，略過")
            continue
        pad = 2 + int(rig.get("mesh_pad", 0) * s)
        x0, x1 = max(0, xs.min() - pad), min(W, xs.max() + pad + 1)
        y0, y1 = max(0, ys.min() - pad), min(H, ys.max() + pad + 1)
        img = rgba[y0:y1, x0:x1].copy()
        img[..., 3] = np.where(mask[y0:y1, x0:x1], img[..., 3], 0)
        if fill.any():
            fz = fill[y0:y1, x0:x1]
            src_rgb = rgba[iy[y0:y1, x0:x1], ix[y0:y1, x0:x1], :3]
            filled = img.copy()
            filled[..., :3] = src_rgb
            # 補畫區做一點模糊，避免最近鄰的條紋感
            blur = np.stack([ndimage.gaussian_filter(filled[..., k].astype(np.float32), 3 * s) for k in range(3)], -1)
            img[fz, :3] = np.clip(blur[fz], 0, 255).astype(np.uint8)
            img[fz, 3] = 255
            mask = mask | fill
        x0, x1, y0, y1 = int(x0), int(x1), int(y0), int(y1)
        pw, ph = x1 - x0, y1 - y0
        # 網格：格子內只要有像素就保留
        nx, ny = max(1, math.ceil(pw / step)), max(1, math.ceil(ph / step))
        gx = np.linspace(0, pw, nx + 1)
        gy = np.linspace(0, ph, ny + 1)
        mpart = ndimage.binary_dilation(mask[y0:y1, x0:x1], iterations=max(2, int(rig.get("mesh_pad", 2) * s)))
        vid = {}
        verts, tris = [], []

        def vtx(i, j):
            if (i, j) not in vid:
                vid[(i, j)] = len(verts)
                verts.append((gx[i], gy[j]))
            return vid[(i, j)]

        for j in range(ny):
            for i in range(nx):
                cx0, cx1 = int(gx[i]), int(math.ceil(gx[i + 1]))
                cy0, cy1 = int(gy[j]), int(math.ceil(gy[j + 1]))
                if not mpart[cy0:cy1, cx0:cx1].any():
                    continue
                a, b, c, d = vtx(i, j), vtx(i + 1, j), vtx(i + 1, j + 1), vtx(i, j + 1)
                if (i + j) % 2 == 0:
                    tris += [a, b, c, a, c, d]
                else:
                    tris += [a, b, d, b, c, d]
        allowed = list(pb) + list(part.get("grow", [])) + list(part.get("under", []))
        allowed = [n for n in dict.fromkeys(allowed)]
        vdata, uvs = [], []
        for (vx, vy) in verts:
            ix, iy = vx + x0, vy + y0
            wx, wy = ix - root[0], root[1] - iy
            ws = weights_at(ix, iy, allowed)
            vdata.append(int(len(ws)))
            for bn, w in ws.items():
                lx, ly = bones[bn].to_local(wx, wy)
                vdata += [idx[bn], round(lx, 2), round(ly, 2), round(w, 4)]
            uvs += [round(vx / pw, 5), round(vy / ph, 5)]
        parts_out.append(dict(part=part, img=Image.fromarray(img, "RGBA"), w=pw, h=ph,
                              uvs=uvs, tris=tris, vdata=vdata, nv=len(verts)))
        print(f"  ✓ part {part['name']:<10} {pw}x{ph}  verts={len(verts)} tris={len(tris)//3}")

    # ---- 4b. 全身泛光層（linkedmesh：共用部件網格與權重，貼圖是模糊剪影）
    glow = rig.get("glow")
    glow_out = []
    if glow:
        col = tuple(int(glow["color"][i:i + 2], 16) for i in (0, 2, 4))
        for p in parts_out:
            if p["part"]["name"] not in glow.get("parts", [p["part"]["name"]]):
                continue
            al = np.asarray(p["img"])[..., 3].astype(np.float32) / 255
            bl = ndimage.gaussian_filter(al, glow.get("blur", 7) * s)
            # 只留外圈光暈：模糊後扣掉本體，內部只剩一點點亮度（原本整片 75% 不透明，疊加後整個人褪成灰白）
            # 外圈 = 模糊剪影減掉本體（內部 bl≈al≈1 時趨近 0），再補一點點內部亮度
            a2 = np.clip(np.clip((bl - al * 0.98) * 2.4, 0, 1) + al * 0.08, 0, 1)
            g = np.zeros(al.shape + (4,), np.uint8)
            g[..., :3] = col
            g[..., 3] = (a2 * 255).astype(np.uint8)
            gi = Image.fromarray(g, "RGBA")
            gi = gi.resize((max(1, gi.width // 2), max(1, gi.height // 2)), Image.LANCZOS)
            glow_out.append(dict(parent=p["part"]["name"], name=p["part"]["name"] + "_glow", img=gi,
                                 order=p["part"].get("order", 0) + 0.5, w=p["w"], h=p["h"]))

    # ---- 5. 特效貼圖（region attachment）
    fx_out = []
    for fx in rig.get("fx", []):
        if not (ROOT / fx["image"]).exists():
            print(f"  ! fx {fx['slot']} 缺圖 {fx['image']}，暫時略過")
            continue
        im = Image.open(ROOT / fx["image"]).convert("RGBA")
        sz = round(fx["size"] * s)
        aw, ah = sz, round(sz * im.height / im.width)
        tz = min(sz, fx.get("tex", 384))  # atlas 裡的貼圖上限，顯示尺寸另計
        im = im.resize((tz, round(tz * im.height / im.width)), Image.LANCZOS)
        fx_out.append(dict(fx=fx, img=im, aw=aw, ah=ah))

    # ---- 6. 打包 atlas（shelf packing）
    regions = [(p["part"]["name"], p["img"]) for p in parts_out] + [(g["name"], g["img"]) for g in glow_out] + \
              [(f["fx"]["region"], f["img"]) for f in fx_out]
    seen = set()
    regions = [r for r in regions if not (r[0] in seen or seen.add(r[0]))]
    page = rig.get("page", 2048)
    regions.sort(key=lambda r: -r[1].height)
    pos, x, y, rowh = {}, 0, 0, 0
    for nm, im in regions:
        if x + im.width > page:
            x, y, rowh = 0, y + rowh + 2, 0
        pos[nm] = (x, y)
        x += im.width + 2
        rowh = max(rowh, im.height)
    ph_total = y + rowh
    if ph_total > page:
        raise SystemExit(f"atlas 放不下（需要高度 {ph_total} > {page}），請降低 texture_scale")
    pw2 = 1
    while pw2 < max(x for x, _ in pos.values()) + max(im.width for _, im in regions):
        pw2 *= 2
    pw2 = min(max(pw2, 256), page)
    ph2 = 1
    while ph2 < ph_total:
        ph2 *= 2
    sheet = Image.new("RGBA", (pw2, ph2), (0, 0, 0, 0))
    for nm, im in regions:
        sheet.paste(im, pos[nm])
    out = OUT_DIR / name
    out.mkdir(parents=True, exist_ok=True)
    sheet.save(out / f"{name}.png", optimize=True)
    lines = [f"{name}.png", f"size: {pw2},{ph2}", "format: RGBA8888", "filter: Linear,Linear", "repeat: none"]
    for nm, im in regions:
        px, py = pos[nm]
        lines += [nm, "  rotate: false", f"  xy: {px}, {py}", f"  size: {im.width}, {im.height}",
                  f"  orig: {im.width}, {im.height}", "  offset: 0, 0", "  index: -1"]
    (out / f"{name}.atlas").write_text("\n" + "\n".join(lines) + "\n")

    # ---- 7. Spine JSON
    jb = [{"name": "root"}]
    for n in names:
        b = bones[n]
        pr = bones[b.parent]
        if pr is None:
            lx, ly, lrot = b.wx, b.wy, b.wrot
        else:
            lx, ly = pr.to_local(b.wx, b.wy)
            lrot = b.wrot - pr.wrot
        jb.append({"name": n, "parent": b.parent, "length": round(b.length, 2),
                   "rotation": round(lrot, 3), "x": round(lx, 2), "y": round(ly, 2)})
    slots, skin = [], {}
    layer = sorted([(p["part"].get("order", 0), "p", p) for p in parts_out] +
                   [(g["order"], "g", g) for g in glow_out] +
                   [(f["fx"].get("order", 100), "f", f) for f in fx_out], key=lambda t: t[0])
    for _, kind, it in layer:
        if kind == "p":
            pn = it["part"]["name"]
            slots.append({"name": pn, "bone": "root", "attachment": pn})
            skin[pn] = {pn: {"type": "mesh", "uvs": it["uvs"], "triangles": it["tris"],
                             "vertices": it["vdata"], "hull": it["nv"], "width": it["w"], "height": it["h"]}}
        elif kind == "g":
            # 不用加色混合：iPhone Safari（WebKit）上角色骨架含 additive 插槽時，本體會被畫成半透明
            slots.append({"name": it["name"], "bone": "root", "attachment": it["name"], "color": "ffffff00"})
            # 直接複製父部件網格（同 UV / 權重），貼圖改指向半解析度的發光剪影
            par = skin[it["parent"]][it["parent"]]
            skin[it["name"]] = {it["name"]: dict(par, path=it["name"])}
        else:
            fx = it["fx"]
            b = bones[fx["bone"]]
            cx, cy = fx["at"][0] * s - root[0], root[1] - fx["at"][1] * s
            lx, ly = b.to_local(cx, cy)
            sl = {"name": fx["slot"], "bone": fx["bone"], "attachment": None if fx.get("hidden") else fx["region"]}
            # 特效插槽同樣一律用一般混合（見上方 glow 說明），rig 裡的 blend 設定不再輸出
            if fx.get("color"):
                sl["color"] = fx["color"]
            slots.append(sl)
            skin[fx["slot"]] = {fx["region"]: {"x": round(lx, 2), "y": round(ly, 2),
                                               "rotation": round(-b.wrot + fx.get("rotation", 0), 2),
                                               "width": it["aw"], "height": it["ah"]}}
    xs = [0, W]
    data = {
        "skeleton": {"hash": name, "spine": "3.8.99", "x": -root[0], "y": root[1] - H,
                     "width": W, "height": H, "images": "./", "audio": ""},
        "bones": jb, "slots": slots,
        "skins": [{"name": "default", "attachments": skin}],
        "animations": build_anims(rig.get("anims", {}), bones, {sl["name"] for sl in slots}),
    }
    (out / f"{name}.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    print(f"  → {out}/{name}.json / .atlas / .png  (page {pw2}x{ph2}, skeleton {W}x{H})")

    if debug:
        dbg = np.zeros((H, W, 3), np.uint8)
        rng = np.random.default_rng(3)
        pal = rng.integers(40, 255, (len(order), 3))
        dbg[A] = pal[label[A]]
        im = Image.fromarray(dbg)
        dr = ImageDraw.Draw(im)
        for n in names:
            b = bones[n]
            dr.line([b.ih, b.it], fill=(255, 255, 255), width=3)
            dr.ellipse([b.ih[0] - 5, b.ih[1] - 5, b.ih[0] + 5, b.ih[1] + 5], outline=(0, 0, 0), width=2)
            dr.text((b.ih[0] + 6, b.ih[1] - 6), n, fill=(255, 255, 255))
        im.save(ROOT / f"art_src/rig_debug_{name}.png")


# ---------------------------------------------------------------- 動畫
CURVE = {"curve": 0.33, "c2": 0, "c3": 0.67, "c4": 1}   # ease-in-out


def build_anims(spec, bones, slot_names):
    """
    動畫規格：
      anims[name] = {"duration": D, "tracks": [...]}
      track 型別：
        osc   ：週期擺動  {"bone","ch":"rotate|translate|scale","amp":..,"period":..,"phase":..}
                 translate/scale 的 amp 為 [ax, ay]
        keys  ：明確關鍵格 {"bone","ch", "keys":[[t, v], ...]}（rotate v=角度；translate/scale v=[x,y]）
        slot  ：slot 顏色 {"slot", "keys":[[t,"rrggbbaa"], ...]} 或 {"slot","flicker":{...}}
        attach：切換附件 {"slot", "keys":[[t, name|None], ...]}
    """
    out = {}
    for an, a in spec.items():
        D = a["duration"]
        bt, st = {}, {}
        for tr in a["tracks"]:
            if "slot" in tr and tr["slot"] not in slot_names:
                continue
            if "slot" in tr:
                ent = st.setdefault(tr["slot"], {})
                if "flicker" in tr:
                    f = tr["flicker"]
                    n = int(D * f.get("rate", 12))
                    keys = []
                    for i in range(n + 1):
                        t = D * i / n
                        v = f["base"] + f["amp"] * (0.6 * math.sin(2 * math.pi * 3 * t / D + 0.7) +
                                                    0.4 * math.sin(2 * math.pi * 7 * t / D + 2.1))
                        if i == n:
                            v = f["base"] + f["amp"] * (0.6 * math.sin(0.7) + 0.4 * math.sin(2.1))
                        al = int(max(0, min(1, v)) * 255)
                        keys.append({"time": round(t, 4), "color": f.get("rgb", "ffffff") + f"{al:02x}"})
                    ent["color"] = keys
                elif tr.get("type") == "attach":
                    ent["attachment"] = [{"time": t, "name": nm} for t, nm in tr["keys"]]
                else:
                    ent["color"] = ease_color_keys(tr["keys"])
                continue
            ch = tr["ch"]
            ent = bt.setdefault(tr["bone"], {})
            keys = []
            if "keys" in tr:
                keys = ease_keys(tr["keys"], ch, tr.get("ease", True))
            else:  # osc：在每個半週期極值放關鍵格 + ease 曲線 ≈ 正弦
                P, ph = tr["period"], tr.get("phase", 0.0)
                n = max(1, round(D / P))
                P = D / n
                samples = 16 * n
                for i in range(samples + 1):
                    t = D * i / samples
                    w = math.sin(2 * math.pi * (t / P + ph))
                    if ch == "rotate":
                        keys.append({"time": round(t, 4), "angle": round(tr.get("offset", 0) + tr["amp"] * w, 3)})
                    elif ch == "translate":
                        keys.append({"time": round(t, 4), "x": round(tr["amp"][0] * w, 3), "y": round(tr["amp"][1] * w, 3)})
                    else:
                        keys.append({"time": round(t, 4), "x": round(1 + tr["amp"][0] * w, 5), "y": round(1 + tr["amp"][1] * w, 5)})
            # 同一骨頭同一通道多個 track → 疊加（同時間取樣）
            if ch in ent:
                ent[ch] = merge_keys(ent[ch], keys, ch)
            else:
                ent[ch] = keys
        out[an] = {}
        if bt:
            out[an]["bones"] = bt
        if st:
            out[an]["slots"] = st
    return out


# 緩動改成「密集線性取樣」而不是寫 curve 欄位：Cocos 的 Spine 執行庫讀 curve 時會把顏色插值成接近 0，
# 角色施法時變得又暗又半透明。每秒 30 格的線性關鍵格在所有執行庫上結果都一樣。
EASE_FPS = 30


def _ease(u):
    return u * u * (3 - 2 * u)  # smoothstep，接近原本的 ease-in-out


def _segments(keys):
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        n = max(1, int(round((t1 - t0) * EASE_FPS)))
        for i in range(n):
            yield t0 + (t1 - t0) * i / n, v0, v1, _ease(i / n)


def ease_keys(keys, ch, ease=True):
    out = []
    if not ease or len(keys) < 2:
        seq = [(t, v, v, 0) for t, v in keys]
    else:
        seq = list(_segments(keys)) + [(keys[-1][0], keys[-1][1], keys[-1][1], 0)]
    for t, v0, v1, u in seq:
        k = {"time": round(t, 4)}
        if ch == "rotate":
            k["angle"] = round(v0 + (v1 - v0) * u, 3)
        else:
            k["x"] = round(v0[0] + (v1[0] - v0[0]) * u, 4)
            k["y"] = round(v0[1] + (v1[1] - v0[1]) * u, 4)
        out.append(k)
    return out


def ease_color_keys(keys):
    def rgba(h):
        return [int(h[i:i + 2], 16) for i in (0, 2, 4, 6)]
    out = []
    seq = list(_segments(keys)) + [(keys[-1][0], keys[-1][1], keys[-1][1], 0)]
    for t, c0, c1, u in seq:
        a, b = rgba(c0), rgba(c1)
        c = "".join(f"{round(x + (y - x) * u):02x}" for x, y in zip(a, b))
        out.append({"time": round(t, 4), "color": c})
    return out


def merge_keys(a, b, ch):
    """把兩組關鍵格合併成疊加結果（在所有時間點取樣後相加）"""
    def sample(keys, t):
        if t <= keys[0]["time"]:
            k = keys[0]
        elif t >= keys[-1]["time"]:
            k = keys[-1]
        else:
            for i in range(len(keys) - 1):
                if keys[i]["time"] <= t <= keys[i + 1]["time"]:
                    k0, k1 = keys[i], keys[i + 1]
                    u = (t - k0["time"]) / max(1e-6, k1["time"] - k0["time"])
                    if ch == "rotate":
                        return k0["angle"] + (k1["angle"] - k0["angle"]) * u
                    return (k0["x"] + (k1["x"] - k0["x"]) * u, k0["y"] + (k1["y"] - k0["y"]) * u)
        return k["angle"] if ch == "rotate" else (k["x"], k["y"])
    ts = sorted(set([k["time"] for k in a] + [k["time"] for k in b]))
    out = []
    for t in ts:
        va, vb = sample(a, t), sample(b, t)
        if ch == "rotate":
            out.append({"time": t, "angle": round(va + vb, 3)})
        elif ch == "translate":
            out.append({"time": t, "x": round(va[0] + vb[0], 3), "y": round(va[1] + vb[1], 3)})
        else:
            out.append({"time": t, "x": round(va[0] * vb[0], 5), "y": round(va[1] * vb[1], 5)})
    return out


if __name__ == "__main__":
    build(sys.argv[1], debug="--debug" in sys.argv)
