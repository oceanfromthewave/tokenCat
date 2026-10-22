// 고양이 도트 그림. 손으로 찍은 그림 대신 몸 부위(몸통, 머리, 다리, 꼬리)를 포즈마다 그려서 만든다.
// 모든 칸에는 "어느 부위인지" 이름표(part)가 붙고, 마지막에 털 무늬 규칙이 부위별로 색을 입힌다.
// 그래서 같은 걷기/뛰기 그림에 14가지 털 무늬와 4단계 몸 크기가 그대로 적용된다.
// 몸은 옆모습(오른쪽을 봄), 얼굴은 정면이다. 왼쪽을 볼 때는 화면에서 뒤집는다.
import type {CoatId, StageId} from './growth.ts'

export type Pose = 'sit' | 'walk' | 'run' | 'sleep' | 'groom' | 'leap'

export const GRID_W = 56
export const GRID_H = 44
const GY = GRID_H - 2 // 발바닥 줄 (아래 한 줄은 테두리용)
const AX = 27 // 몸의 가운데

// 포즈별 프레임 수
export const FRAMES: Record<Pose, number> = {sit: 2, walk: 4, run: 4, sleep: 2, groom: 2, leap: 1}

// 단계별 몸 크기. 머리는 크기가 거의 그대로라서, 아기일수록 몸에 비해 머리가 크고 어른이 될수록 몸이 길고 늠름해진다.
interface Dim {
    rx: number // 몸통 가로 반지름
    ry: number // 몸통 세로 반지름
    head: number // 머리 반지름
    ear: number // 귀 높이
    leg: number // 다리 길이
    lw: number // 다리 굵기
    tail: number // 꼬리 길이
    tw: number // 꼬리 굵기(반지름)
}

const DIMS: Record<StageId, Dim> = {
    baby: {rx: 8, ry: 5.5, head: 7.5, ear: 4, leg: 4, lw: 2, tail: 8, tw: 1.2},
    kitten: {rx: 10.5, ry: 6.5, head: 8, ear: 5, leg: 5, lw: 3, tail: 11, tw: 1.4},
    young: {rx: 13, ry: 7.5, head: 8, ear: 5, leg: 6, lw: 3, tail: 13, tw: 1.6},
    adult: {rx: 15, ry: 8.5, head: 8, ear: 5, leg: 7, lw: 3, tail: 15, tw: 1.7}
}

// ---- 털 무늬 ----
// 색 이름: b 기본, s 그늘(배/먼 쪽 다리), d 무늬(줄무늬, 포인트, 검은 얼룩), l 밝은색(흰 부분), a 얼룩 보조색
// 실제 고양이의 털 무늬 규칙대로 그린다: 태비는 등/꼬리/다리/이마에 줄, 턱시도는 가슴·배·주둥이·발이 흰색,
// 젖소/삼색이는 흰 바탕에 얼룩, 샴은 귀·얼굴·다리·꼬리가 짙은 포인트, 아비시니안은 잔털 점(틱), 벵갈은 표범 무늬.
type Key = 'b' | 's' | 'd' | 'l' | 'a'
type Part = 'body' | 'under' | 'chest' | 'tail' | 'tailtip' | 'leg' | 'farleg' | 'paw' | 'head' | 'ear' | 'muzzle' | 'forehead'
type Pattern = 'solid' | 'tabby' | 'cow' | 'calico' | 'ragdoll' | 'ticked' | 'spots'

interface Coat {
    colors: Record<Key, string>
    eye: string
    pattern: Pattern
    map: Partial<Record<Part, Key>> // 부위별 색 (없으면 b, 먼 쪽 다리는 s)
    cheek?: number // 볼살 크기 (기본 0.3). 브리티시 숏헤어, 랙돌은 통통하다.
    fluffy?: boolean // 꼬리가 풍성하다 (랙돌, 페르시안, 메인쿤)
    ear?: number // 귀 높이 가감 (스핑크스는 크고 페르시안은 작다)
    fold?: boolean // 접힌 귀 (스코티시 폴드)
    flat?: boolean // 납작한 얼굴 (페르시안)
    tufts?: boolean // 귀 끝 털 (메인쿤)
    big?: boolean // 몸집이 크다 (메인쿤)
    thin?: boolean // 꼬리가 가늘다 (털 없는 스핑크스)
}

