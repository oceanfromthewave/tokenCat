// 고양이 도트 그림. 손으로 찍은 그림 대신 몸 부위(몸통, 머리, 다리, 꼬리)를 포즈마다 그려서 만든다.
// 모든 칸에는 "어느 부위인지" 이름표(part)가 붙고, 마지막에 털 무늬 규칙이 부위별로 색을 입힌다.
// 그래서 같은 걷기/뛰기 그림에 14가지 털 무늬와 4단계 몸 크기가 그대로 적용된다.
// 몸은 옆모습(오른쪽을 봄), 얼굴은 정면이다. 왼쪽을 볼 때는 화면에서 뒤집는다.
import type {CoatId, Gear, StageId} from './growth.ts'

// eat(밥 먹기), stretch(일어서서 스크래쳐 긁기)는 도감의 방에서만 쓴다
export type Pose = 'sit' | 'walk' | 'run' | 'sleep' | 'groom' | 'leap' | 'happy' | 'eat' | 'stretch'

export const GRID_W = 56
export const GRID_H = 44
const GY = GRID_H - 2 // 발바닥 줄 (아래 한 줄은 테두리용)
const AX = 27 // 몸의 가운데

// 포즈별 프레임 수
export const FRAMES: Record<Pose, number> = {sit: 2, walk: 4, run: 4, sleep: 2, groom: 2, leap: 1, happy: 2, eat: 2, stretch: 2}
// 포즈별 초당 프레임 (작업표시줄과 도감의 방이 같이 쓴다)
export const POSE_FPS: Record<Pose, number> = {sit: 1.5, walk: 7, run: 12, groom: 3, sleep: 0.7, leap: 1, happy: 4, eat: 3, stretch: 4}

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
    kitten: {rx: 10, ry: 5.2, head: 8, ear: 5, leg: 6, lw: 3, tail: 11, tw: 1.4},
    young: {rx: 12, ry: 6, head: 8, ear: 5, leg: 7, lw: 4, tail: 13, tw: 1.6},
    adult: {rx: 14, ry: 6.5, head: 8, ear: 5, leg: 8, lw: 4, tail: 15, tw: 1.7}
}

// ---- 털 무늬 ----
// 색 이름: b 기본, s 그늘(배/먼 쪽 다리), d 무늬(줄무늬, 포인트, 검은 얼룩), l 밝은색(흰 부분), a 얼룩 보조색
// 실제 고양이의 털 무늬 규칙대로 그린다: 태비는 등/꼬리/다리/이마에 줄, 턱시도는 가슴·배·주둥이·발이 흰색,
// 젖소/삼색이는 흰 바탕에 얼룩, 샴은 귀·얼굴·다리·꼬리가 짙은 포인트, 아비시니안은 잔털 점(틱).
type Key = 'b' | 's' | 'd' | 'l' | 'a'
type Part = 'body' | 'under' | 'chest' | 'tail' | 'tailtip' | 'leg' | 'farleg' | 'paw' | 'head' | 'ear' | 'muzzle' | 'forehead'
type Pattern = 'solid' | 'tabby' | 'cow' | 'calico' | 'ragdoll' | 'ticked'

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
    short?: boolean // 다리가 짧다 (먼치킨)
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
    munchkin: {colors: {b: '#e3b98a', s: '#c99d6c', d: '#e3b98a', l: '#fff8ee', a: '#e3b98a'}, eye: GREEN, pattern: 'solid', map: TUX_MAP, short: true}, // 크림색에 흰 가슴·양말
    maincoon: {colors: {b: '#a8794a', s: '#8c5f36', d: '#4f3119', l: '#e8d3ae', a: '#a8794a'}, eye: AMBER, pattern: 'tabby', map: TABBY_MAP, cheek: 0.4, fluffy: true, tufts: true, big: true},
    sphynx: {colors: {b: '#e8b8a6', s: '#cf9987', d: '#c18a79', l: '#f4d3c5', a: '#e8b8a6'}, eye: AMBER, pattern: 'solid', map: {under: 'l', forehead: 'd'}, ear: 2, thin: true}
}

