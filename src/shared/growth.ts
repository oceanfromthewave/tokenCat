// 성장 규칙은 이 파일에서만 관리한다. (UI에 계산식을 두지 않기)

// 성장 단계. 레벨이 minLevel 이상이면 해당 단계. minLevel 오름차순으로 유지할 것.
// pace: 걷는 속도 배율 (새끼 고양이가 제일 팔팔하다)
export const STAGES = [
    {id: 'baby', name: '아기 고양이', minLevel: 1, pace: 0.7},
    {id: 'kitten', name: '새끼 고양이', minLevel: 3, pace: 1.2},
    {id: 'young', name: '어린 고양이', minLevel: 6, pace: 1.1},
    {id: 'adult', name: '어른 고양이', minLevel: 10, pace: 1}
] as const

export type StageId = (typeof STAGES)[number]['id']

export function stageOf(level: number): (typeof STAGES)[number] {
    return STAGES.findLast((s) => level >= s.minLevel) ?? STAGES[0]
}

// 고양이 종류와 털 색. 처음 시작할 때 무작위로 정해지고 바뀌지 않는다. (그림은 sprites.ts에서 이 이름대로 그린다)
// weight: 새 고양이가 이 종일 확률의 가중치. 합이 100이라 값이 곧 백분율이다. (코리안 숏헤어 69, 품종묘 20, 희귀 품종 10 + 1)
export const COATS = [
    {id: 'orange', name: '코리안 숏헤어 (치즈)', weight: 12},
    {id: 'gray', name: '코리안 숏헤어 (고등어)', weight: 12},
    {id: 'tuxedo', name: '코리안 숏헤어 (턱시도)', weight: 10},
    {id: 'black', name: '코리안 숏헤어 (검정)', weight: 9},
    {id: 'white', name: '코리안 숏헤어 (흰색)', weight: 8},
    {id: 'orangewhite', name: '코리안 숏헤어 (치즈 턱시도)', weight: 8},
    {id: 'calico', name: '코리안 숏헤어 (삼색이)', weight: 5},
    {id: 'cow', name: '코리안 숏헤어 (젖소)', weight: 5},
    {id: 'blue', name: '러시안 블루', weight: 4},
    {id: 'british', name: '브리티시 숏헤어', weight: 4},
    {id: 'abyssinian', name: '아비시니안', weight: 4},
    {id: 'fold', name: '스코티시 폴드', weight: 4},
    {id: 'persian', name: '페르시안', weight: 4},
    {id: 'siamese', name: '샴', weight: 2},
    {id: 'ragdoll', name: '랙돌', weight: 2},
    {id: 'munchkin', name: '먼치킨', weight: 2},
    {id: 'maincoon', name: '메인쿤', weight: 2},
    {id: 'sphynx', name: '스핑크스', weight: 2}
] as const

export type CoatId = (typeof COATS)[number]['id']

export const isCoatId = (v: unknown): v is CoatId => COATS.some((c) => c.id === v)

export const coatName = (id: CoatId): string => COATS.find((c) => c.id === id)?.name ?? id

// 소품. 정해진 레벨이 되면 칸마다 하나씩 무작위로 얻고, 다 클 때까지 계속 하고 다닌다.
export const GEAR = {
    neck: [
        {id: 'bell', name: '방울 목걸이'},
        {id: 'bandana', name: '반다나'},
        {id: 'bowtie', name: '나비넥타이'}
    ],
    tail: [
        {id: 'ribbonPink', name: '분홍 리본'},
        {id: 'ribbonMint', name: '민트 리본'},
        {id: 'ribbonYellow', name: '노랑 리본'}
    ],
    head: [
        {id: 'straw', name: '밀짚모자'},
        {id: 'crown', name: '왕관'},
        {id: 'party', name: '고깔모자'},
        {id: 'beret', name: '베레모'},
        {id: 'flower', name: '꽃 핀'}
    ]
} as const

