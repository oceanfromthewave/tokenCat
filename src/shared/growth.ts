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
    {id: 'bengal', name: '벵갈', weight: 2},
    {id: 'maincoon', name: '메인쿤', weight: 2},
    {id: 'sphynx', name: '스핑크스', weight: 2}
] as const

export type CoatId = (typeof COATS)[number]['id']

export const isCoatId = (v: unknown): v is CoatId => COATS.some((c) => c.id === v)

export const coatName = (id: CoatId): string => COATS.find((c) => c.id === id)?.name ?? id

export interface CatState {
    level: number
    xp: number // 현재 레벨에서 쌓인 경험치 (소수로 쌓인다)
    coat: CoatId
}

export const INITIAL_CAT: CatState = {level: 1, xp: 0, coat: 'orange'}

// 새 고양이. rand는 테스트에서 값을 고정하려고 바꿀 수 있다.
export function newCat(rand: () => number = Math.random): CatState {
    const total = COATS.reduce((sum, c) => sum + c.weight, 0)
    let r = Math.min(Math.max(rand(), 0), 0.999999999) * total
    for (const c of COATS) {
        r -= c.weight
        if (r < 0) return {level: 1, xp: 0, coat: c.id}
    }
    return {level: 1, xp: 0, coat: COATS[COATS.length - 1].id}
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
