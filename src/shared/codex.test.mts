// 실행: npm test
import assert from 'node:assert/strict'
import {parseCodexLine} from './codex.ts'

const line = (o: unknown): string => JSON.stringify(o)
const tokenCount = (info: unknown, extra = {}) => ({
    type: 'event_msg', timestamp: '2026-04-17T00:57:23.688Z', ordinal: 7,
    payload: {type: 'token_count', info, rate_limits: {}, text: '대화 내용은 읽지 않는다'}, ...extra
})
const usage = (input: number, cached: number, output: number) => ({
    input_tokens: input, cached_input_tokens: cached, cache_write_input_tokens: 0, output_tokens: output, reasoning_output_tokens: 0, total_tokens: input + output
})

// 정상 줄: 이번 턴 사용량만, 캐시 읽기는 입력에서 제외
const r = parseCodexLine(line(tokenCount({total_token_usage: usage(50000, 0, 500), last_token_usage: usage(20162, 6528, 14)})))!
assert.equal(r.provider, 'codex')
assert.equal(r.inputTokens, 20162 - 6528)
assert.equal(r.outputTokens, 14)
assert.equal(r.totalTokens, 20162 - 6528 + 14)
assert.equal(r.confidence, 'exact')
assert.equal(r.occurredAt, '2026-04-17T00:57:23.688Z')
assert.equal(r.id, '2026-04-17T00:57:23.688Z|50500') // 누적 총합이 ID에 들어간다 (같은 줄 재처리 시 같은 ID)
assert.equal(JSON.stringify(r).includes('대화'), false)

// 같은 줄은 같은 ID, 누적이 달라지면 다른 ID
const again = parseCodexLine(line(tokenCount({total_token_usage: usage(50000, 0, 500), last_token_usage: usage(1, 0, 1)})))!
assert.equal(again.id, r.id)
const next = parseCodexLine(line(tokenCount({total_token_usage: usage(60000, 0, 600), last_token_usage: usage(1, 0, 1)})))!
assert.notEqual(next.id, r.id)

// 사용량 없는 줄은 null: info가 null, 다른 이벤트, 깨진 입력, 필수 값 누락
for (const bad of ['', 'not json', 'null', line(tokenCount(null)),
    line({type: 'response_item', payload: {type: 'message'}}),
    line({type: 'event_msg', payload: {type: 'task_started'}}),
    line(tokenCount({last_token_usage: usage(1, 0, 1)})), // 누적 없음
    line(tokenCount({total_token_usage: usage(1, 0, 1)})), // 이번 턴 없음
    line(tokenCount({total_token_usage: usage(1, 0, 1), last_token_usage: usage(1, 0, 1)}, {timestamp: undefined}))]) {
    assert.equal(parseCodexLine(bad), null, bad)
}

// 이상한 숫자: 캐시가 입력보다 크면 입력은 0, 음수/문자열은 0 취급
const odd = parseCodexLine(line(tokenCount({
    total_token_usage: usage(1, 0, 1),
    last_token_usage: {input_tokens: 100, cached_input_tokens: 500, output_tokens: '9', reasoning_output_tokens: -1}
})))!
assert.equal(odd.inputTokens, 0)
assert.equal(odd.outputTokens, 0)
assert.equal(odd.totalTokens, 0)

console.log('codex: all checks passed')
