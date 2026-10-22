// 실행: npm test
import assert from 'node:assert/strict'
import {DEFAULT_SETTINGS, EMPTY_SAVE, mergeSettings, parseSave} from './save.ts'

const ok = {cat: {level: 4, xp: 12.5, coat: 'gray'}, processed: ['a'], settings: {claude: false}, logOffsets: {'x.jsonl': 10}}
const s = parseSave(JSON.stringify(ok))
assert.deepEqual(s.cat, {level: 4, xp: 12.5, coat: 'gray'})
assert.deepEqual(s.processed, ['a'])
assert.deepEqual(s.settings, {claude: false, codex: true}) // 빠진 항목은 기본값
assert.deepEqual(s.logOffsets, {'x.jsonl': 10})

// 망가진 파일은 새로 시작
for (const bad of ['', 'not json', '{}', '{"cat":{"level":0,"xp":0}}', '{"cat":{"level":1.5,"xp":0}}', '{"cat":{"level":1,"xp":-1}}', '{"cat":{"level":1,"xp":1e12}}']) {
    assert.equal(parseSave(bad), EMPTY_SAVE, bad)
}
// 알 수 없는 털 무늬는 기본값, xp가 기준을 넘으면 레벨업으로 정리
const fixed = parseSave(JSON.stringify({cat: {level: 1, xp: 120, coat: 'rainbow'}}))
assert.deepEqual(fixed.cat, {level: 2, xp: 20, coat: 'orange'})
assert.equal(fixed.logOffsets, null)
// 이상한 읽은 위치는 걸러낸다
assert.deepEqual(parseSave(JSON.stringify({cat: {level: 1, xp: 0}, logOffsets: {a: -1, b: 'x', c: 5}})).logOffsets, {c: 5})

// 설정: 형식이 틀린 값은 무시
assert.deepEqual(mergeSettings(DEFAULT_SETTINGS, {claude: 'no', codex: false, hack: 1}), {claude: true, codex: false})
assert.deepEqual(mergeSettings(DEFAULT_SETTINGS, null), DEFAULT_SETTINGS)

console.log('save: all checks passed')
