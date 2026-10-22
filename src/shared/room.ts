// 고양이 방: 기본 가구는 레벨이 오를 때마다, 특별 가구는 다 키운 고양이 수에 따라 생기고, 방 안의 고양이가 가구를 골라 쓴다.
// 화면(DOM)을 모르는 순수 규칙이다. 단위는 방 도트 칸, 시간은 초.
import type {Pose} from './sprites.ts'

export const ROOM_W = 320
export const ROOM_H = 100
export const FLOOR = 86 // 바닥 줄 (고양이 발바닥이 닿는 높이)

export type FurnId = 'bowl' | 'bed' | 'window' | 'scratcher' | 'yarn' | 'plant' | 'tower' | 'rug' | 'wheel' | 'fishbowl' | 'house' | 'frame'

export interface Furniture {
    id: FurnId
    name: string
    unlock: { levels: number } | { cats: number } // 지금까지 오른 레벨 수, 또는 다 키운 고양이 수가 이만큼 되면 생긴다
    x: number // 가구 가운데 x
}

// 생기는 순서대로. 위치는 서로 겹치지 않게 나눠 두었다.
export const FURNITURE: Furniture[] = [
    // 기본 가구: 첫 고양이를 키우는 동안(레벨업 11번) 하나씩 생긴다
    {id: 'bowl', name: '밥그릇', unlock: {levels: 0}, x: 18},
    {id: 'bed', name: '방석', unlock: {levels: 1}, x: 52},
    {id: 'window', name: '창문', unlock: {levels: 2}, x: 92},
    {id: 'scratcher', name: '스크래쳐', unlock: {levels: 3}, x: 96},
    {id: 'yarn', name: '털실', unlock: {levels: 5}, x: 124},
    {id: 'plant', name: '화분', unlock: {levels: 7}, x: 140},
    {id: 'tower', name: '캣타워', unlock: {levels: 9}, x: 168},
    // 특별 가구: 고양이를 다 키운 수만큼
    {id: 'rug', name: '러그', unlock: {cats: 1}, x: 60},
    {id: 'wheel', name: '캣휠', unlock: {cats: 2}, x: 286},
    {id: 'fishbowl', name: '어항', unlock: {cats: 3}, x: 206},
    {id: 'house', name: '숨숨집', unlock: {cats: 4}, x: 236},
    {id: 'frame', name: '고양이 액자', unlock: {cats: 5}, x: 236}
]

export const TOWER_SHELVES = [30, 54] // 캣타워 선반 높이 (바닥에서 위로)
export const WHEEL_R = 30 // 캣휠 반지름

// 방 진행도: 지금까지 오른 레벨 수와 다 키운 고양이 수
export interface Progress {
    levels: number
    cats: number
}

const isOpen = (f: Furniture, p: Progress): boolean => ('levels' in f.unlock ? p.levels >= f.unlock.levels : p.cats >= f.unlock.cats)
export const unlockedAt = (p: Progress): Furniture[] => FURNITURE.filter((f) => isOpen(f, p))

// 벽지: 고양이를 많이 키울수록 바뀐다 (마지막으로 열린 것을 쓴다)
export const WALLPAPERS = [
    {id: 'cream', name: '크림 벽지', cats: 0},
    {id: 'mint', name: '민트 벽지', cats: 6},
    {id: 'lavender', name: '라벤더 벽지', cats: 8},
    {id: 'night', name: '밤하늘 벽지', cats: 10}
] as const
export type WallpaperId = (typeof WALLPAPERS)[number]['id']
export const wallpaperAt = (cats: number): (typeof WALLPAPERS)[number] => WALLPAPERS.findLast((w) => cats >= w.cats) ?? WALLPAPERS[0]

// 방 고양이가 할 일 한 단계
export type Step =
    | { kind: 'walk'; x: number } // 바닥에서 x까지 걷기
    | { kind: 'jump'; x: number; y: number } // (x, 높이 y)로 뛰기
    | { kind: 'pose'; pose: Pose; secs: number; dir?: 1 | -1; spin?: boolean } // 제자리에서 동작 (spin = 캣휠이 돈다)

export interface RoomCat {
    x: number
    y: number // 바닥에서 위로 높이
    dir: 1 | -1
    pose: Pose
    t: number // 지금 단계를 시작하고 흐른 시간
    steps: Step[] // 남은 할 일
    from: { x: number; y: number } // 뛰기를 시작한 자리
    spin: boolean // 캣휠이 도는 중
}

export const WALK_SPEED = 26 // 칸/초
export const JUMP_SECS = 0.6
const JUMP_HEIGHT = 14 // 뛸 때 포물선 높이

type Rand = () => number
const pick = <T>(list: T[], rand: Rand): T => list[Math.min(Math.floor(Math.max(rand(), 0) * list.length), list.length - 1)]