const TABBY_MAP: Coat['map'] = {under: 'l', chest: 'l', muzzle: 'l'}
const SHADED: Coat['map'] = {under: 's'}
const TUX_MAP: Coat['map'] = {under: 'l', chest: 'l', muzzle: 'l', paw: 'l'}
const WHITE_BASE: Coat['map'] = {body: 'l', under: 's', chest: 'l', tail: 'l', tailtip: 'l', leg: 'l', paw: 'l', head: 'l', muzzle: 'l', forehead: 'l'}
const GREEN = '#9be15d', AMBER = '#ffcf3f', BLUE = '#6fc7ff', COPPER = '#ffa43a'

const COATS: Record<CoatId, Coat> = {
    // 코리안 숏헤어(길고양이로 흔한 털 색)
    orange: {colors: {b: '#f0a24f', s: '#d98a3a', d: '#c4681b', l: '#fde6bd', a: '#f0a24f'}, eye: GREEN, pattern: 'tabby', map: TABBY_MAP},
    gray: {colors: {b: '#9aa3af', s: '#818a98', d: '#4f5866', l: '#e4e8ed', a: '#9aa3af'}, eye: AMBER, pattern: 'tabby', map: TABBY_MAP},
    tuxedo: {colors: {b: '#383842', s: '#2a2a33', d: '#383842', l: '#fbfbfb', a: '#383842'}, eye: GREEN, pattern: 'solid', map: TUX_MAP},
    black: {colors: {b: '#3b3b47', s: '#2a2a33', d: '#3b3b47', l: '#3b3b47', a: '#3b3b47'}, eye: AMBER, pattern: 'solid', map: SHADED},
    white: {colors: {b: '#f7f5f2', s: '#dcd8d3', d: '#f7f5f2', l: '#ffffff', a: '#f7f5f2'}, eye: AMBER, pattern: 'solid', map: SHADED},
    orangewhite: {colors: {b: '#f0a24f', s: '#d98a3a', d: '#f0a24f', l: '#ffffff', a: '#f0a24f'}, eye: GREEN, pattern: 'solid', map: TUX_MAP},
    calico: {colors: {b: '#ffffff', s: '#d9d9e2', d: '#2b2b33', l: '#ffffff', a: '#ec9a45'}, eye: GREEN, pattern: 'calico', map: WHITE_BASE},
    cow: {colors: {b: '#ffffff', s: '#d9d9e2', d: '#2b2b33', l: '#ffffff', a: '#2b2b33'}, eye: GREEN, pattern: 'cow', map: {...WHITE_BASE, ear: 'a'}},
    // 품종묘
    blue: {colors: {b: '#8e9bb0', s: '#737f95', d: '#8e9bb0', l: '#b9c3d4', a: '#8e9bb0'}, eye: GREEN, pattern: 'solid', map: {under: 's', muzzle: 'l'}}, // 러시안 블루
    british: {colors: {b: '#9da4b0', s: '#80889a', d: '#9da4b0', l: '#c9cfd9', a: '#9da4b0'}, eye: COPPER, pattern: 'solid', map: {under: 's', muzzle: 'l'}, cheek: 0.45},
    abyssinian: {colors: {b: '#b5683a', s: '#99532b', d: '#6a371b', l: '#dc9457', a: '#b5683a'}, eye: GREEN, pattern: 'ticked', map: {under: 'l', chest: 'l', ear: 'd', tailtip: 'd'}, ear: 1},
    fold: {colors: {b: '#b8bdc7', s: '#9aa0ad', d: '#b8bdc7', l: '#e4e7ec', a: '#b8bdc7'}, eye: COPPER, pattern: 'solid', map: {under: 's', muzzle: 'l'}, cheek: 0.45, fold: true}, // 스코티시 폴드
    persian: {colors: {b: '#f4e6c8', s: '#dcc9a4', d: '#f4e6c8', l: '#fff6e2', a: '#f4e6c8'}, eye: COPPER, pattern: 'solid', map: {under: 'l', muzzle: 'l'}, cheek: 0.6, fluffy: true, flat: true, ear: -2},
    siamese: {colors: {b: '#f1e3c8', s: '#d9c4a3', d: '#6b4a3a', l: '#fff1d6', a: '#f1e3c8'}, eye: BLUE, pattern: 'solid', map: {under: 'l', ear: 'd', muzzle: 'd', tail: 'd', tailtip: 'd', leg: 'd', farleg: 'd', paw: 'd'}},
    ragdoll: {colors: {b: '#f0e8dc', s: '#d8cdbd', d: '#7f8aa0', l: '#fffaf2', a: '#f0e8dc'}, eye: BLUE, pattern: 'ragdoll', map: {under: 'l', chest: 'l', tail: 'd', tailtip: 'd', leg: 'd', farleg: 'd', paw: 'l', head: 'l', muzzle: 'l', forehead: 'l', ear: 'd'}, cheek: 0.45, fluffy: true},
    bengal: {colors: {b: '#d7a25c', s: '#bb8444', d: '#6b3a17', l: '#f6e7cb', a: '#d7a25c'}, eye: GREEN, pattern: 'spots', map: {under: 'l', chest: 'l', muzzle: 'l'}},
    maincoon: {colors: {b: '#a8794a', s: '#8c5f36', d: '#4f3119', l: '#e8d3ae', a: '#a8794a'}, eye: AMBER, pattern: 'tabby', map: TABBY_MAP, cheek: 0.4, fluffy: true, tufts: true, big: true},
    sphynx: {colors: {b: '#e8b8a6', s: '#cf9987', d: '#c18a79', l: '#f4d3c5', a: '#e8b8a6'}, eye: AMBER, pattern: 'solid', map: {under: 'l', forehead: 'd'}, ear: 2, thin: true}
}

