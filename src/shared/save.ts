import {HARVEST_LEVEL, INITIAL_CAT, SLOTS, addXp, cleanName, isCoatId, isGearId, type CatState, type Completed, type Gear} from './growth.ts'

// 사용자 설정. 저장 파일에서 읽을 때도, 화면(IPC)에서 바꿀 때도 항상 mergeSettings로 검증한다.
export interface Settings {
    claude: boolean // Claude Code 로그 수집
    codex: boolean // Codex 로그 수집
    updateCheck: boolean // 새 버전이 있는지 GitHub에 물어보기
    sound: boolean // 쓰다듬으면 야옹 소리
    hideFullscreen: boolean // 전체화면 앱(영상, 게임)이 켜지면 고양이 숨기기
    displayId: number | null // 고양이가 걸어 다닐 모니터 (null = 주 모니터)
}

export const DEFAULT_SETTINGS: Settings = {claude: true, codex: true, updateCheck: true, sound: true, hideFullscreen: true, displayId: null}

export function mergeSettings(current: Settings, patch: unknown): Settings {
    const p = (typeof patch === 'object' && patch !== null ? patch : {}) as Record<string, unknown>
    const own = (k: string): unknown => (Object.hasOwn(p, k) ? p[k] : undefined)
    return {
        claude: typeof own('claude') === 'boolean' ? (own('claude') as boolean) : current.claude,
        codex: typeof own('codex') === 'boolean' ? (own('codex') as boolean) : current.codex,
        updateCheck: typeof own('updateCheck') === 'boolean' ? (own('updateCheck') as boolean) : current.updateCheck,
        sound: typeof own('sound') === 'boolean' ? (own('sound') as boolean) : current.sound,
        hideFullscreen: typeof own('hideFullscreen') === 'boolean' ? (own('hideFullscreen') as boolean) : current.hideFullscreen,
        displayId: own('displayId') === null || (Number.isSafeInteger(own('displayId')) && (own('displayId') as number) >= 0) ? (own('displayId') as number | null) : current.displayId
    }
}

// 기록: 쓰다듬은 횟수와 날짜별로 얻은 경험치 (실제 사용량만, 테스트 경험치는 빼고)
export interface Stats {
    pets: number
    daily: Record<string, number> // 'YYYY-MM-DD' -> 경험치
}

export const EMPTY_STATS: Stats = {pets: 0, daily: {}}
export const DAILY_KEEP = 60 // 날짜별 기록은 최근 60일만 남긴다

// 오늘(로컬 시간) 날짜 키
export const dateKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// 경험치를 오늘 기록에 더하고 오래된 날짜는 지운다
export function recordXp(stats: Stats, xp: number, today: string): Stats {
    if (!(xp > 0)) return stats
    const daily = {...stats.daily, [today]: (stats.daily[today] ?? 0) + xp}
    const keys = Object.keys(daily).sort()
    for (const k of keys.slice(0, Math.max(0, keys.length - DAILY_KEEP))) delete daily[k]
    return {...stats, daily}
}

// 디스크에 저장하는 데이터 형식. 파일은 외부에서 바뀌거나 깨질 수 있으니 읽을 때 반드시 검증한다.
export interface SaveData {
    cat: CatState
    collection: Completed[] // 다 키워서 도감에 올린 고양이
    levelUps: number // 지금까지 오른 레벨 수 (고양이가 바뀌어도 계속 쌓인다. 방 가구가 여기에 따라 생긴다)
    stats: Stats
    processed: string[] // 이미 경험치로 반영한 사용 기록 키 (중복 보상 방지)
    settings: Settings
    logOffsets: Record<string, number> | null // 로그 파일별 읽은 위치. null = 아직 기준선 없음(첫 실행)
}

export const EMPTY_SAVE: SaveData = {cat: INITIAL_CAT, collection: [], levelUps: 0, stats: EMPTY_STATS, processed: [], settings: DEFAULT_SETTINGS, logOffsets: null}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

