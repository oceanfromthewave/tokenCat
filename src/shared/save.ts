import {INITIAL_CAT, addXp, isCoatId, type CatState} from './growth.ts'

// 사용자 설정. 저장 파일에서 읽을 때도, 화면(IPC)에서 바꿀 때도 항상 mergeSettings로 검증한다.
export interface Settings {
    claude: boolean // Claude Code 로그 수집
    codex: boolean // Codex 로그 수집
}

export const DEFAULT_SETTINGS: Settings = {claude: true, codex: true}

export function mergeSettings(current: Settings, patch: unknown): Settings {
    const p = (typeof patch === 'object' && patch !== null ? patch : {}) as Record<string, unknown>
    const own = (k: string): unknown => (Object.hasOwn(p, k) ? p[k] : undefined)
    return {
        claude: typeof own('claude') === 'boolean' ? (own('claude') as boolean) : current.claude,
        codex: typeof own('codex') === 'boolean' ? (own('codex') as boolean) : current.codex
    }
}

// 디스크에 저장하는 데이터 형식. 파일은 외부에서 바뀌거나 깨질 수 있으니 읽을 때 반드시 검증한다.
export interface SaveData {
    cat: CatState
    processed: string[] // 이미 경험치로 반영한 사용 기록 키 (중복 보상 방지)
    settings: Settings
    logOffsets: Record<string, number> | null // 로그 파일별 읽은 위치. null = 아직 기준선 없음(첫 실행)
}

export const EMPTY_SAVE: SaveData = {cat: INITIAL_CAT, processed: [], settings: DEFAULT_SETTINGS, logOffsets: null}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

// 저장 파일 내용을 SaveData로 바꾼다. 형식이 이상하면 새로 시작(EMPTY_SAVE)한다.
export function parseSave(text: string): SaveData {
    try {
        const raw = JSON.parse(text)
        const {level, xp} = raw.cat
        // 상한은 addXp 반복 횟수가 터무니없이 커지는 것을 막기 위한 안전장치
        if (!Number.isInteger(level) || level < 1 || level > 9999) return EMPTY_SAVE
        if (!isNum(xp) || xp < 0 || xp > 1e9) return EMPTY_SAVE
        const coat = isCoatId(raw.cat.coat) ? raw.cat.coat : INITIAL_CAT.coat

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
        // 레벨 기준보다 xp가 크면 레벨업으로 정리
        return {cat: addXp({level, xp: 0, coat}, xp), processed, settings: mergeSettings(DEFAULT_SETTINGS, raw.settings), logOffsets}
    } catch {
        return EMPTY_SAVE
    }
}
