// 도감 위쪽의 고양이 방 그림. 방 도트 한 칸 = 캔버스 1px, 화면에서는 2배로 키운다.
// 가구는 작은 도트 판에 칠한 뒤 둘레에 짙은 윤곽선을 둘러서 고양이 그림과 같은 느낌을 낸다.
import {stageOf, type CatState} from '../../shared/growth'
import {FLOOR, ROOM_H, ROOM_W, TOWER_SHELVES, WHEEL_R, roomStep, startCat, unlockedAt, type FurnId, type Furniture, type RoomCat} from '../../shared/room'
import {FRAMES, POSE_FPS} from '../../shared/sprites'
import {spriteFor} from './draw'

const OUTLINE = '#3a2a2a'

// 색을 칠하는 작은 도트 판 (빈칸 = null)
class Art {
    cells: (string | null)[][] = Array.from({length: ROOM_H}, () => Array<string | null>(ROOM_W).fill(null))

    put(x: number, y: number, c: string): this {
        x = Math.round(x)
        y = Math.round(y)
        if (x >= 0 && x < ROOM_W && y >= 0 && y < ROOM_H) this.cells[y][x] = c
        return this
    }

    rect(x0: number, y0: number, x1: number, y1: number, c: string): this {
        for (let y = Math.round(y0); y <= Math.round(y1); y++) for (let x = Math.round(x0); x <= Math.round(x1); x++) this.put(x, y, c)
        return this
    }

    ellipse(cx: number, cy: number, rx: number, ry: number, c: string): this {
        for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
            for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) this.put(x, y, c)
        }
        return this
    }

    line(x0: number, y0: number, x1: number, y1: number, c: string): this {
        const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
        for (let i = 0; i <= n; i++) this.put(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c)
        return this
    }

    // 둘레에 윤곽선을 두르고 캔버스에 그린다
    paint(ctx: CanvasRenderingContext2D): void {
        const has = (x: number, y: number): boolean => !!this.cells[y]?.[x]
        for (let y = 0; y < ROOM_H; y++) for (let x = 0; x < ROOM_W; x++) {
            const c = this.cells[y][x]
            if (c) ctx.fillStyle = c
            else if (has(x + 1, y) || has(x - 1, y) || has(x, y + 1) || has(x, y - 1)) ctx.fillStyle = OUTLINE
            else continue
            ctx.fillRect(x, y, 1, 1)
        }
    }
}

// ---- 가구 그림 ----
const WOOD = '#b97c4f', WOOD_D = '#8a5a3c', WOOD_L = '#d9a06b'
const ROPE = '#d8c08a', ROPE_D = '#b39a62'
const PINK = '#f2a2b8', PINK_D = '#d47a95', CREAM = '#fff2e0'

