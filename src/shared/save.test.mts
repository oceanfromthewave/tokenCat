// 실행: npm test
import assert from 'node:assert/strict'
import {DEFAULT_SETTINGS, DAILY_KEEP, EMPTY_SAVE, EMPTY_STATS, dateKey, mergeSettings, parseSave, recordXp} from './save.ts'

const ok = {cat: {level: 4, xp: 12.5, coat: 'gray'}, processed: ['a'], settings: {claude: false}, logOffsets: {'x.jsonl': 10}}
const s = parseSave(JSON.stringify(ok))
assert.deepEqual(s.cat, {level: 4, xp: 12.5, coat: 'gray', gear: {}})
assert.deepEqual(s.collection, [])
assert.deepEqual(s.processed, ['a'])
assert.deepEqual(s.settings, {...DEFAULT_SETTINGS, claude: false}) // 빠진 항목은 기본값
assert.deepEqual(s.logOffsets, {'x.jsonl': 10})

// 망가진 파일은 새로 시작
for (const bad of ['', 'not json', '{}', '{"cat":{"level":0,"xp":0}}', '{"cat":{"level":1.5,"xp":0}}', '{"cat":{"level":1,"xp":-1}}', '{"cat":{"level":1,"xp":1e12}}']) {
    assert.equal(parseSave(bad), EMPTY_SAVE, bad)
}
// 알 수 없는 털 무늬는 기본값, xp가 기준을 넘으면 레벨업으로 정리
const fixed = parseSave(JSON.stringify({cat: {level: 1, xp: 120, coat: 'rainbow'}}))
assert.deepEqual(fixed.cat, {level: 2, xp: 20, coat: 'orange', gear: {}})
assert.equal(fixed.logOffsets, null)
// 이상한 읽은 위치는 걸러낸다
assert.deepEqual(parseSave(JSON.stringify({cat: {level: 1, xp: 0}, logOffsets: {a: -1, b: 'x', c: 5}})).logOffsets, {c: 5})

// 소품과 도감: 모르는 id와 이상한 항목은 버린다
const g = parseSave(JSON.stringify({
    cat: {level: 9, xp: 0, coat: 'gray', gear: {neck: 'bell', tail: 'nope', head: 'crown', hack: 'x'}},
    collection: [{coat: 'munchkin', gear: {head: 'party'}, completedAt: '2026-10-22T00:00:00Z'}, {coat: 'dragon', completedAt: 'x'}, null, {coat: 'black'}]
}))
assert.deepEqual(g.cat.gear, {neck: 'bell', head: 'crown'})
assert.deepEqual(g.collection, [{coat: 'munchkin', gear: {head: 'party'}, completedAt: '2026-10-22T00:00:00Z'}])

// 없어진 벵갈은 먼치킨으로 옮긴다 (지금 고양이와 도감 모두)
const old = parseSave(JSON.stringify({cat: {level: 2, xp: 0, coat: 'bengal'}, collection: [{coat: 'bengal', completedAt: '2026-10-21T00:00:00Z'}]}))
assert.equal(old.cat.coat, 'munchkin')
assert.deepEqual(old.collection.map((c) => c.coat), ['munchkin'])

// 레벨업 수: 저장된 값이 있으면 그대로, 없거나 이상하면 레벨과 다 키운 수로 계산
assert.equal(parseSave(JSON.stringify({cat: {level: 5, xp: 0}, levelUps: 40})).levelUps, 40)
assert.equal(parseSave(JSON.stringify({cat: {level: 5, xp: 0}, collection: [{coat: 'black', completedAt: 'x'}]})).levelUps, 4 + 11)
assert.equal(parseSave(JSON.stringify({cat: {level: 1, xp: 0}, levelUps: -3})).levelUps, 0)

// 설정: 형식이 틀린 값은 무시
assert.deepEqual(mergeSettings(DEFAULT_SETTINGS, {claude: 'no', codex: false, hack: 1}), {...DEFAULT_SETTINGS, codex: false})
assert.equal(mergeSettings(DEFAULT_SETTINGS, {displayId: 7}).displayId, 7)
assert.equal(mergeSettings({...DEFAULT_SETTINGS, displayId: 7}, {displayId: null}).displayId, null)
assert.equal(mergeSettings(DEFAULT_SETTINGS, {displayId: -1}).displayId, null)
assert.equal(mergeSettings(DEFAULT_SETTINGS, {displayId: 1.5}).displayId, null)
assert.deepEqual(mergeSettings(DEFAULT_SETTINGS, null), DEFAULT_SETTINGS)

// 이름과 기록
const named = parseSave(JSON.stringify({cat: {level: 1, xp: 0, name: '  구름  '}, collection: [{coat: 'black', completedAt: 'x', name: '까망'}], stats: {pets: 5, daily: {'2026-10-22': 30, bad: 1, '2026-10-21': -1}}}))
assert.equal(named.cat.name, '구름')
assert.equal(named.collection[0].name, '까망')
assert.deepEqual(named.stats, {pets: 5, daily: {'2026-10-22': 30}})
assert.deepEqual(parseSave(JSON.stringify({cat: {level: 1, xp: 0}})).stats, EMPTY_STATS)

// 날짜별 경험치: 더하고, 0 이하는 무시하고, 오래된 날은 지운다
let st = recordXp(EMPTY_STATS, 10, '2026-10-22')
st = recordXp(st, 5, '2026-10-22')
assert.equal(st.daily['2026-10-22'], 15)
assert.equal(recordXp(st, 0, '2026-10-23'), st)
for (let i = 0; i < DAILY_KEEP + 5; i++) st = recordXp(st, 1, dateKey(new Date(2026, 0, 1 + i)))
assert.equal(Object.keys(st.daily).length, DAILY_KEEP)
assert.equal(dateKey(new Date(2026, 0, 5)), '2026-01-05')

console.log('save: all checks passed')