export const paletteOf = (coat: CoatId): Record<string, string> => ({
    ...COATS[coat].colors,
    o: '#2a1f26', // 테두리, 입
    q: '#ff9db1', // 볼터치
    p: '#f08fab', // 코, 귀 안쪽
    y: COATS[coat].eye, // 눈 (홍채)
    e: '#1b1b22', // 눈동자
    w: '#ffffff' // 눈빛
})

// ---- 값 잡음: 젖소/삼색이 얼룩을 자연스러운 덩어리로 만든다 (같은 좌표는 항상 같은 값) ----
function hash(x: number, y: number, seed: number): number {
    let h = Math.imul(x * 374761393 + y * 668265263 + seed * 1442695041, 1274126177)
    h ^= h >>> 13
    h = Math.imul(h, 1274126177)
    return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32
}

function noise(x: number, y: number, seed: number): number {
    const xi = Math.floor(x), yi = Math.floor(y)
    const fx = x - xi, fy = y - yi
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
    const top = hash(xi, yi, seed) * (1 - sx) + hash(xi + 1, yi, seed) * sx
    const bottom = hash(xi, yi + 1, seed) * (1 - sx) + hash(xi + 1, yi + 1, seed) * sx
    return top * (1 - sy) + bottom * sy
}

// ---- 그리는 판 ----
class Grid {
    cells: string[][] = Array.from({length: GRID_H}, () => Array<string>(GRID_W).fill('.'))
    parts: Part[][] = Array.from({length: GRID_H}, () => Array<Part>(GRID_W).fill('body'))
    cur: Part = 'body'
    look!: Coat // 지금 그리는 털 무늬 (볼살, 꼬리 같은 모양에 영향)
    bodyO: [number, number] = [AX, GY - 10] // 몸 부위 무늬의 기준점
    headO: [number, number] = [AX, GY - 20] // 머리 부위 무늬의 기준점

    at(part: Part): this {
        this.cur = part
        return this
    }

    get(x: number, y: number): string {
        return this.cells[y]?.[x] ?? '.'
    }

    put(x: number, y: number, ch: string, part: Part = this.cur): this {
        x = Math.round(x)
        y = Math.round(y)
        if (x >= 0 && x < GRID_W && y >= 0 && y < GRID_H) {
            this.cells[y][x] = ch
            this.parts[y][x] = part
        }
        return this
    }

    rect(x0: number, y0: number, x1: number, y1: number, ch: string, part: Part = this.cur): this {
        for (let y = Math.round(y0); y <= Math.round(y1); y++) for (let x = Math.round(x0); x <= Math.round(x1); x++) this.put(x, y, ch, part)
        return this
    }