// 소품은 칸마다 알려진 id만 받는다
function parseGear(v: unknown): Gear {
    const gear: Record<string, string> = {}
    if (v && typeof v === 'object') for (const slot of SLOTS) {
        const id = (v as Record<string, unknown>)[slot]
        if (isGearId(slot, id)) gear[slot] = id
    }
    return gear as Gear
}

// 없어진 품종은 새 품종으로 옮긴다 (예전 저장 파일의 벵갈 -> 먼치킨). 도감 기록이 사라지지 않게.
const RENAMED: Record<string, string> = {bengal: 'munchkin'}
const renamed = (v: unknown): unknown => (typeof v === 'string' && Object.hasOwn(RENAMED, v) ? RENAMED[v] : v)

// 저장 파일 내용을 SaveData로 바꾼다. 형식이 이상하면 새로 시작(EMPTY_SAVE)한다.
export function parseSave(text: string): SaveData {
    try {
        const raw = JSON.parse(text)
        const {level, xp} = raw.cat
        // 상한은 addXp 반복 횟수가 터무니없이 커지는 것을 막기 위한 안전장치
        if (!Number.isInteger(level) || level < 1 || level > 9999) return EMPTY_SAVE
        if (!isNum(xp) || xp < 0 || xp > 1e9) return EMPTY_SAVE
        const catCoat = renamed(raw.cat.coat)
        const coat = isCoatId(catCoat) ? catCoat : INITIAL_CAT.coat

        const processed: string[] = Array.isArray(raw.processed)
            ? raw.processed.filter((k: unknown): k is string => typeof k === 'string' && k.length <= 300).slice(0, 1_000_000)
            : []
        let logOffsets: Record<string, number> | null = null
        if (raw.logOffsets && typeof raw.logOffsets === 'object' && !Array.isArray(raw.logOffsets)) {
            logOffsets = {}
            for (const [k, v] of Object.entries(raw.logOffsets).slice(0, 100_000)) {
                if (k.length <= 500 && isNum(v) && v >= 0) logOffsets[k] = v
            }
        }
        const collection: Completed[] = Array.isArray(raw.collection)
            ? raw.collection
                .map((c: unknown) => (c && typeof c === 'object' ? {...c, coat: renamed((c as Completed).coat)} : c))
                .filter((c: unknown): c is Completed => !!c && typeof c === 'object' && isCoatId((c as Completed).coat) &&
                    typeof (c as Completed).completedAt === 'string' && (c as Completed).completedAt.length <= 40)
                .slice(0, 10_000)
                .map((c: Completed) => ({coat: c.coat, gear: parseGear(c.gear), completedAt: c.completedAt, ...(cleanName(c.name) ? {name: cleanName(c.name)} : {})}))
            : []
        // 레벨 기준보다 xp가 크면 레벨업으로 정리
        const name = cleanName(raw.cat.name)
        const cat = addXp({level, xp: 0, coat, gear: parseGear(raw.cat.gear), ...(name ? {name} : {})}, xp)
        // 레벨업 수가 없는 예전 저장 파일은 지금 레벨과 다 키운 수로 계산한다
        const levelUps = Number.isInteger(raw.levelUps) && raw.levelUps >= 0 && raw.levelUps <= 1e7
            ? raw.levelUps
            : cat.level - 1 + collection.length * (HARVEST_LEVEL - 1)
        const daily: Record<string, number> = {}
        const rawDaily = raw.stats?.daily
        if (rawDaily && typeof rawDaily === 'object' && !Array.isArray(rawDaily)) {
            for (const [k, v] of Object.entries(rawDaily).slice(0, 400)) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && isNum(v) && v >= 0 && v <= 1e9) daily[k] = v
        }
        const pets = Number.isSafeInteger(raw.stats?.pets) && raw.stats.pets >= 0 ? raw.stats.pets : 0
        return {cat, collection, levelUps, stats: {pets, daily}, processed, settings: mergeSettings(DEFAULT_SETTINGS, raw.settings), logOffsets}
    } catch {
        return EMPTY_SAVE
    }
}