const DRAW: Record<FurnId, (a: Art, x: number) => void> = {
    rug: (a, x) => {
        a.ellipse(x, FLOOR + 5, 36, 5, '#a68bd0').ellipse(x, FLOOR + 5, 32, 3.5, '#c9b3e6')
    },
    window: (a, x) => { // 벽에 걸린 창문: 하늘과 구름
        a.rect(x - 16, 10, x + 16, 42, '#f4f1ea').rect(x - 14, 12, x + 14, 40, '#a9d8ff')
        a.rect(x - 14, 12, x + 14, 20, '#c4e4ff').ellipse(x - 6, 22, 5, 2, '#ffffff').ellipse(x + 7, 30, 4, 1.5, '#ffffff')
        a.rect(x - 1, 12, x + 1, 40, '#f4f1ea').rect(x - 14, 25, x + 14, 27, '#f4f1ea')
        a.rect(x - 18, 42, x + 18, 44, WOOD)
    },
    bowl: (a, x) => {
        a.ellipse(x, FLOOR - 4, 6, 1.5, '#a0603a').put(x - 2, FLOOR - 5, '#c07a4a').put(x + 2, FLOOR - 5, '#c07a4a')
        a.rect(x - 7, FLOOR - 3, x + 7, FLOOR - 2, '#5a8fd6').rect(x - 6, FLOOR - 1, x + 6, FLOOR, '#3d6bb0')
    },
    bed: (a, x) => {
        a.ellipse(x, FLOOR - 2, 16, 4, PINK_D).ellipse(x, FLOOR - 3, 15, 3.5, PINK).ellipse(x, FLOOR - 3, 11, 2, CREAM)
    },
    scratcher: (a, x) => {
        a.rect(x - 10, FLOOR - 2, x + 9, FLOOR, WOOD_D)
        for (let y = FLOOR - 36; y <= FLOOR - 3; y++) a.rect(x - 3, y, x + 2, y, (y - FLOOR) % 3 === 0 ? ROPE_D : ROPE)
        a.rect(x - 6, FLOOR - 39, x + 5, FLOOR - 37, WOOD).line(x + 4, FLOOR - 36, x + 4, FLOOR - 31, '#e86a8f').put(x + 4, FLOOR - 30, '#ff9bb5')
    },
    yarn: (a, x) => {
        a.ellipse(x, FLOOR - 3, 3.5, 3.5, '#e86a8f').line(x - 2, FLOOR - 5, x + 2, FLOOR - 1, '#ff9bb5').line(x - 3, FLOOR - 2, x + 1, FLOOR - 6, '#ff9bb5')
        a.line(x + 3, FLOOR, x + 9, FLOOR, '#e86a8f')
    },
    plant: (a, x) => {
        a.ellipse(x - 4, FLOOR - 16, 4, 6, '#3f8f4a').ellipse(x + 4, FLOOR - 17, 4, 7, '#3f8f4a').ellipse(x, FLOOR - 21, 4, 7, '#6cbf6a').ellipse(x - 1, FLOOR - 14, 5, 4, '#6cbf6a')
        a.rect(x - 5, FLOOR - 9, x + 5, FLOOR - 8, '#b65f3e').rect(x - 4, FLOOR - 7, x + 4, FLOOR, '#c96f4a')
    },
    tower: (a, x) => {
        const [low, high] = TOWER_SHELVES
        a.rect(x - 17, FLOOR - 3, x + 16, FLOOR, WOOD_D) // 받침
        for (let y = FLOOR - high; y <= FLOOR - 4; y++) a.rect(x - 2, y, x + 1, y, (y - FLOOR) % 3 === 0 ? ROPE_D : ROPE) // 기둥
        a.rect(x - 20, FLOOR - low + 1, x + 4, FLOOR - low + 3, WOOD).rect(x - 20, FLOOR - low + 1, x + 4, FLOOR - low + 1, WOOD_L) // 아래 선반
        a.rect(x - 8, FLOOR - high + 1, x + 16, FLOOR - high + 3, WOOD).rect(x - 8, FLOOR - high + 1, x + 16, FLOOR - high + 1, WOOD_L) // 위 선반
        a.line(x - 16, FLOOR - low + 4, x - 16, FLOOR - low + 9, '#e86a8f').ellipse(x - 16, FLOOR - low + 11, 1.5, 1.5, '#ff9bb5') // 매달린 공
    },
    wheel: () => {} // 캣휠은 바퀴가 돌아야 해서 매 프레임 따로 그린다 (wheelArt)
}

function wheelArt(x: number, angle: number): Art {
    const a = new Art()
    const cy = FLOOR - WHEEL_R + 2
    a.line(x - 14, FLOOR, x, cy, WOOD_D).line(x + 14, FLOOR, x, cy, WOOD_D).rect(x - 16, FLOOR - 1, x + 16, FLOOR, WOOD_D) // 받침대
    for (let i = 0; i < 6; i++) {
        const t = angle + (i * Math.PI) / 3
        a.line(x, cy, x + Math.cos(t) * (WHEEL_R - 2), cy + Math.sin(t) * (WHEEL_R - 2), '#c9b8a4')
    }
    for (let k = 0; k < 360; k++) {
        const t = (k * Math.PI) / 180
        for (const r of [WHEEL_R, WHEEL_R - 1, WHEEL_R - 2]) a.put(x + Math.cos(t) * r, cy + Math.sin(t) * r, r === WHEEL_R - 2 ? WOOD_L : WOOD)
    }
    a.ellipse(x, cy, 2, 2, WOOD_D)
    return a
}