    ellipse(cx: number, cy: number, rx: number, ry: number, ch: string, part: Part = this.cur): this {
        for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
            for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
                if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) this.put(x, y, ch, part)
            }
        }
        return this
    }

    // 굵기 w칸(가로)짜리 선. 다리에 쓴다.
    line(x0: number, y0: number, x1: number, y1: number, w: number, part: Part = this.cur): this {
        const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
        for (let i = 0; i <= n; i++) {
            const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n
            this.rect(x - (w - 1) / 2, y, x + w / 2 - 0.5, y, 'b', part)
        }
        return this
    }

    // 이미 그려진 칸 중 from 부위인 칸의 부위를 to로 바꾼다 (배, 가슴 등)
    retag(x0: number, y0: number, x1: number, y1: number, from: Part, to: Part): void {
        for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(GRID_H - 1, Math.ceil(y1)); y++) {
            for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(GRID_W - 1, Math.ceil(x1)); x++) {
                if (this.cells[y][x] === 'b' && this.parts[y][x] === from) this.parts[y][x] = to
            }
        }
    }

    // 털 무늬 색을 입히고 둘레에 한 칸 테두리를 두른다. 어떤 바탕화면에서도 윤곽이 보이게 한다.
    finish(c: Coat, d: Dim): string[] {
        const HEAD: Part[] = ['head', 'ear', 'muzzle', 'forehead']
        for (let y = 0; y < GRID_H; y++) {
            for (let x = 0; x < GRID_W; x++) {
                if (this.cells[y][x] !== 'b') continue
                const part = this.parts[y][x]
                const [ox, oy] = HEAD.includes(part) ? this.headO : this.bodyO
                const px = x - ox, py = y - oy
                // 얼굴 가운데(눈, 코)에는 얼룩을 얹지 않는다: 이마 위쪽과 옆머리에만
                const patchable = !HEAD.includes(part) || py < -d.head * 0.35 || Math.abs(px) > d.head * 0.8
                let key: Key = c.map[part] ?? (part === 'farleg' ? 's' : 'b')
                if (c.pattern === 'tabby' && key === 'b') {
                    const stripe =
                        part === 'forehead' ||
                        (part === 'body' && (((px % 6) + 6) % 6) < 2 && py < d.ry * 0.35) ||
                        (part === 'tail' && (x + y) % 5 < 2) ||
                        (part === 'leg' && y % 4 === 0)
                    if (stripe) key = 'd'
                } else if (c.pattern === 'ticked' && key === 'b') {
                    if (hash(x, y, 5) > 0.8) key = 'd' // 털 한 올마다 색이 다른 잔무늬(틱)
                } else if (c.pattern === 'spots' && key === 'b' && part !== 'ear') {
                    if (noise(px / 3.3 + 1, py / 3.3, 21) > 0.64) key = 'd' // 표범 무늬
                } else if (c.pattern === 'ragdoll' && part !== 'ear' && HEAD.includes(part) && key === 'l') {
                    // 얼굴 위쪽은 짙은 마스크, 가운데 이마는 흰 줄, 아래쪽(볼, 턱)은 흰색
                    if (py < d.head * 0.3) key = Math.abs(px) <= 1 && py > -d.head * 0.6 ? 'l' : 'd'
                } else if (c.pattern === 'cow' && key === 'l' && part !== 'muzzle' && patchable) {
                    if (noise(px / 6 + 3, py / 6, 7) > 0.56) key = 'a'
                } else if (c.pattern === 'calico') {
                    if (part === 'ear') key = px < 0 ? 'a' : 'd'
                    else if (key === 'l' && part !== 'muzzle' && patchable) {
                        if (noise(px / 5 + 3, py / 5, 3) > 0.6) key = 'a'
                        else if (noise(px / 5 + 9, py / 5 + 4, 8) > 0.62) key = 'd'
                    }
                }
                this.cells[y][x] = key
            }
        }
        return this.cells.map((row, y) =>
            row.map((ch, x) => {
                if (ch !== '.') return ch
                return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => this.get(x + dx, y + dy) !== '.') ? 'o' : '.'
            }).join(''))
    }
}

