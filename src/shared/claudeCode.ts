import type {UsageRecord} from './usage.ts'

export const CLAUDE_PROVIDER = 'claude-code'

const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)

// Claude Code 세션 로그(.jsonl) 한 줄을 공통 UsageRecord로 바꾼다. 사용량이 없는 줄은 null.
// 로그 한 줄에는 대화 내용도 들어 있지만, 여기서는 ID·시각·토큰 숫자만 꺼내고 나머지는 버린다.
//
// 토큰 정의 (CLAUDE.md: 제공자마다 의미가 다를 수 있음):
//   input  = input_tokens + cache_creation_input_tokens  (새로 처리한 입력)
//   output = output_tokens
//   cache_read_input_tokens 는 제외한다. 같은 문맥을 매 턴 다시 읽는 값이라
//   포함하면 하루 1억 토큰대로 부풀어 사용량을 대표하지 못한다.
// 한 응답이 여러 줄로 기록되므로(내용 블록마다 한 줄) ID는 message.id + requestId 로 만든다.
export function parseClaudeLine(line: string): UsageRecord | null {
    try {
        const o = JSON.parse(line)
        const u = o?.type === 'assistant' ? o.message?.usage : null
        const msgId = o?.message?.id
        if (!u || typeof msgId !== 'string' || msgId === '') return null

        const inputTokens = count(u.input_tokens) + count(u.cache_creation_input_tokens)
        const outputTokens = count(u.output_tokens)
        return {
            id: `${msgId}|${typeof o.requestId === 'string' ? o.requestId : ''}`,
            provider: CLAUDE_PROVIDER,
            occurredAt: typeof o.timestamp === 'string' ? o.timestamp : new Date(0).toISOString(),
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