// 벽과 바닥, 그리고 움직이지 않는 가구 (가구 목록이 바뀔 때만 다시 그린다)
function background(list: Furniture[]): HTMLCanvasElement {
    const c = document.createElement('canvas')
    c.width = ROOM_W
    c.height = ROOM_H
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#f3e6d3' // 벽
    ctx.fillRect(0, 0, ROOM_W, ROOM_H)
    ctx.fillStyle = '#ead9c2'
    for (let y = 4; y < 70; y += 8) for (let x = (y / 8) % 2 ? 4 : 8; x < ROOM_W; x += 8) ctx.fillRect(x, y, 1, 1) // 벽지 점무늬
    ctx.fillStyle = '#d9a979' // 바닥
    ctx.fillRect(0, 72, ROOM_W, ROOM_H - 72)
    ctx.fillStyle = '#c48f5e'
    for (let y = 72; y < ROOM_H; y += 7) ctx.fillRect(0, y, ROOM_W, 1) // 마룻널
    for (let y = 72, row = 0; y < ROOM_H; y += 7, row++) for (let x = row % 2 ? 20 : 50; x < ROOM_W; x += 60) ctx.fillRect(x, y, 1, 7)
    ctx.fillStyle = '#b07c50' // 걸레받이
    ctx.fillRect(0, 69, ROOM_W, 3)
    const art = new Art()
    // 러그 -> 벽 가구 -> 바닥 가구 순으로 겹친다
    const order: FurnId[] = ['rug', 'window', 'plant', 'scratcher', 'tower', 'bed', 'bowl', 'yarn']
    for (const id of order) {
        const f = list.find((it) => it.id === id)
        if (f) DRAW[id](art, f.x)
    }
    art.paint(ctx)
    return c
}

// 방 하나를 캔버스에 그리고 계속 움직이게 한다. getState는 매 프레임 최신 상태를 돌려준다.
export function mountRoom(canvas: HTMLCanvasElement, getState: () => { cat: CatState; levelUps: number; cats: number }): void {
    canvas.width = ROOM_W
    canvas.height = ROOM_H
    const ctx = canvas.getContext('2d')!
    let rc: RoomCat = startCat()
    let bgKey = ''
    let bg: HTMLCanvasElement | null = null
    let angle = 0
    let prev = performance.now()
    const frame = (now: number): void => {
        const dt = Math.min((now - prev) / 1000, 0.1)
        prev = now
        const {cat, levelUps, cats} = getState()
        const list = unlockedAt({levels: levelUps, cats})
        const key = list.map((f) => f.id).join()
        if (key !== bgKey) {
            bgKey = key
            bg = background(list)
        }
        rc = roomStep(rc, dt, list, Math.random)
        ctx.clearRect(0, 0, ROOM_W, ROOM_H)
        ctx.drawImage(bg!, 0, 0)
        const wheel = list.find((f) => f.id === 'wheel')
        if (wheel) {
            if (rc.spin) angle += dt * 4
            wheelArt(wheel.x, angle).paint(ctx)
        }
        // 고양이: 그림의 발바닥 줄(GRID_H - 2)이 바닥에서 y만큼 위에 오게
        const s = spriteFor(stageOf(cat.level).id, cat.coat, rc.pose, Math.floor(rc.t * POSE_FPS[rc.pose]) % FRAMES[rc.pose], cat.gear)
        const left = Math.round(rc.x) - 27, top = FLOOR - Math.round(rc.y) - (s.image.height - 2)
        ctx.save()
        if (rc.dir === -1) {
            ctx.translate(left * 2 + s.image.width, 0)
            ctx.scale(-1, 1)
        }
        ctx.drawImage(s.image, left, top)
        ctx.restore()
        requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
}