// 가구 하나를 쓰는 계획. 가구가 없으면 돌아다니다 앉거나 그루밍한다.
export function plan(f: Furniture | null, rand: Rand): Step[] {
    const secs = (a: number, b: number): number => a + (b - a) * rand()
    if (!f) {
        return [{kind: 'walk', x: 20 + rand() * (ROOM_W - 40)}, {kind: 'pose', pose: rand() < 0.5 ? 'sit' : 'groom', secs: secs(3, 6)}]
    }
    switch (f.id) {
        case 'bowl': // 밥그릇 오른쪽에서 왼쪽을 보고 먹는다
            return [{kind: 'walk', x: f.x + 16}, {kind: 'pose', pose: 'eat', secs: secs(4, 7), dir: -1}]
        case 'bed':
            return [{kind: 'walk', x: f.x}, {kind: 'jump', x: f.x, y: 3}, {kind: 'pose', pose: 'sleep', secs: secs(10, 20)}, {kind: 'jump', x: f.x + 14, y: 0}]
        case 'scratcher': // 기둥 왼쪽에서 일어서서 긁는다
            return [{kind: 'walk', x: f.x - 13}, {kind: 'pose', pose: 'stretch', secs: secs(3, 5), dir: 1}]
        case 'yarn':
            return [{kind: 'walk', x: f.x - 14}, {kind: 'pose', pose: 'happy', secs: 2.5, dir: 1}, {kind: 'jump', x: f.x - 10, y: 0}, {kind: 'pose', pose: 'happy', secs: 2.5, dir: 1}]
        case 'tower': { // 아래 선반, 가끔은 꼭대기까지 올라가 앉거나 잔다
            const top = rand() < 0.5
            const steps: Step[] = [{kind: 'walk', x: f.x - 4}, {kind: 'jump', x: f.x - 4, y: TOWER_SHELVES[0]}]
            if (top) steps.push({kind: 'jump', x: f.x + 2, y: TOWER_SHELVES[1]}, {kind: 'pose', pose: rand() < 0.5 ? 'sleep' : 'sit', secs: secs(6, 12)})
            else steps.push({kind: 'pose', pose: 'sit', secs: secs(4, 8)})
            return [...steps, {kind: 'jump', x: f.x - 22, y: 0}]
        }
        case 'wheel': // 바퀴 안으로 뛰어들어 달리면 바퀴가 돈다
            return [{kind: 'walk', x: f.x - WHEEL_R - 8}, {kind: 'jump', x: f.x, y: 3}, {kind: 'pose', pose: 'run', secs: secs(5, 9), dir: 1, spin: true}, {kind: 'jump', x: f.x - WHEEL_R - 10, y: 0}]
        case 'fishbowl': // 어항 앞에 앉아 물고기를 구경한다
            return [{kind: 'walk', x: f.x - 16}, {kind: 'pose', pose: 'sit', secs: secs(4, 8), dir: 1}, {kind: 'pose', pose: 'happy', secs: 2}]
        case 'house': // 숨숨집 입구 앞에서 몸을 말고 잔다
            return [{kind: 'walk', x: f.x - 2}, {kind: 'pose', pose: 'sleep', secs: secs(10, 18), dir: -1}]
        default: // 창문, 화분, 러그, 액자는 보기만 하는 가구
            return plan(null, rand)
    }
}

// 쓸 수 있는 가구 중 하나를 고른다. 가끔은 그냥 돌아다닌다.
export function chooseFurniture(list: Furniture[], rand: Rand): Furniture | null {
    const usable = list.filter((f) => !['window', 'plant', 'rug', 'frame'].includes(f.id))
    if (!usable.length || rand() < 0.25) return null
    return pick(usable, rand)
}

export function startCat(): RoomCat {
    return {x: 120, y: 0, dir: 1, pose: 'sit', t: 0, steps: [{kind: 'pose', pose: 'sit', secs: 1.5}], from: {x: 120, y: 0}, spin: false}
}

// dt초만큼 시간을 보낸다. 할 일이 끝나면 다음 가구를 골라 새 계획을 세운다.
export function roomStep(c: RoomCat, dt: number, list: Furniture[], rand: Rand): RoomCat {
    let {x, y, dir, pose, t, steps, from, spin} = c
    if (!steps.length) {
        steps = plan(chooseFurniture(list, rand), rand)
        t = 0
        from = {x, y}
    }
    const s = steps[0]
    t += dt
    let done = false
    if (s.kind === 'walk') {
        spin = false
        const left = s.x - x
        dir = left >= 0 ? 1 : -1
        pose = 'walk'
        const move = WALK_SPEED * dt
        if (Math.abs(left) <= move) {
            x = s.x
            done = true
        } else x += dir * move
    } else if (s.kind === 'jump') {
        spin = false
        pose = 'leap'
        if (s.x !== from.x) dir = s.x > from.x ? 1 : -1
        const p = Math.min(t / JUMP_SECS, 1)
        x = from.x + (s.x - from.x) * p
        y = from.y + (s.y - from.y) * p + Math.sin(Math.PI * p) * JUMP_HEIGHT
        if (p >= 1) {
            y = s.y
            done = true
        }
    } else {
        pose = s.pose
        if (s.dir) dir = s.dir
        spin = !!s.spin
        if (t >= s.secs) done = true
    }
    if (done) {
        steps = steps.slice(1)
        t = 0
        from = {x, y}
    }
    return {x, y, dir, pose, t, steps, from, spin}
}

// 새로 생긴 가구 이름 (알림용)
export const newlyUnlocked = (before: Progress, after: Progress): string[] =>
    FURNITURE.filter((f) => !isOpen(f, before) && isOpen(f, after)).map((f) => f.name)