// ---- 얼굴 (정면) ----
// 귀엽게 보이는 요소: 몸만큼 큰 머리, 낮게 달린 큼직한 눈(눈빛 두 개), 볼살, 볼터치, 작은 코와 입.
function face(g: Grid, hx: number, hy: number, d: Dim, closed: boolean): void {
    hx = Math.round(hx)
    hy = Math.round(hy)
    const rx = d.head * 1.1, ry = d.head * 0.92
    g.headO = [hx, hy]
    g.at('head').ellipse(hx, hy, rx, ry, 'b')
    for (const sgn of [-1, 1]) g.ellipse(hx + sgn * rx * 0.72, hy + ry * 0.5, rx * (g.look.cheek ?? 0.3), ry * (g.look.cheek ?? 0.3), 'b') // 볼살
    // 귀: 끝이 뾰족한 삼각형, 안쪽은 분홍
    const earH = d.ear + (g.look.ear ?? 0)
    const wmax = Math.max(3, Math.round(d.head * 0.6))
    for (const sgn of [-1, 1]) {
        if (g.look.fold) {
            // 접힌 귀: 머리 위 옆에 납작하게 붙는다
            const fx = Math.round(hx + sgn * rx * 0.7)
            g.rect(fx - 2, hy - ry + 1, fx + 2, hy - ry + 2, 'b', 'ear').rect(fx - 1, hy - ry, fx + 1, hy - ry, 'b', 'ear')
            continue
        }
        const ex = Math.round(hx + sgn * rx * 0.62)
        const top = Math.round(hy - ry - earH + 2)
        if (g.look.tufts) g.put(ex, top - 1, 'b', 'ear').put(ex, top - 2, 'b', 'ear') // 귀 끝 털
        for (let i = 0; i < earH; i++) {
            const w = 1 + Math.round((i * (wmax - 1)) / (earH - 1))
            g.rect(ex - Math.floor((w - 1) / 2), top + i, ex + Math.ceil((w - 1) / 2), top + i, 'b', 'ear')
            if (i >= 2 && w >= 4) g.rect(ex - Math.floor((w - 3) / 2), top + i, ex + Math.ceil((w - 3) / 2), top + i, 'p', 'ear')
        }
    }
    // 이마 줄무늬 자리 (줄무늬 털에서만 짙게 칠해진다)
    for (const [dx, len] of [[-3, 2], [0, 4], [3, 2]] as const) g.rect(hx + dx, hy - ry + 1, hx + dx, hy - ry + len, 'b', 'forehead')
    // 눈: 모서리를 둥글린 n x n 홍채, 큰 눈동자, 눈빛 (머리가 작으면 한 칸 작게)
    const n = d.head >= 10 ? 5 : 4
    const y0 = Math.round(hy + ry * 0.02)
    for (const sgn of [-1, 1]) {
        const x0 = Math.round(hx + sgn * rx * 0.47 - n / 2)
        if (closed) {
            // 웃는 모양(^)으로 감은 눈
            g.put(x0, y0 + n - 2, 'o', 'head').put(x0 + n - 1, y0 + n - 2, 'o', 'head')
            g.rect(x0 + 1, y0 + n - 3, x0 + n - 2, y0 + n - 3, 'o', 'head')
            continue
        }
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!((r === 0 || r === n - 1) && (c === 0 || c === n - 1))) g.put(x0 + c, y0 + r, 'y', 'head')
        g.rect(x0 + 1, y0 + 1, x0 + n - 2, y0 + n - 1, 'e', 'head')
        g.rect(x0 + 1, y0 + 1, x0 + (n >= 5 ? 2 : 1), y0 + (n >= 5 ? 2 : 1), 'w', 'head') // 큰 눈빛
        g.put(x0 + n - 2, y0 + n - 1, 'w', 'head') // 작은 눈빛
        const bx = Math.round(hx + sgn * (rx * 0.47 + n / 2 + 2.2))
        g.rect(bx - 1, y0 + n - 1, bx + 1, y0 + n - 1, 'q', 'head') // 볼터치
    }
    // 주둥이, 코, 입
    const ny = y0 + n - (g.look.flat ? 3 : 2) // 납작한 얼굴은 코가 눈 높이로 올라온다
    g.ellipse(hx, ny + 1.5, rx * 0.32, ry * 0.26, 'b', 'muzzle')
    g.rect(hx - 1, ny, hx + 1, ny, 'p', 'head').put(hx, ny + 1, 'o', 'head')
    g.put(hx - 1, ny + 2, 'o', 'head').put(hx + 1, ny + 2, 'o', 'head')
}

