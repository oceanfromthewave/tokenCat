// 고양이가 작업표시줄 위에서 무엇을 할지 정하는 순수 규칙. 화면(DOM)을 모르고 시간(초)과 난수만 받는다.
// happy는 클릭했을 때만 한다 (웃으면서 하트)
export type Action = 'sit' | 'walk' | 'run' | 'sleep' | 'groom' | 'leap' | 'happy'

export interface Behavior {
    action: Action
    dir: 1 | -1 // 1 = 오른쪽
    x: number // 왼쪽 끝에서의 위치(px)
    t: number // 지금 행동을 시작하고 흐른 시간(초)
    until: number // 이 시간(초)이 지나면 다음 행동을 고른다
}

export interface Bounds {
    min: number
    max: number
}

// 기본 속도(px/초). 단계별 pace를 곱해서 쓴다.
export const SPEED = {walk: 45, run: 170, leap: 120} as const
export const LEAP_SECONDS = 0.8

export interface Mood {
    excited: boolean // 방금 경험치를 얻었다 -> 신나서 뛰어다닌다
    sleepy: boolean // 오래 아무 일도 없었다 -> 졸린다
    pace: number
}

type Rand = () => number

// 행동별 지속 시간 범위(초)
const DURATION: Record<Action, [number, number]> = {
    sit: [3, 8], walk: [3, 9], run: [1.5, 4], groom: [3, 5], sleep: [12, 40], leap: [LEAP_SECONDS, LEAP_SECONDS], happy: [2.5, 2.5]
}

const between = ([a, b]: [number, number], rand: Rand): number => a + (b - a) * rand()

// 다음 행동의 가중치. 같은 행동을 연달아 하지 않는다(걷기 제외).
function weights(from: Action, mood: Mood): Record<Action, number> {
    const w: Record<Action, number> = mood.excited
        ? {sit: 5, walk: 25, run: 45, groom: 0, sleep: 0, leap: 25, happy: 0}
        : mood.sleepy
            ? {sit: 25, walk: 15, run: 0, groom: 10, sleep: 45, leap: 0, happy: 0}
            : {sit: 20, walk: 40, run: 12, groom: 12, sleep: 8, leap: 8, happy: 0}
    if (from === 'sleep') return {sit: 70, walk: 30, run: 0, groom: 0, sleep: 0, leap: 0, happy: 0} // 자고 일어나면 기지개 대신 일단 앉는다
    if (from !== 'walk') w[from] = 0
    return w
}

export function pickNext(from: Action, mood: Mood, rand: Rand): Action {
    const w = weights(from, mood)
    const actions = Object.keys(w) as Action[]
    let r = rand() * actions.reduce((sum, a) => sum + w[a], 0)
    for (const a of actions) {
        r -= w[a]
        if (r < 0 && w[a] > 0) return a
    }
    return 'sit'
}

export function start(x: number, rand: Rand): Behavior {
    return {action: 'sit', dir: rand() < 0.5 ? 1 : -1, x, t: 0, until: between(DURATION.sit, rand)}
}

const moves = (a: Action): a is keyof typeof SPEED => a === 'walk' || a === 'run' || a === 'leap'

// dt초만큼 시간을 보낸다. 원본은 바꾸지 않는다.
export function step(b: Behavior, dt: number, bounds: Bounds, rand: Rand, mood: Mood): Behavior {
    let {action, dir, x, t, until} = b
    t += dt
    if (moves(action)) x += dir * SPEED[action] * mood.pace * dt
    // 끝에 닿으면 돌아선다
    if (x <= bounds.min) {
        x = bounds.min
        dir = 1
    } else if (x >= bounds.max) {
        x = bounds.max
        dir = -1
    }
    if (t >= until) {
        action = pickNext(action, mood, rand)
        if (moves(action) && rand() < 0.3) dir = dir === 1 ? -1 : 1 // 가끔 방향을 바꿔 걷는다
        t = 0
        until = between(DURATION[action], rand)
    }
    return {action, dir, x, t, until}
}

// 행동을 강제로 바꾼다 (클릭해서 뛰게 하거나, 마우스를 올리면 앉히거나)
export function force(b: Behavior, action: Action, rand: Rand): Behavior {
    return {...b, action, t: 0, until: between(DURATION[action], rand)}
}
