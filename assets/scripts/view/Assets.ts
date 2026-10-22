import { resources, ImageAsset, SpriteFrame, BitmapFont, sp, Texture2D, JsonAsset } from 'cc';

/** 集中載入 resources/ 下所有美術、字型、Spine */
export class Assets {
    static frames: Record<string, SpriteFrame> = {};
    static fonts: Record<string, BitmapFont> = {};
    static spines: Record<string, sp.SkeletonData> = {};
    /** 盤框內框位置（由 art 處理腳本量測） */
    static frameMeta: any = null;

    static sf(name: string): SpriteFrame | null {
        return Assets.frames[name] || null;
    }

    static load(onProgress: (p: number) => void): Promise<void> {
        const jobs: Promise<void>[] = [];
        let done = 0;
        const total = 6;
        const tick = () => onProgress(++done / total);

        const dir = (path: string) => new Promise<void>((res) => {
            // ImageAsset 的 name 可能是空字串，改用「資源路徑 ↔ uuid」對應出檔名
            const infos = resources.getDirWithPath(path, ImageAsset);
            const nameOf: Record<string, string> = {};
            for (const it of infos) nameOf[it.uuid] = it.path.substring(it.path.lastIndexOf('/') + 1);
            resources.loadDir(path, ImageAsset, (err, list) => {
                if (err) console.warn('[Assets] loadDir', path, err);
                (list || []).forEach((img) => {
                    const name = nameOf[img.uuid] || img.name;
                    if (!name) return;
                    const f = SpriteFrame.createWithImage(img);
                    // 線性過濾、避免縮小時鋸齒
                    const tex = f.texture as Texture2D;
                    if (tex && tex.setFilters) tex.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
                    // 圓角面板貼圖設九宮格邊界（96px 圖、圓角 24）
                    if (name.indexOf('ui_round') === 0) f.insetLeft = f.insetRight = f.insetTop = f.insetBottom = 30;
                    Assets.frames[name] = f;
                });
                console.log(`[Assets] ${path}: ${Object.keys(Assets.frames).length} frames`);
                tick();
                res();
            });
        });
        jobs.push(dir('art'));
        jobs.push(dir('fx'));

        const font = (name: string) => new Promise<void>((res) => {
            resources.load('font/' + name, BitmapFont, (err, f) => {
                if (err) console.warn('[Assets] font', name, err);
                else Assets.fonts[name] = f;
                res();
            });
        });
        jobs.push(Promise.all([font('num_gold'), font('num_white')]).then(tick));

        const spine = (name: string) => new Promise<void>((res) => {
            resources.load(`spine/${name}/${name}`, sp.SkeletonData, (err, d) => {
                if (err) console.warn('[Assets] spine', name, err);
                else Assets.spines[name] = d;
                tick();
                res();
            });
        });
        jobs.push(spine('seth'));
        jobs.push(spine('goddess'));
        jobs.push(spine('seth_awaken'));

        return Promise.all(jobs).then(() => new Promise<void>((res) => {
            resources.load('art/frame_meta', JsonAsset, (err, json) => {
                if (!err && json) Assets.frameMeta = json.json || null;
                res();
            });
        }));
    }
}
