// 실행: npm test
import assert from 'node:assert/strict'
import {parseClaudeLine} from './claudeCode.ts'

const line = (o: unknown): string => JSON.stringify(o)
const assistant = (usage: unknown, extra = {}) => ({
    type: 'assistant', requestId: 'req1', timestamp: '2026-10-14T00:00:00Z',
    message: {id: 'msg1', content: [{type: 'text', text: '대화 내용은 읽지 않는다'}], usage}, ...extra
})

// 정상 줄: 캐시 읽기는 제외, 캐시 생성은 입력에 포함
const r = parseClaudeLine(line(assistant({input_tokens: 2, cache_creation_input_tokens: 100, cache_read_input_tokens: 99999, output_tokens: 8})))!
assert.equal(r.id, 'msg1|req1')
assert.equal(r.provider, 'claude-code')
assert.equal(r.inputTokens, 102)
assert.equal(r.outputTokens, 8)
assert.equal(r.totalTokens, 110)
assert.equal(r.confidence, 'exact')
assert.equal(r.occurredAt, '2026-10-14T00:00:00Z')
assert.equal(JSON.stringify(r).includes('대화'), false) // 내용은 결과에 없다

// 같은 응답의 중복 줄은 같은 ID
assert.equal(parseClaudeLine(line(assistant({output_tokens: 1})))!.id, r.id)

// 사용량 없는 줄/잘못된 입력은 null
for (const bad of ['', 'not json', 'null', line({type: 'user', message: {id: 'x', usage: {output_tokens: 5}}}),
    line(assistant(undefined)), line({type: 'assistant', message: {usage: {output_tokens: 5}}}),
    line({type: 'assistant', message: {id: '', usage: {output_tokens: 5}}})]) {
    assert.equal(parseClaudeLine(bad), null, bad)
}

// 음수/문자열 토큰은 0 취급, requestId 없어도 처리
const odd = parseClaudeLine(line(assistant({input_tokens: -5, output_tokens: '9'}, {requestId: undefined})))!
assert.equal(odd.totalTokens, 0)
assert.equal(odd.id, 'msg1|')

console.log('claudeCode: all checks passed')
