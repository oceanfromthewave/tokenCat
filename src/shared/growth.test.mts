// 실행: npm test
import assert from 'node:assert/strict'
import {COATS, GEAR, rarityOf, GEAR_LEVEL, HARVEST_LEVEL, INITIAL_CAT, STAGES, addXp, grantGear, harvestIfReady, newCat, stageOf, xpToNextLevel} from './growth.ts'

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

// 소품: 레벨이 되기 전에는 없고, 되면 칸마다 하나. 한 번 받으면 바뀌지 않는다
assert.deepEqual(newCat(() => 0.5).gear, {})
assert.equal(grantGear({...INITIAL_CAT, level: GEAR_LEVEL.neck - 1}).gear.neck, undefined)
const lv3 = grantGear({...INITIAL_CAT, level: GEAR_LEVEL.neck}, () => 0)
assert.deepEqual(lv3.gear, {neck: GEAR.neck[0].id})
assert.equal(grantGear(lv3, () => 0.99), lv3) // 이미 있으면 그대로 (같은 객체)
const lv9 = grantGear({...lv3, level: GEAR_LEVEL.head}, () => 0.999999)
assert.deepEqual(lv9.gear, {neck: GEAR.neck[0].id, tail: GEAR.tail[GEAR.tail.length - 1].id, head: GEAR.head[GEAR.head.length - 1].id})
assert.ok(GEAR_LEVEL.head < HARVEST_LEVEL)

// 다 크면 도감에 올라가고(무늬, 소품, 시각) 새 고양이가 시작된다
const grown = {...lv9, level: HARVEST_LEVEL, coat: 'munchkin' as const}
const h = harvestIfReady(grown, [], '2026-10-22T00:00:00Z', () => 0)
assert.deepEqual(h.collection, [{coat: 'munchkin', gear: lv9.gear, completedAt: '2026-10-22T00:00:00Z'}])
assert.deepEqual(h.cat, {level: 1, xp: 0, coat: COATS[0].id, gear: {}})
const not = harvestIfReady({...grown, level: HARVEST_LEVEL - 1}, [], 'x')
assert.equal(not.collection.length, 0)

// 흔한 정도: 코리안 숏헤어는 흔함, 품종묘는 드묾, 희귀 품종은 희귀
assert.equal(rarityOf('orange'), 'common')
assert.equal(rarityOf('british'), 'uncommon')
assert.equal(rarityOf('ragdoll'), 'rare')

console.log('growth: all checks passed')
