// 실행: npm test
import assert from 'node:assert/strict'
import {COATS, INITIAL_CAT, STAGES, addXp, newCat, stageOf, xpToNextLevel} from './growth.ts'

// 레벨업 경계: 100xp면 정확히 레벨 2, 99.9는 그대로
assert.deepEqual(addXp(INITIAL_CAT, 100), {...INITIAL_CAT, level: 2, xp: 0})
assert.equal(addXp(INITIAL_CAT, 99.9).level, 1)
// 한 번에 여러 레벨, 남은 경험치 보존
const multi = addXp(INITIAL_CAT, 100 + 150 + 7)
assert.equal(multi.level, 3)
assert.equal(multi.xp, 7)
// 0, 음수, NaN은 무시 (같은 객체)
for (const v of [0, -5, NaN]) assert.equal(addXp(INITIAL_CAT, v), INITIAL_CAT)
assert.equal(xpToNextLevel(1), 100)

// 단계 경계
assert.equal(stageOf(1).id, 'baby')
assert.equal(stageOf(2).id, 'baby')
assert.equal(stageOf(3).id, 'kitten')
assert.equal(stageOf(9).id, 'young')
assert.equal(stageOf(10).id, 'adult')
assert.equal(stageOf(9999).id, 'adult')
assert.ok(STAGES.every((s, i) => i === 0 || s.minLevel > STAGES[i - 1].minLevel))

// 새 고양이: 가중치대로 모든 털 무늬가 나올 수 있고, 경계값에서도 안전하다
const total = COATS.reduce((n, c) => n + c.weight, 0)
let acc = 0
for (const c of COATS) {
    assert.equal(newCat(() => (acc + c.weight / 2) / total).coat, c.id)
    acc += c.weight
}
assert.equal(newCat(() => 1).coat, COATS[COATS.length - 1].id)
assert.equal(newCat(() => -1).coat, COATS[0].id)
assert.equal(new Set(COATS.map((c) => c.id)).size, COATS.length) // 중복 id 없음

console.log('growth: all checks passed')
