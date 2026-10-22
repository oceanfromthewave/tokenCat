import type {UsageRecord} from './usage.ts'

export const CODEX_PROVIDER = 'codex'

const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)

// Codex 세션 로그(.jsonl) 한 줄을 공통 UsageRecord로 바꾼다. 토큰 정보가 없는 줄은 null.
// 줄에는 대화 내용도 들어 있지만 ID·시각·토큰 숫자만 꺼내고 나머지는 버린다.
//
// 형식: {"type":"event_msg","timestamp":...,"payload":{"type":"token_count","info":{
//   "total_token_usage": {...누적}, "last_token_usage": {...이번 턴}}}}   (info가 null인 줄도 있다)
//
// 토큰 정의 (Claude Code와 같은 원칙: 캐시를 다시 읽은 토큰은 세지 않는다):
//   input  = input_tokens - cached_input_tokens   (cached는 input에 포함된 값이다: total = input + output)
//   output = output_tokens                         (추론 토큰은 output에 포함돼 있다)
// 이번 턴 사용량(last_token_usage)만 쓴다. 누적값(total_token_usage)을 쓰면 중복 계산된다.
// 같은 줄이 다시 읽혀도 중복되지 않게 ID는 시각 + 누적 총합으로 만든다. 누적 총합은 세션 안에서 계속 커진다.
export function parseCodexLine(line: string): UsageRecord | null {
    try {
        const o = JSON.parse(line)
        if (o?.type !== 'event_msg' || o.payload?.type !== 'token_count') return null
        const last = o.payload.info?.last_token_usage
        const cumulative = o.payload.info?.total_token_usage?.total_tokens
        if (!last || typeof cumulative !== 'number' || typeof o.timestamp !== 'string') return null

        const inputTokens = Math.max(0, count(last.input_tokens) - count(last.cached_input_tokens))
        const outputTokens = count(last.output_tokens)
        return {
            id: `${o.timestamp}|${cumulative}`,
            provider: CODEX_PROVIDER,
            occurredAt: o.timestamp,
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
            source: 'session-log',
            confidence: 'exact'
        }
    } catch {
        return null
    }
}