const mix = (a: string, b: string, t: number): string =>
    '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('')

// 소품 색 (털 무늬와 상관없이 같다)
const GEAR_COLORS: Record<string, string> = {
    C: '#e0464e', c: '#a8323a', // 빨강
    G: '#f6c945', g: '#c99a2e', // 금색
    K: '#3f7fd8', // 파랑
    W: '#ffffff',
    P: '#ff8fbf', M: '#55d3b0', Y: '#ffd447', // 리본, 고깔모자
    T: '#ecc879', t: '#b88a43', // 밀짚
    V: '#7b5ad6', v: '#5b3fae' // 베레모
}

// 윤곽선은 검은색 하나 대신, 닿아 있는 털 색을 짙게 한 색으로 그린다. (대문자 B S D L A = b s d l a 옆의 윤곽선)
export const paletteOf = (coat: CoatId): Record<string, string> => ({
    ...COATS[coat].colors,
    h: mix(COATS[coat].colors.b, '#ffffff', 0.28), // 윗면 하이라이트
    B: mix(COATS[coat].colors.b, '#2a1f26', 0.62),
    S: mix(COATS[coat].colors.s, '#2a1f26', 0.62),
    D: mix(COATS[coat].colors.d, '#2a1f26', 0.55),
    L: mix(COATS[coat].colors.l, '#2a1f26', 0.5),
    A: mix(COATS[coat].colors.a, '#2a1f26', 0.62),
    ...GEAR_COLORS,
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
    tailAt: [number, number] | null = null // 꼬리 리본을 다는 자리

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

    ellipse(cx: number, cy: number, rx: number, ry: number, ch: string, part: Part = this.cur, n = 2): this {
        for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
            for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
                if (Math.abs((x - cx) / rx) ** n + Math.abs((y - cy) / ry) ** n <= 1) this.put(x, y, ch, part)
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
                        (part === 'body' && (((px + Math.floor(py / 3)) % 5) + 5) % 5 === 0 && py < d.ry * 0.3) ||
                        (part === 'tail' && (x + y) % 5 < 2) ||
                        (part === 'leg' && y % 4 === 0)
                    if (stripe) key = 'd'
                } else if (c.pattern === 'ticked' && key === 'b') {
                    if (hash(x, y, 5) > 0.8) key = 'd' // 털 한 올마다 색이 다른 잔무늬(틱)
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
        // 윗면 하이라이트: 위가 비어 있는 기본색 칸 한 줄
        const above = this.cells.map((r) => [...r])
        for (let y = 1; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) if (above[y][x] === 'b' && above[y - 1][x] === '.' && this.parts[y][x] !== 'paw') this.cells[y][x] = 'h'
        return this.cells.map((row, y) =>
            row.map((ch, x) => {
                if (ch !== '.') return ch
                // 옆에 있는 칸이 털이면 그 색의 윤곽선, 얼굴 부품이면 기본 윤곽선
                for (const [dx, dy] of [[0, 1], [-1, 0], [1, 0], [0, -1]]) {
                    const n = this.get(x + dx, y + dy)
                    if (n === '.') continue
                    return n === 'h' ? 'B' : 'bsdla'.includes(n) ? n.toUpperCase() : 'o'
                }
                return '.'
            }).join(''))
    }
}

// ---- 머리 (손으로 찍은 도트, 3/4 옆모습으로 오른쪽을 봄) ----
// 얼굴은 귀여움이 결정되는 곳이라 계산으로 그리지 않고 한 칸씩 직접 찍었다. 모든 단계가 같은 머리를 쓴다.
// (몸은 단계마다 커지므로 아기일수록 머리가 상대적으로 크다)
// 글자: a 귀, i 귀 안쪽(분홍), h 머리털, r 이마 무늬 자리, m 주둥이, n 코, o 입,
//       y 홍채, e 눈동자, w 눈빛, . 빈칸
const EARS: Record<'normal' | 'small' | 'big' | 'fold' | 'tufts', string[]> = {
    normal: [
        '..a..........a..',
        '.aaa........aaa.',
        '.aiaa......aaia.',
        'aaiiahhhhhhaiiaa'
    ],
    small: [ // 페르시안: 작고 낮은 귀
        '................',
        '................',
        '.aaa........aaa.',
        'aaiahhhhhhhhaiaa'
    ],
    big: [ // 스핑크스: 크고 넓은 귀
        '..a..........a..',
        '.aaa........aaa.',
        '.aiaa......aaia.',
        'aaiia......aiiaa',
        'aaiiaa....aaiiaa',
        'aaiiiahhhhaiiiaa'
    ],
    fold: [ // 스코티시 폴드: 앞으로 접혀 머리에 붙은 귀
        '................',
        '................',
        '..aaa......aaa..',
        '.aaaahhhhhhaaaa.'
    ],
    tufts: [ // 메인쿤: 귀 끝 털
        '..a..........a..',
        '..a..........a..',
        '.aaa........aaa.',
        '.aiaa......aaia.',
        'aaiiahhhhhhaiiaa'
    ]
}

const HEAD = [
    'hhhhhhrhhrhhhhhh',
    'hhhhyyhrhhhyyhhh',
    'hhhyweyhhhweyhhh',
    'hhhyeeyhhheeyhhh',
    'hhhyeeyhhheeymmm',
    'hhhhyyhhhhyymmnn',
    'hhhhhhhhhhmmmmom',
    'hhhhhhhhhmmmoom.',
    '.hhhhhhhhmmmmm..',
    '..hhhhhhhhhmm...'
]

// 감은 눈: 웃는 모양(^)
const CLOSED = [
    'hhhhhhrhhrhhhhhh',
    'hhhhhhhrhhhhhhhh',
    'hhhhhhhhhhhhhhhh',
    'hhhhoohhhhoohhhh',
    'hhhohhohhhhhohmm',
    'hhhhhhhhhhhhmmnn',
    'hhhhhhhhhhmmmmom',
    'hhhhhhhhhmmmoom.',
    '.hhhhhhhhmmmmm..',
    '..hhhhhhhhhmm...'
]

// 웃는 얼굴: 웃는 눈에 볼터치
const HAPPY = CLOSED.map((row, i) => (i === 5 ? 'hqqhhhhhhqqhmmnn' : row))

const HEAD_PARTS: Record<string, [string, Part]> = {
    q: ['q', 'head'],
    a: ['b', 'ear'], i: ['p', 'ear'], h: ['b', 'head'], r: ['b', 'forehead'], m: ['b', 'muzzle'], n: ['p', 'head'],
    o: ['o', 'head'], y: ['y', 'head'], e: ['e', 'head'], w: ['w', 'head']
}

// 머리 도장을 (hx, hy)가 머리 가운데가 되게 찍는다
function face(g: Grid, hx: number, hy: number, _d: Dim, expr: 'open' | 'closed' | 'happy'): void {
    hx = Math.round(hx)
    hy = Math.round(hy)
    g.headO = [hx, hy]
    const look = g.look
    const ears = EARS[look.fold ? 'fold' : look.tufts ? 'tufts' : (look.ear ?? 0) > 0 ? 'big' : (look.ear ?? 0) < 0 ? 'small' : 'normal']
    const rows = [...ears, ...(expr === 'happy' ? HAPPY : expr === 'closed' ? CLOSED : HEAD)]
    const x0 = hx - 8, y0 = hy - 7 - (ears.length - 4)
    rows.forEach((row, dy) => [...row].forEach((ch, dx) => {
        const hit = HEAD_PARTS[ch]
        if (hit) g.put(x0 + dx, y0 + dy, hit[0], hit[1])
    }))
}

// ---- 서 있는 포즈 (걷기, 달리기, 뛰기) ----
interface Move {
    feet: [number, number][] // [가까운 앞다리, 먼 앞다리, 가까운 뒷다리, 먼 뒷다리]의 [앞뒤 이동, 들어올림]
    bob: number // 몸 위아래
    headDy: number
    tail: 'up' | 'back'
    sway: number // 꼬리 흔들림
    eat?: number // 있으면 고개를 바닥까지 숙여 밥을 먹는다 (값 = 고개 까딱임)
}

// 발 위치 [앞뒤, 들어올림] (가까운 앞다리, 먼 앞다리, 가까운 뒷다리, 먼 뒷다리). 12칸 몸 기준이라 단계 크기에 맞게 늘린다.
type Feet = [number, number][]
// 걷기: 대각선 두 다리(가까운 앞+먼 뒤 / 먼 앞+가까운 뒤)가 짝지어 번갈아 내딛는다. 보폭을 작게 해서 다리가 거의 곧게 선다.
const WALK: Feet[] = [
    [[1.5, 0], [-1.5, 0], [-1.5, 0], [1.5, 0]],
    [[0, 0], [0, 1.5], [0, 1.5], [0, 0]],
    [[-1.5, 0], [1.5, 0], [1.5, 0], [-1.5, 0]],
    [[0, 1.5], [0, 0], [0, 0], [0, 1.5]]
]
// 달리기: 앞다리 둘, 뒷다리 둘이 함께 쭉 뻗었다가(0) 몸 아래로 모은다(2).
const RUN: Feet[] = [
    [[4, 1], [3, 0], [-4, 1], [-3, 0]],
    [[1, 2], [0, 2], [-1, 2], [0, 2]],
    [[-2, 0], [-3, 0], [2, 0], [3, 0]],
    [[2, 1], [1, 1], [-2, 1], [-1, 1]]
]
// 다리가 짧은 고양이(아기, 먼치킨)의 달리기: 다리를 크게 벌리지 않고 통통 튀듯 달린다. 몸이 위아래로 움직인다.
const SHORT_RUN: Feet[] = [
    [[1, 1], [1, 0], [-1, 1], [-1, 0]],
    [[0, 0], [0, 0], [0, 0], [0, 0]],
    [[-1, 0], [-1, 1], [1, 0], [1, 1]],
    [[0, 0], [0, 0], [0, 0], [0, 0]]
]

// 다리가 짧으면(아기, 먼치킨) 보폭과 들어올림을 다리 길이에 맞게 줄인다. 그대로 두면 짧은 다리가 옆으로 누워 뭉개진다.
const scaleFeet = (feet: Feet, k: number, leg: number): Feet => feet.map(([dx, lift]) => {
    const maxDx = Math.max(1, Math.floor(leg * 0.5)), maxLift = Math.max(1, Math.floor(leg * 0.35))
    return [Math.max(-maxDx, Math.min(maxDx, Math.round(dx * k))), Math.min(maxLift, Math.round(lift * k))]
})

function tailDraw(g: Grid, d: Dim, pts: [number, number][]): void {
    g.tailAt = pts[Math.floor(pts.length * 0.45)]
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
    g.at('body').ellipse(bx, by, d.rx, d.ry, 'b', 'body', 3.2) // 끝이 뭉툭한 몸통 (타원이면 양끝이 뾰족해 생선처럼 보인다)
    g.ellipse(bx - d.rx * 0.45, by + 1, d.rx * 0.4, d.ry * 0.95, 'b', 'body') // 엉덩이(허벅지) 살
    g.ellipse(bx + d.rx - 5, by - d.ry * 0.3, 5, d.ry * 0.8, 'b', 'body') // 목
    g.retag(bx - d.rx, by + d.ry * 0.4, bx + d.rx, by + d.ry, 'body', 'under') // 배
    g.retag(bx + d.rx * 0.55, by - d.ry * 0.3, bx + d.rx, by + d.ry * 0.4, 'body', 'chest') // 가슴

    leg(front, m.feet[0], true)
    leg(back, m.feet[2], true)

    if (m.eat !== undefined) face(g, bx + d.rx + 1, GY - 7 + m.eat, d, 'closed') // 앞으로 숙여 그릇에 입을 댄다
    else face(g, bx + d.rx - 2, by - d.ry * 0.6 - 2 + m.headDy, d, 'open')
}

// ---- 앉은 포즈 ----
// lick: 0 = 그냥 앉기, 1/2 = 앞발을 들어 얼굴을 닦는다(발 높이가 달라 문지르는 것처럼 보인다). happy: 웃는 얼굴.
function sit(g: Grid, d: Dim, o: { tail: number; lick?: number; happy?: boolean }): void {
    const s = d.rx / 12 // 12칸짜리 몸을 기준으로 잡은 좌표를 단계 크기에 맞게 늘린다
    const X = (dx: number): number => AX + dx * s
    const Y = (dy: number): number => GY - dy * s
    g.bodyO = [Math.round(X(0)), Math.round(Y(9))]
    // 꼬리: 바닥에 길게 놓고 끝을 살짝 들어 올린다
    const L = Math.max(5, Math.round(d.tail * 0.7))
    const pts: [number, number][] = []
    for (let i = 0; i < L; i++) {
        const curl = i >= L - 5 ? Math.round((i - (L - 6)) * (1 + o.tail * 0.7)) : 0
        pts.push([X(-8) - i, GY - d.tw - curl])
    }
    tailDraw(g, d, pts)
    g.at('body')
    g.ellipse(X(-3), Y(5), 7.5 * s, 5.5 * s, 'b') // 엉덩이
    g.ellipse(X(2), Y(8), 4.5 * s + 0.5, 8 * s, 'b') // 몸통
    g.retag(X(-11), Y(3.5), X(8), GY, 'body', 'under')
    const lx0 = Math.round(X(1.5)), lx1 = Math.round(X(5.5)), mid = Math.round(X(3.5))
    if (o.lick) {
        // 바닥에는 앞발 하나만
        g.rect(lx0, Y(6), mid, GY, 'b', 'leg')
        g.rect(lx0, GY - 1, mid, GY, 'b', 'paw')
    } else {
        // 앞다리 두 개 (가운데에 그늘 선)
        g.rect(lx0, Y(6), lx1, GY, 'b', 'leg')
        g.rect(mid, Y(4), mid, GY, 'b', 'farleg')
        g.rect(lx0, GY - 1, lx1, GY, 'b', 'paw')
    }
    g.ellipse(X(4.5), Y(9), 2 * s + 0.5, 4 * s, 'b', 'chest') // 가슴
    const hx = Math.round(X(4.5)), hy = Math.round(Y(15.5)) + (o.lick ? 1 : 0)
    face(g, hx, hy, d, o.lick ? 'closed' : o.happy ? 'happy' : 'open')
    if (o.lick) {
        // 들어 올린 앞발: 가슴에서 주둥이 앞까지 올라간다
        const px = hx + 3, py = hy + 2 + o.lick
        g.rect(px, py, px + d.lw - 1, Math.round(Y(7)), 'b', 'leg')
        g.rect(px - 1, py, px + d.lw - 1, py + 1, 'b', 'paw')
        g.put(px, py, 'p', 'paw') // 분홍 발바닥이 보이게
    }
}

// ---- 일어서서 스크래쳐 긁기 ----
// 뒷다리로 서고 앞발 둘을 앞쪽 위로 뻗는다. 프레임마다 두 앞발 높이가 엇갈려 긁는 것처럼 보인다.
function stretch(g: Grid, d: Dim, frame: number): void {
    const s = d.rx / 12
    const X = (dx: number): number => AX + dx * s
    const Y = (dy: number): number => GY - dy * s
    g.bodyO = [Math.round(X(0)), Math.round(Y(12))]
    // 꼬리는 바닥으로 늘어뜨린다
    const L = Math.max(5, Math.round(d.tail * 0.6))
    tailDraw(g, d, Array.from({length: L}, (_, i): [number, number] => [X(-6) - i, GY - d.tw - Math.max(0, i - L + 3)]))
    g.at('body')
    g.ellipse(X(-2.5), Y(4.5), 6 * s, 4.5 * s, 'b') // 엉덩이
    g.ellipse(X(1), Y(12), 4 * s + 0.5, 8.5 * s, 'b') // 세운 몸통
    g.retag(X(-9), Y(3), X(6), GY, 'body', 'under')
    g.rect(Math.round(X(-1)), Y(3), Math.round(X(2)), GY, 'b', 'leg') // 뒷발
    g.rect(Math.round(X(-1)), GY - 1, Math.round(X(2)), GY, 'b', 'paw')
    g.ellipse(X(3), Y(13), 2 * s + 0.5, 4.5 * s, 'b', 'chest')
    const hx = Math.round(X(3)), hy = Math.round(Y(21))
    face(g, hx, hy, d, 'open')
    // 앞발 두 개: 어깨에서 앞쪽 위(스크래쳐 기둥)로
    for (const [near, up] of [[false, frame ? 1 : 3], [true, frame ? 3 : 1]] as const) {
        const px = Math.round(X(10)), py = Math.round(Y(10 + up))
        g.line(X(3.5), Y(11), px, py, d.lw, near ? 'leg' : 'farleg')
        if (near) g.rect(px, py - 1, px + d.lw - 1, py, 'b', 'paw')
    }
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
    g.tailAt = [Math.round(AX - rx * 0.2), GY - 1]
    face(g, hx, hy, d, 'closed')
    g.rect(hx - 5, GY - 1, hx - 3, GY, 'b', 'paw').rect(hx + 3, GY - 1, hx + 5, GY, 'b', 'paw') // 모아 쥔 앞발
}

// ---- 소품 ----
// 도장의 '.'은 투명. 위치는 머리 가운데(headO) 또는 꼬리 자리(tailAt) 기준 [x, y] 어긋남.
// 머리 도장의 맨 윗줄(정수리)은 머리 가운데보다 3칸 위, 턱 끝은 6칸 아래다.
const GEAR_ART: Record<string, { at: 'head' | 'neck' | 'tail'; off: [number, number]; rows: string[] }> = {
    bell: {at: 'neck', off: [-6, 6], rows: ['CCCCCCCC', '....GG..', '....gg..']},
    bandana: {at: 'neck', off: [-6, 6], rows: ['KKKKKKKK', '.KWKKWK.', '..KKKK..', '...KK...']},
    bowtie: {at: 'neck', off: [-4, 6], rows: ['CC..CC', 'CCccCC', 'CC..CC']},
    ribbonPink: {at: 'tail', off: [-2, -1], rows: ['P...P', 'PPWPP', 'P...P']},
    ribbonMint: {at: 'tail', off: [-2, -1], rows: ['M...M', 'MMWMM', 'M...M']},
    ribbonYellow: {at: 'tail', off: [-2, -1], rows: ['Y...Y', 'YYWYY', 'Y...Y']},
    straw: {at: 'head', off: [-7, -7], rows: ['....TTTTTT....', '....TTTTTT....', '....CCCCCC....', 'TTTTTTTTTTTTTT', '.tttttttttttt.']},
    crown: {at: 'head', off: [-4, -7], rows: ['G..G..G', 'GGGGGGG', 'GCGGGCG', 'ggggggg']},
    party: {at: 'head', off: [-2, -11], rows: ['..W..', '..P..', '..P..', '.PYP.', '.YPY.', 'PYPYP', 'YPYPY', 'PYPYP']},
    beret: {at: 'head', off: [-6, -6], rows: ['......v.....', '...VVVVVV...', '.VVVVVVVVVV.', 'vvvvvvvvvvvv']},
    flower: {at: 'head', off: [-4, -5], rows: ['.P.', 'PYP', '.P.']}
}

function wear(g: Grid, gear: Gear, pose: Pose): void {
    for (const id of [gear.tail, gear.neck, gear.head]) {
        const art = id && GEAR_ART[id]
        if (!art || (art.at === 'neck' && pose === 'sleep')) continue // 자는 동안 목은 몸에 묻혀 안 보인다
        const base = art.at === 'tail' ? g.tailAt : g.headO
        if (!base) continue
        const x0 = Math.round(base[0]) + art.off[0], y0 = Math.round(base[1]) + art.off[1]
        art.rows.forEach((row, dy) => [...row].forEach((ch, dx) => {
            if (ch !== '.') g.put(x0 + dx, y0 + dy, ch, 'head')
        }))
    }
}

// ---- 조립 ----
function build(stage: StageId, coat: CoatId, pose: Pose, frame: number, gear: Gear): string[] {
    const g = new Grid()
    g.look = COATS[coat]
    const base = DIMS[stage]
    let d: Dim = g.look.big ? {...base, rx: base.rx + 1.5, ry: base.ry + 0.5, tail: base.tail + 1, tw: base.tw + 0.3} : base // 메인쿤은 덩치가 크다
    if (g.look.short) d = {...d, leg: Math.max(2, Math.round(d.leg * 0.45))} // 먼치킨은 다리가 짧다
    const k = d.rx / 12
    const s = (n: number): number => Math.max(1, Math.round(n * k))
    switch (pose) {
        case 'sit':
            sit(g, d, {tail: frame})
            break
        case 'happy':
            sit(g, d, {tail: frame * 2, happy: true})
            break
        case 'groom':
            sit(g, d, {tail: 0, lick: frame + 1})
            break
        case 'sleep':
            sleep(g, d, frame)
            break
        case 'walk':
            stand(g, d, {feet: scaleFeet(WALK[frame], k, d.leg), bob: frame % 2, headDy: frame % 2, tail: 'up', sway: [0, 1, 0, -1][frame]})
            break
        case 'run':
            stand(g, d, {feet: d.leg <= 4 ? SHORT_RUN[frame] : scaleFeet(RUN[frame], k, d.leg), bob: d.leg <= 4 ? [-1, 0, -1, 0][frame] : [0, -1, 0, -1][frame], headDy: 1, tail: 'back', sway: [0, 1, 0, -1][frame]})
            break
        case 'eat':
            stand(g, d, {feet: [[1, 0], [0, 0], [-1, 0], [0, 0]], bob: 0, headDy: 0, tail: 'up', sway: frame, eat: frame})
            break
        case 'stretch':
            stretch(g, d, frame)
            break
        case 'leap':
            stand(g, d, {feet: [[s(6), s(3)], [s(4), s(2)], [-s(6), s(3)], [-s(4), s(2)]], bob: -1, headDy: -1, tail: 'back', sway: 1})
            break
    }
    wear(g, gear, pose)
    return g.finish(COATS[coat], d)
}

const cache = new Map<string, string[]>()

// 그림 한 장: GRID_H줄 x GRID_W글자. '.'은 투명, 나머지는 paletteOf의 글자.
export function frameOf(stage: StageId, coat: CoatId, pose: Pose, frame: number, gear: Gear = {}): string[] {
    const key = `${stage}|${coat}|${pose}|${frame % FRAMES[pose]}|${gear.neck ?? ''}|${gear.tail ?? ''}|${gear.head ?? ''}`
    let rows = cache.get(key)
    if (!rows) {
        rows = build(stage, coat, pose, frame % FRAMES[pose], gear)
        cache.set(key, rows)
    }
    return rows
}
