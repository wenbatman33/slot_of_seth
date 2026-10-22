# 覺醒賽特（全螢幕特寫）骨架規格 — art_src/keyed/seth_awaken.png（1473x1024，y 向下），左右對稱


def mx(pts):
    """左側多邊形鏡射成右側"""
    return [(1473 - x, y) for x, y in pts]


UPARM_L = [(330, 470), (462, 490), (452, 720), (300, 722), (150, 702), (30, 642), (8, 560), (120, 556), (230, 508)]
FOREARM_L = [(4, 520), (10, 584), (120, 562), (232, 502), (302, 330), (252, 238), (198, 258), (98, 350), (28, 430)]
FIST_L = [(198, 176), (424, 176), (434, 322), (384, 344), (282, 334), (228, 302)]

RIG = {
    "image": "art_src/keyed/seth_awaken.png",
    "texture_scale": 0.85,
    "root": [736, 1024],
    "grid": 20,
    "sigma": 12,
    "bones": [
        {"name": "hip", "parent": "root", "head": [736, 1010], "tail": [736, 880], "sigma": 18},
        {"name": "belly", "parent": "hip", "head": [736, 880], "tail": [736, 720], "sigma": 18},
        {"name": "chest", "parent": "belly", "head": [736, 720], "tail": [736, 520], "sigma": 16},
        {"name": "neck", "parent": "chest", "head": [736, 520], "tail": [736, 440], "auto": False},
        {"name": "head", "parent": "neck", "head": [736, 440], "tail": [736, 20], "sigma": 10},
        {"name": "nemes_l", "parent": "neck", "head": [600, 470], "tail": [590, 670], "auto": False, "sigma": 10},
        {"name": "nemes_r", "parent": "neck", "head": [873, 470], "tail": [883, 670], "auto": False, "sigma": 10},
        {"name": "uparm_l", "parent": "chest", "head": [420, 570], "tail": [70, 570], "auto": False, "sigma": 8},
        {"name": "forearm_l", "parent": "uparm_l", "head": [70, 545], "tail": [272, 300], "auto": False, "sigma": 8},
        {"name": "fist_l", "parent": "forearm_l", "head": [272, 300], "tail": [360, 240], "auto": False, "sigma": 7},
        {"name": "uparm_r", "parent": "chest", "head": [1053, 570], "tail": [1403, 570], "auto": False, "sigma": 8},
        {"name": "forearm_r", "parent": "uparm_r", "head": [1403, 545], "tail": [1201, 300], "auto": False, "sigma": 8},
        {"name": "fist_r", "parent": "forearm_r", "head": [1201, 300], "tail": [1113, 240], "auto": False, "sigma": 7},
    ],
    "polygons": [
        {"bone": "neck", "pts": [(680, 420), (792, 420), (792, 500), (680, 500)]},
        {"bone": "nemes_l", "pts": [(552, 440), (650, 440), (650, 680), (560, 680)]},
        {"bone": "nemes_r", "pts": mx([(552, 440), (650, 440), (650, 680), (560, 680)])},
        {"bone": "uparm_l", "pts": UPARM_L},
        {"bone": "forearm_l", "pts": FOREARM_L},
        {"bone": "fist_l", "pts": FIST_L},
        {"bone": "uparm_r", "pts": mx(UPARM_L)},
        {"bone": "forearm_r", "pts": mx(FOREARM_L)},
        {"bone": "fist_r", "pts": mx(FIST_L)},
    ],
    "parts": [
        {"name": "body", "order": 1, "bones": ["hip", "belly", "chest", "neck", "head", "nemes_l", "nemes_r"],
         "fill": ["uparm_l", "uparm_r"], "fill_px": 40,
         "fill_band": {"bones": ["uparm_l", "uparm_r"], "px": 45}},
        {"name": "arm_l", "order": 2, "bones": ["uparm_l", "forearm_l", "fist_l"], "grow": ["chest"], "grow_px": 18},
        {"name": "arm_r", "order": 3, "bones": ["uparm_r", "forearm_r", "fist_r"], "grow": ["chest"], "grow_px": 18},
    ],
    "fx": [
        {"slot": "aura", "region": "glow_blue", "bone": "chest", "image": "art_src/fx/glow_blue.png",
         "size": 1300, "at": [736, 520], "blend": "additive", "order": 0, "color": "ffffff55"},
        {"slot": "eye_l", "region": "glow_blue", "bone": "head", "image": "art_src/fx/glow_blue.png",
         "size": 110, "at": [706, 300], "blend": "additive", "order": 20},
        {"slot": "eye_r", "region": "glow_blue", "bone": "head", "image": "art_src/fx/glow_blue.png",
         "size": 110, "at": [784, 300], "blend": "additive", "order": 21},
        {"slot": "bolt_l", "region": "bolt", "bone": "forearm_l", "image": "art_src/keyed/fx_lightning.png",
         "size": 520, "at": [190, 380], "blend": "additive", "order": 22, "rotation": -20},
        {"slot": "bolt_r", "region": "bolt", "bone": "forearm_r", "image": "art_src/keyed/fx_lightning.png",
         "size": 520, "at": [1283, 380], "blend": "additive", "order": 23, "rotation": 110},
        {"slot": "bolt_c", "region": "bolt", "bone": "head", "image": "art_src/keyed/fx_lightning.png",
         "size": 640, "at": [736, 160], "blend": "additive", "order": 24, "rotation": 45},
    ],
    "anims": {
        # 進場：手臂從下方舉起成雙臂展力
        "intro": {"duration": 1.0, "tracks": [
            {"bone": "uparm_l", "ch": "rotate", "keys": [[0, 28], [0.55, -4], [0.75, 1], [1.0, 0]]},
            {"bone": "uparm_r", "ch": "rotate", "keys": [[0, -28], [0.55, 4], [0.75, -1], [1.0, 0]]},
            {"bone": "forearm_l", "ch": "rotate", "keys": [[0, -38], [0.55, 6], [0.75, -2], [1.0, 0]]},
            {"bone": "forearm_r", "ch": "rotate", "keys": [[0, 38], [0.55, -6], [0.75, 2], [1.0, 0]]},
            {"bone": "chest", "ch": "scale", "keys": [[0, [0.97, 0.97]], [0.55, [1.04, 1.04]], [1.0, [1, 1]]]},
            {"bone": "head", "ch": "rotate", "keys": [[0, -6], [0.55, 2], [1.0, 0]]},
            {"slot": "eye_l", "keys": [[0, "ffffff00"], [0.5, "ffffff00"], [0.6, "ffffffff"], [1.0, "ffffffcc"]]},
            {"slot": "eye_r", "keys": [[0, "ffffff00"], [0.5, "ffffff00"], [0.6, "ffffffff"], [1.0, "ffffffcc"]]},
            {"slot": "bolt_l", "keys": [[0, "ffffff00"], [0.6, "ffffff00"], [0.65, "ffffffff"], [1.0, "ffffff66"]]},
            {"slot": "bolt_r", "keys": [[0, "ffffff00"], [0.6, "ffffff00"], [0.68, "ffffffff"], [1.0, "ffffff66"]]},
            {"slot": "bolt_c", "keys": [[0, "ffffff00"], [0.6, "ffffff00"], [0.7, "ffffffff"], [1.0, "ffffff00"]]},
            {"slot": "aura", "keys": [[0, "ffffff00"], [0.55, "ffffffaa"], [1.0, "ffffff66"]]},
        ]},
        # 持續：肌肉顫動、雷電劈啪
        "power": {"duration": 2.0, "tracks": [
            {"bone": "uparm_l", "ch": "rotate", "amp": 1.2, "period": 0.25},
            {"bone": "uparm_r", "ch": "rotate", "amp": -1.2, "period": 0.25, "phase": 0.1},
            {"bone": "fist_l", "ch": "rotate", "amp": 2.5, "period": 0.5},
            {"bone": "fist_r", "ch": "rotate", "amp": -2.5, "period": 0.5, "phase": 0.2},
            {"bone": "chest", "ch": "scale", "amp": [0.015, 0.025], "period": 1.0},
            {"bone": "head", "ch": "rotate", "amp": 0.8, "period": 0.4},
            {"bone": "nemes_l", "ch": "rotate", "amp": 2, "period": 1.0},
            {"bone": "nemes_r", "ch": "rotate", "amp": -2, "period": 1.0, "phase": 0.2},
            {"slot": "eye_l", "flicker": {"base": 0.85, "amp": 0.15, "rate": 20}},
            {"slot": "eye_r", "flicker": {"base": 0.85, "amp": 0.15, "rate": 20}},
            {"slot": "bolt_l", "flicker": {"base": 0.35, "amp": 0.65, "rate": 24}},
            {"slot": "bolt_r", "flicker": {"base": 0.3, "amp": 0.7, "rate": 28}},
            {"slot": "bolt_c", "flicker": {"base": 0.15, "amp": 0.6, "rate": 22}},
            {"slot": "aura", "flicker": {"base": 0.35, "amp": 0.12, "rate": 6}},
        ]},
    },
}
