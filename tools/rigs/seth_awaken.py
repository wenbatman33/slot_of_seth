# 覺醒賽特（全螢幕特寫）骨架規格 v2 — 依原作 427~430 秒：雙臂舉在頭兩側、手掌張開成爪狀蓄力、雙眼發光、全畫面藍色雷光
# 座標為 art_src/keyed/seth_awaken2.png（1410x1024，y 向下），左右大致對稱；舊版（屈臂姿勢）見 seth_awaken_v1.py
W = 1410


def mx(pts):
    """左側多邊形鏡射成右側"""
    return [(W - x, y) for x, y in pts]


UPARM_L = [(370, 520), (360, 700), (250, 715), (100, 700), (20, 670), (0, 620), (0, 540), (60, 515), (200, 505), (300, 500)]
FOREARM_L = [(0, 600), (0, 500), (60, 380), (150, 260), (275, 285), (280, 340), (225, 450), (120, 560), (60, 610)]
HAND_L = [(175, 60), (455, 60), (455, 285), (285, 320), (190, 300), (165, 230)]

RIG = {
    "image": "art_src/keyed/seth_awaken2.png",
    "texture_scale": 0.85,
    "root": [705, 1024],
    "grid": 20,
    "sigma": 12,
    "bones": [
        {"name": "hip", "parent": "root", "head": [705, 1024], "tail": [705, 880], "sigma": 18},
        {"name": "belly", "parent": "hip", "head": [705, 880], "tail": [705, 720], "sigma": 18},
        {"name": "chest", "parent": "belly", "head": [705, 720], "tail": [705, 470], "sigma": 16},
        {"name": "neck", "parent": "chest", "head": [705, 470], "tail": [705, 400], "auto": False},
        {"name": "head", "parent": "neck", "head": [705, 400], "tail": [705, 10], "sigma": 10},
        {"name": "nemes_l", "parent": "neck", "head": [585, 420], "tail": [575, 690], "auto": False, "sigma": 10},
        {"name": "nemes_r", "parent": "neck", "head": [865, 420], "tail": [875, 690], "auto": False, "sigma": 10},
        {"name": "uparm_l", "parent": "chest", "head": [360, 540], "tail": [40, 575], "auto": False, "sigma": 14},
        {"name": "forearm_l", "parent": "uparm_l", "head": [40, 575], "tail": [245, 295], "auto": False, "sigma": 14},
        {"name": "hand_l", "parent": "forearm_l", "head": [245, 295], "tail": [320, 120], "auto": False, "sigma": 10},
        {"name": "uparm_r", "parent": "chest", "head": [W - 360, 540], "tail": [W - 40, 575], "auto": False, "sigma": 14},
        {"name": "forearm_r", "parent": "uparm_r", "head": [W - 40, 575], "tail": [W - 245, 295], "auto": False, "sigma": 14},
        {"name": "hand_r", "parent": "forearm_r", "head": [W - 245, 295], "tail": [W - 320, 120], "auto": False, "sigma": 10},
    ],
    "polygons": [
        {"bone": "neck", "pts": [(650, 400), (760, 400), (760, 470), (650, 470)]},
        {"bone": "nemes_l", "pts": [(520, 360), (650, 380), (650, 700), (520, 700)]},
        {"bone": "nemes_r", "pts": [(790, 380), (940, 360), (940, 700), (800, 700)]},
        {"bone": "uparm_l", "pts": UPARM_L},
        {"bone": "forearm_l", "pts": FOREARM_L},
        {"bone": "hand_l", "pts": HAND_L},
        {"bone": "uparm_r", "pts": mx(UPARM_L)},
        {"bone": "forearm_r", "pts": mx(FOREARM_L)},
        {"bone": "hand_r", "pts": mx(HAND_L)},
    ],
    "parts": [
        {"name": "body", "order": 1, "bones": ["hip", "belly", "chest", "neck", "head", "nemes_l", "nemes_r"],
         "fill": ["uparm_l", "uparm_r"], "fill_px": 40,
         "fill_band": {"bones": ["uparm_l", "uparm_r"], "px": 45, "radius": 130}},
        {"name": "arm_l", "order": 2, "bones": ["uparm_l", "forearm_l", "hand_l"], "grow": ["chest"], "grow_px": 18},
        {"name": "arm_r", "order": 3, "bones": ["uparm_r", "forearm_r", "hand_r"], "grow": ["chest"], "grow_px": 18},
    ],
    "fx": [
        {"slot": "aura", "region": "glow_blue", "bone": "chest", "image": "art_src/fx/glow_blue.png",
         "size": 1500, "at": [705, 450], "blend": "additive", "order": 0, "color": "ffffff55"},
        {"slot": "eye_l", "region": "glow_blue", "bone": "head", "image": "art_src/fx/glow_blue.png",
         "size": 120, "at": [728, 293], "blend": "additive", "order": 20},
        {"slot": "eye_r", "region": "glow_blue", "bone": "head", "image": "art_src/fx/glow_blue.png",
         "size": 120, "at": [800, 293], "blend": "additive", "order": 21},
        {"slot": "palm_l", "region": "glow_blue", "bone": "hand_l", "image": "art_src/fx/glow_blue.png",
         "size": 380, "at": [300, 190], "blend": "additive", "order": 22},
        {"slot": "palm_r", "region": "glow_blue", "bone": "hand_r", "image": "art_src/fx/glow_blue.png",
         "size": 380, "at": [W - 300, 190], "blend": "additive", "order": 23},
        {"slot": "bolt_l", "region": "bolt", "bone": "hand_l", "image": "art_src/fx/fx_lightning_soft.png",
         "size": 560, "at": [380, 130], "blend": "additive", "order": 24, "rotation": 30},
        {"slot": "bolt_r", "region": "bolt", "bone": "hand_r", "image": "art_src/fx/fx_lightning_soft.png",
         "size": 560, "at": [W - 380, 130], "blend": "additive", "order": 25, "rotation": 150},
        {"slot": "bolt_c", "region": "bolt", "bone": "head", "image": "art_src/fx/fx_lightning_soft.png",
         "size": 700, "at": [705, 40], "blend": "additive", "order": 26, "rotation": 80},
    ],
    "anims": {
        # 進場：雙臂從胸前往上張開舉到頭兩側，手指張開蓄力
        "intro": {"duration": 1.0, "tracks": [
            {"bone": "uparm_l", "ch": "rotate", "keys": [[0, 38], [0.5, -6], [0.72, 2], [1.0, 0]]},
            {"bone": "uparm_r", "ch": "rotate", "keys": [[0, -38], [0.5, 6], [0.72, -2], [1.0, 0]]},
            {"bone": "forearm_l", "ch": "rotate", "keys": [[0, -62], [0.5, 8], [0.72, -2], [1.0, 0]]},
            {"bone": "forearm_r", "ch": "rotate", "keys": [[0, 62], [0.5, -8], [0.72, 2], [1.0, 0]]},
            {"bone": "hand_l", "ch": "rotate", "keys": [[0, -25], [0.5, 6], [1.0, 0]]},
            {"bone": "hand_r", "ch": "rotate", "keys": [[0, 25], [0.5, -6], [1.0, 0]]},
            {"bone": "chest", "ch": "scale", "keys": [[0, [0.97, 0.97]], [0.5, [1.04, 1.04]], [1.0, [1, 1]]]},
            {"bone": "head", "ch": "rotate", "keys": [[0, -6], [0.5, 3], [1.0, 0]]},
            {"slot": "eye_l", "keys": [[0, "ffffff00"], [0.45, "ffffff00"], [0.55, "ffffffff"], [1.0, "ffffffcc"]]},
            {"slot": "eye_r", "keys": [[0, "ffffff00"], [0.45, "ffffff00"], [0.55, "ffffffff"], [1.0, "ffffffcc"]]},
            {"slot": "palm_l", "keys": [[0, "ffffff00"], [0.5, "ffffff00"], [0.65, "ffffffee"], [1.0, "ffffff99"]]},
            {"slot": "palm_r", "keys": [[0, "ffffff00"], [0.5, "ffffff00"], [0.65, "ffffffee"], [1.0, "ffffff99"]]},
            {"slot": "bolt_l", "keys": [[0, "ffffff00"], [0.6, "ffffff00"], [0.65, "ffffffff"], [1.0, "ffffff66"]]},
            {"slot": "bolt_r", "keys": [[0, "ffffff00"], [0.6, "ffffff00"], [0.68, "ffffffff"], [1.0, "ffffff66"]]},
            {"slot": "bolt_c", "keys": [[0, "ffffff00"], [0.6, "ffffff00"], [0.7, "ffffffff"], [1.0, "ffffff00"]]},
            {"slot": "aura", "keys": [[0, "ffffff00"], [0.55, "ffffffaa"], [1.0, "ffffff66"]]},
        ]},
        # 持續：雙手爪子顫動蓄力、肌肉起伏、雷電劈啪
        "power": {"duration": 2.0, "tracks": [
            {"bone": "uparm_l", "ch": "rotate", "amp": 1.2, "period": 0.25},
            {"bone": "uparm_r", "ch": "rotate", "amp": -1.2, "period": 0.25, "phase": 0.1},
            {"bone": "forearm_l", "ch": "rotate", "amp": 1.5, "period": 0.5},
            {"bone": "forearm_r", "ch": "rotate", "amp": -1.5, "period": 0.5, "phase": 0.2},
            {"bone": "hand_l", "ch": "rotate", "amp": 4, "period": 0.33},
            {"bone": "hand_r", "ch": "rotate", "amp": -4, "period": 0.33, "phase": 0.15},
            {"bone": "chest", "ch": "scale", "amp": [0.015, 0.025], "period": 1.0},
            {"bone": "head", "ch": "rotate", "amp": 1.0, "period": 0.4},
            {"bone": "nemes_l", "ch": "rotate", "amp": 2, "period": 1.0},
            {"bone": "nemes_r", "ch": "rotate", "amp": -2, "period": 1.0, "phase": 0.2},
            {"slot": "eye_l", "flicker": {"base": 0.85, "amp": 0.15, "rate": 20}},
            {"slot": "eye_r", "flicker": {"base": 0.85, "amp": 0.15, "rate": 20}},
            {"slot": "palm_l", "flicker": {"base": 0.6, "amp": 0.3, "rate": 14}},
            {"slot": "palm_r", "flicker": {"base": 0.6, "amp": 0.3, "rate": 16}},
            {"slot": "bolt_l", "flicker": {"base": 0.35, "amp": 0.65, "rate": 24}},
            {"slot": "bolt_r", "flicker": {"base": 0.3, "amp": 0.7, "rate": 28}},
            {"slot": "bolt_c", "flicker": {"base": 0.15, "amp": 0.6, "rate": 22}},
            {"slot": "aura", "flicker": {"base": 0.4, "amp": 0.12, "rate": 6}},
        ]},
    },
}