// ---- 서 있는 포즈 (걷기, 달리기, 뛰기) ----
interface Move {
    feet: [number, number][] // [가까운 앞다리, 먼 앞다리, 가까운 뒷다리, 먼 뒷다리]의 [앞뒤 이동, 들어올림]
    bob: number // 몸 위아래
    headDy: number
    tail: 'up' | 'back'
    sway: number // 꼬리 흔들림
}

// 다리마다 걸음 위상을 다르게 해서 발이 번갈아 나가게 한다.
function gait(frame: number, stride: number, lift: number, offs: number[]): [number, number][] {
    return offs.map((o) => {
        const p = (frame / 4 + o) % 1
        return [Math.round(stride * Math.sin(2 * Math.PI * p)), Math.round(lift * Math.max(0, Math.cos(2 * Math.PI * p)))]
    })
}

function tailDraw(g: Grid, d: Dim, pts: [number, number][]): void {
    pts.forEach(([x, y], i) => g.ellipse(x, y, d.tw * (g.look.thin ? 0.6 : 1) + (g.look.fluffy ? 0.7 : 0), d.tw * (g.look.thin ? 0.6 : 1) + (g.look.fluffy ? 0.7 : 0), 'b', i >= pts.length - 3 ? 'tailtip' : 'tail'))
}

function stand(g: Grid, d: Dim, m: Move): void {
    const bx = AX
    const by = Math.round(GY - d.leg - d.ry + 1 + m.bob)
    const front = bx + Math.round(d.rx * 0.55), back = bx - Math.round(d.rx * 0.55)
    const hipY = by + Math.round(d.ry) - 2
    g.bodyO = [bx, by]

    // 꼬리
    const L = d.tail
    const pts: [number, number][] = []
    for (let i = 0; i <= L; i++) {
        const t = i / L
        pts.push(m.tail === 'up'
            ? [bx - d.rx + 1 - Math.sin(t * Math.PI * 0.9) * L * 0.3 + m.sway * t, by - t * L * 0.9]
            : [bx - d.rx + 1 - Math.round(i * 0.4), by - 1 + m.sway * Math.sin(t * 3)])
    }
    tailDraw(g, d, pts)

    const leg = (hip: number, [dx, lift]: [number, number], near: boolean): void => {
        const fx = hip + dx, fy = GY - lift
        g.line(hip, hipY, fx, fy, d.lw, near ? 'leg' : 'farleg')
        if (near) g.rect(fx - (d.lw - 1) / 2 - 0.5, fy - 1, fx + d.lw / 2, fy, 'b', 'paw')
    }
    leg(front - 3, m.feet[1], false) // 먼 쪽 다리는 짙게
    leg(back + 3, m.feet[3], false)

    // 몸통
    g.at('body').ellipse(bx, by, d.rx, d.ry, 'b')
    g.retag(bx - d.rx, by + d.ry * 0.4, bx + d.rx, by + d.ry, 'body', 'under') // 배
    g.retag(bx + d.rx * 0.55, by - d.ry * 0.3, bx + d.rx, by + d.ry * 0.4, 'body', 'chest') // 가슴

    leg(front, m.feet[0], true)
    leg(back, m.feet[2], true)

    face(g, bx + d.rx - 3, by - d.ry * 0.5 + m.headDy, d, false)
}

// ---- 앉은 포즈 ----
function sit(g: Grid, d: Dim, tailLift: number, lick: number): void {
    const s = d.rx / 12 // 12칸짜리 몸을 기준으로 잡은 좌표를 단계 크기에 맞게 늘린다
    const X = (dx: number): number => AX + dx * s
    const Y = (dy: number): number => GY - dy * s
    g.bodyO = [Math.round(X(0)), Math.round(Y(9))]
    // 꼬리: 바닥에 길게 놓고 끝을 살짝 들어 올린다
    const L = Math.max(5, Math.round(d.tail * 0.7))
    const pts: [number, number][] = []
    for (let i = 0; i < L; i++) {
        const curl = i >= L - 5 ? Math.round((i - (L - 6)) * (1 + tailLift * 0.7)) : 0
        pts.push([X(-8) - i, GY - d.tw - curl])
    }
    tailDraw(g, d, pts)
    g.at('body')
    g.ellipse(X(-3), Y(5), 7.5 * s, 5.5 * s, 'b') // 엉덩이
    g.ellipse(X(2), Y(8), 4.5 * s + 0.5, 8 * s, 'b') // 몸통
    g.retag(X(-11), Y(3.5), X(8), GY, 'body', 'under')
    // 앞다리 두 개 (가운데에 그늘 선)
    const lx0 = Math.round(X(1.5)), lx1 = Math.round(X(5.5))
    g.rect(lx0, Y(6), lx1, GY, 'b', 'leg')
    g.rect(Math.round(X(3.5)), Y(4), Math.round(X(3.5)), GY, 'b', 'farleg')
    g.rect(lx0, GY - 1, lx1, GY, 'b', 'paw')
    g.ellipse(X(4.5), Y(9), 2 * s + 0.5, 4 * s, 'b', 'chest') // 가슴
    const hx = X(4.5), hy = Y(15.5) + lick
    if (lick) {
        // 앞발을 입 쪽으로 올려 핥는다
        g.line(X(5), Y(8), hx + d.head * 0.55, hy + d.head * 0.8, d.lw, 'leg')
        g.rect(hx + d.head * 0.55 - 1, hy + d.head * 0.8 - 1, hx + d.head * 0.55 + 1, hy + d.head * 0.8, 'b', 'paw')
    }
    face(g, hx, hy, d, lick > 0)
}