export type Slot = keyof typeof GEAR
export type GearId<S extends Slot = Slot> = (typeof GEAR)[S][number]['id']
export type Gear = { [S in Slot]?: GearId<S> }

// 이 레벨이 되면 그 칸의 소품을 얻는다
export const GEAR_LEVEL: Record<Slot, number> = {neck: 3, tail: 6, head: 9}
export const SLOTS = Object.keys(GEAR_LEVEL) as Slot[]

export const isGearId = <S extends Slot>(slot: S, v: unknown): v is GearId<S> => GEAR[slot].some((g) => g.id === v)
export const gearName = (slot: Slot, id: string): string => GEAR[slot].find((g) => g.id === id)?.name ?? id

export interface CatState {
    level: number
    xp: number // 현재 레벨에서 쌓인 경험치 (소수로 쌓인다)
    coat: CoatId
    gear: Gear
}

export const INITIAL_CAT: CatState = {level: 1, xp: 0, coat: 'orange', gear: {}}

// 새 고양이. rand는 테스트에서 값을 고정하려고 바꿀 수 있다.
export function newCat(rand: () => number = Math.random): CatState {
    const total = COATS.reduce((sum, c) => sum + c.weight, 0)
    let r = Math.min(Math.max(rand(), 0), 0.999999999) * total
    for (const c of COATS) {
        r -= c.weight
        if (r < 0) return {level: 1, xp: 0, coat: c.id, gear: {}}
    }
    return {level: 1, xp: 0, coat: COATS[COATS.length - 1].id, gear: {}}
}

// 레벨이 된 칸 중 아직 비어 있는 칸에 소품을 하나씩 준다. 이미 있는 소품은 바꾸지 않는다.
export function grantGear(cat: CatState, rand: () => number = Math.random): CatState {
    let gear = cat.gear
    for (const slot of SLOTS) {
        if (cat.level < GEAR_LEVEL[slot] || gear[slot]) continue
        const list = GEAR[slot]
        gear = {...gear, [slot]: list[Math.min(Math.floor(Math.max(rand(), 0) * list.length), list.length - 1)].id}
    }
    return gear === cat.gear ? cat : {...cat, gear}
}

// 다 키운 고양이 (도감에 보관)
export interface Completed {
    coat: CoatId
    gear: Gear
    completedAt: string // ISO 시각
}

// 이 레벨이 되면 다 큰 것으로 보고 도감에 올린 뒤 새 고양이를 시작한다.
export const HARVEST_LEVEL = 12

// ponytail: 다 크는 순간 넘친 경험치는 버린다. 한 번에 수천 xp가 들어오는 일은 드물어서 이월은 생략.
export function harvestIfReady(cat: CatState, collection: Completed[], now: string, rand: () => number = Math.random): { cat: CatState; collection: Completed[] } {
    if (cat.level < HARVEST_LEVEL) return {cat, collection}
    return {cat: newCat(rand), collection: [...collection, {coat: cat.coat, gear: cat.gear, completedAt: now}]}
}

// 화면 표시용. 소수 첫째 자리까지 버림. (경험치는 소수로 쌓이므로 정수만 보이면 오르는 게 안 보인다)
export const formatXp = (xp: number): string => (Math.floor(xp * 10) / 10).toFixed(1)

// 다음 레벨까지 필요한 경험치. 레벨 1은 100, 레벨 2는 150, ...
export function xpToNextLevel(level: number): number {
    return 50 + level * 50
}

// 경험치를 더하고, 기준을 넘으면 레벨업한다. 원본 state는 바꾸지 않는다.
export function addXp(state: CatState, amount: number): CatState {
    if (!(amount > 0)) return state // 0 이하, NaN은 무시

    let {level, xp} = state
    xp += amount
    while (xp >= xpToNextLevel(level)) {
        xp -= xpToNextLevel(level)
        level += 1
    }
    return {...state, level, xp}
}
