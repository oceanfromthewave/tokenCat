import {addXp, type CatState} from './growth.ts'

// 모든 AI 연동부(adapter)가 이 공통 형식으로 변환해서 넘긴다.
export interface UsageRecord {
    id: string // 원본 기록을 식별하는 안정적인 ID. 같은 기록을 다시 읽어도 같아야 한다.
    provider: string // 출처 (예: 'claude-code')
    occurredAt: string // ISO 시각
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
    source: string // 기록 유형 (예: 'session-log')
    confidence: 'exact' | 'estimated' // 실제 집계값인지 추정값인지
}

// 토큰 -> 경험치 변환 규칙은 여기 한 곳에서만 관리한다.
// 실제 Claude Code 로그 기준 하루 약 3M(중위값) 가중 토큰(출력×5, 캐시 읽기 제외) -> 꽃 피움(1350xp)까지 약 2주 목표
export const TOKENS_PER_XP = 30_000
// 출력은 모델이 직접 만든 양이라 입력보다 가치가 크다고 본다.
export const OUTPUT_WEIGHT = 5
export const ESTIMATE_WEIGHT = 0.5 // 추정값은 절반만 인정
export const MAX_XP_PER_RECORD = 100_000 // 비정상적으로 큰 값 방지

const validCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

export function tokensOf(r: UsageRecord): number {
    if (validCount(r.totalTokens)) return r.totalTokens
    return (validCount(r.inputTokens) ? r.inputTokens : 0) + (validCount(r.outputTokens) ? r.outputTokens : 0)
}

// 경험치 계산용 가중 토큰. 입력/출력을 구분할 수 있으면 출력에 가중치를 주고, 총합만 있으면 그대로 쓴다.
export function weightedTokensOf(r: UsageRecord): number {
    if (validCount(r.inputTokens) || validCount(r.outputTokens)) {
        return (validCount(r.inputTokens) ? r.inputTokens : 0) + (validCount(r.outputTokens) ? r.outputTokens : 0) * OUTPUT_WEIGHT
    }
    return tokensOf(r)
}

export function xpOf(r: UsageRecord): number {
    const weight = r.confidence === 'exact' ? 1 : ESTIMATE_WEIGHT
    // 소수점을 버리지 않는다. 기록 하나는 보통 몇천 토큰이라 기록마다 버리면 경험치가 거의 0이 된다.
    return Math.min((weightedTokensOf(r) * weight) / TOKENS_PER_XP, MAX_XP_PER_RECORD)
}

// 같은 provider + id 는 한 번만 반영한다. provider에 ':'가 있어도 섞이지 않게 NUL로 구분.
export const recordKey = (r: UsageRecord): string => `${r.provider}\0${r.id}`

const isUsable = (r: UsageRecord): boolean =>
    typeof r?.id === 'string' && r.id !== '' && r.id.length <= 200 &&
    typeof r.provider === 'string' && r.provider !== '' && r.provider.length <= 50

// 로그 수집 상태 (화면 표시용, 저장하지 않음)
export interface CollectStatus {
    lastCheckedAt: number | null // 마지막으로 로그를 확인한 시각(ms)
    gainedXp: number // 이번 실행 동안 로그에서 얻은 경험치
    tools: { claude: number; codex: number } // 도구별로 찾은 로그 파일 수 (0이면 로그 없음)
    error: string | null // 로그를 읽다가 문제가 생겼으면 짧은 설명 (내용은 담지 않는다)
}

export interface UsageResult {
    cat: CatState
    processed: string[] // 이미 반영한 기록 키 (저장 대상)
    gainedXp: number
}

// 사용 기록을 경험치로 반영한다. 같은 기록을 다시 넘겨도(재시작, 파일 재읽기, 재시도) 보상은 한 번뿐이다.
// ponytail: 처리한 키를 전부 보관한다. 수십만 건이 넘으면 소스별 읽기 위치 저장이나 SQLite로 교체.
// multiplier는 설정의 성장 속도 배율이다. 같은 기록은 배율과 상관없이 한 번만 반영된다.
export function applyUsage(cat: CatState, processed: string[], records: UsageRecord[], multiplier = 1): UsageResult {
    const seen = new Set(processed)
    const added: string[] = []
    let gainedXp = 0
    for (const r of records) {
        if (!isUsable(r)) continue // 식별할 수 없는 기록은 건너뜀
        const key = recordKey(r)
        if (seen.has(key)) continue
        seen.add(key)
        added.push(key)
        gainedXp += xpOf(r)
    }
    gainedXp *= multiplier
    return {cat: addXp(cat, gainedXp), processed: added.length ? [...processed, ...added] : processed, gainedXp}
}