// ---- 자는 포즈 (식빵 자세) ----
function sleep(g: Grid, d: Dim, breath: number): void {
    const rx = d.rx + 1, ry = d.ry - 0.5 + breath * 0.5
    const by = GY - ry + 0.5
    g.bodyO = [AX, Math.round(by)]
    g.at('body').ellipse(AX, by, rx, ry, 'b')
    g.retag(AX - rx, by + ry * 0.4, AX + rx, GY, 'body', 'under')
    const hx = Math.round(AX + rx - 3), hy = GY - d.head * 0.92
    g.rect(AX - rx + 4, GY - 1, hx - 3, GY, 'b', 'tail') // 몸을 감싼 꼬리
    g.rect(hx - 6, GY - 1, hx - 3, GY, 'b', 'tailtip')
    face(g, hx, hy, d, true)
    g.rect(hx - 5, GY - 1, hx - 3, GY, 'b', 'paw').rect(hx + 3, GY - 1, hx + 5, GY, 'b', 'paw') // 모아 쥔 앞발
}

// ---- 조립 ----
function build(stage: StageId, coat: CoatId, pose: Pose, frame: number): string[] {
    const g = new Grid()
    g.look = COATS[coat]
    const base = DIMS[stage]
    const d: Dim = g.look.big ? {...base, rx: base.rx + 1.5, ry: base.ry + 0.5, tail: base.tail + 1, tw: base.tw + 0.3} : base // 메인쿤은 덩치가 크다
    const k = d.rx / 12
    const s = (n: number): number => Math.max(1, Math.round(n * k))
    switch (pose) {
        case 'sit':
            sit(g, d, frame, 0)
            break
        case 'groom':
            sit(g, d, 0, frame ? 2 : 0)
            break
        case 'sleep':
            sleep(g, d, frame)
            break
        case 'walk':
            stand(g, d, {feet: gait(frame, s(3), s(2), [0, 0.5, 0.5, 0]), bob: frame % 2 ? 0 : 1, headDy: 0, tail: 'up', sway: [0, 1, 0, -1][frame]})
            break
        case 'run':
            stand(g, d, {feet: gait(frame, s(7), s(4), [0, 0.1, 0.5, 0.6]), bob: [1, 0, -1, 0][frame] * s(2), headDy: 1, tail: 'back', sway: [0, 1, 0, -1][frame]})
            break
        case 'leap':
            stand(g, d, {feet: [[s(6), s(3)], [s(4), s(2)], [-s(6), s(3)], [-s(4), s(2)]], bob: -1, headDy: -1, tail: 'back', sway: 1})
            break
    }
    return g.finish(COATS[coat], d)
}

const cache = new Map<string, string[]>()

// 그림 한 장: GRID_H줄 x GRID_W글자. '.'은 투명, 나머지는 paletteOf의 글자.
export function frameOf(stage: StageId, coat: CoatId, pose: Pose, frame: number): string[] {
    const key = `${stage}|${coat}|${pose}|${frame % FRAMES[pose]}`
    let rows = cache.get(key)
    if (!rows) {
        rows = build(stage, coat, pose, frame % FRAMES[pose])
        cache.set(key, rows)
    }
    return rows
}
