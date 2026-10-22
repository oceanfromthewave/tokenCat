import type {CoatId, Gear, StageId} from '../../shared/growth'
import {GRID_H, GRID_W, frameOf, paletteOf, type Pose} from '../../shared/sprites'

export interface Sprite {
    image: HTMLCanvasElement // GRID_W x GRID_H, 도트 한 칸 = 1px
    box: { l: number; r: number; t: number } // 그림이 실제로 차지하는 칸 범위 (마우스 판정용)
}

const SHADOW = '#3b4150' // 아직 못 찾은 품종의 실루엣 색
const cache = new Map<string, Sprite>()

// 고양이 그림 한 장을 캔버스로 만든다. 같은 그림은 다시 만들지 않는다.
export function spriteFor(stage: StageId, coat: CoatId, pose: Pose, frame: number, gear: Gear, silhouette = false): Sprite {
    const rows = frameOf(stage, coat, pose, frame, gear)
    const key = `${silhouette}|${rows.join('')}|${coat}`
    let s = cache.get(key)
    if (s) return s
    const image = document.createElement('canvas')
    image.width = GRID_W
    image.height = GRID_H
    const c = image.getContext('2d')!
    const palette = paletteOf(coat)
    const box = {l: GRID_W, r: 0, t: GRID_H}
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
        if (!palette[ch]) return
        c.fillStyle = silhouette ? SHADOW : palette[ch]
        c.fillRect(x, y, 1, 1)
        box.l = Math.min(box.l, x)
        box.r = Math.max(box.r, x)
        box.t = Math.min(box.t, y)
    }))
    s = {image, box}
    cache.set(key, s)
    return s
}
