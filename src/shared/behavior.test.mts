// 실행: npm test
import assert from 'node:assert/strict'
import {LEAP_SECONDS, force, pickNext, start, step, type Action, type Behavior, type Mood} from './behavior.ts'

// 고정 난수(재현 가능한 테스트용 선형 합동 생성기)
const seeded = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)

const calm: Mood = {excited: false, sleepy: false, pace: 1}
const bounds = {min: 0, max: 800}

// 오래 돌려도 화면 안에 머물고, 모든 행동이 한 번쯤은 나온다
const rand = seeded(1)
let b = start(400, rand)
const seen = new Set<Action>()
for (let i = 0; i < 60 * 60 * 10; i++) { // 10분(60fps)
    b = step(b, 1 / 60, bounds, rand, calm)
    assert.ok(b.x >= bounds.min && b.x <= bounds.max, `x=${b.x}`)
    assert.ok(b.dir === 1 || b.dir === -1)
    seen.add(b.action)
}
assert.deepEqual([...seen].sort(), ['groom', 'leap', 'run', 'sit', 'sleep', 'walk'])

// 끝에 닿으면 돌아선다
const edge: Behavior = {action: 'walk', dir: -1, x: 1, t: 0, until: 100}
const hit = step(edge, 1, bounds, seeded(2), calm)
assert.equal(hit.x, 0)
assert.equal(hit.dir, 1)

// 앉아 있으면 제자리, 걸으면 움직인다
assert.equal(step({...edge, action: 'sit', x: 100}, 1, bounds, seeded(3), calm).x, 100)
assert.ok(step({...edge, x: 100}, 1, bounds, seeded(3), calm).x < 100)
// pace가 클수록 빠르다
assert.ok(100 - step({...edge, x: 100}, 1, bounds, seeded(3), {...calm, pace: 2}).x > 100 - step({...edge, x: 100}, 1, bounds, seeded(3), calm).x)

// 같은 행동을 연달아 고르지 않는다 (걷기 제외). 잠에서 깨면 앉거나 걷는다
for (const a of ['sit', 'run', 'groom', 'leap'] as const) {
    for (let i = 0; i < 200; i++) assert.notEqual(pickNext(a, calm, seeded(i)), a, a)
}
for (let i = 0; i < 200; i++) assert.ok(['sit', 'walk'].includes(pickNext('sleep', calm, seeded(i))))

// 기분: 신나면 잠들지 않고, 졸리면 뛰지 않는다
for (let i = 0; i < 300; i++) {
    assert.ok(!['sleep', 'groom'].includes(pickNext('walk', {...calm, excited: true}, seeded(i))))
    assert.ok(!['run', 'leap'].includes(pickNext('sit', {...calm, sleepy: true}, seeded(i))))
}
// 난수가 경계값(0, 1에 가까움)이어도 유효한 행동을 돌려준다
for (const r of [0, 0.999999]) assert.ok(['sit', 'walk', 'run', 'groom', 'sleep', 'leap'].includes(pickNext('sit', calm, () => r)))
// 웃기(happy)는 클릭으로만: 저절로 고르지 않고, 끝나면 다른 행동으로 넘어간다
for (let i = 0; i < 300; i++) assert.notEqual(pickNext(i % 2 ? 'walk' : 'happy', calm, seeded(i)), 'happy')
const happy = force(edge, 'happy', seeded(5))
assert.equal(step(happy, 0.5, bounds, seeded(6), calm).x, edge.x) // 웃는 동안은 제자리

// 강제 변경: 시간 초기화, 뛰기는 정해진 시간
const jumped = force(edge, 'leap', seeded(4))
assert.deepEqual([jumped.action, jumped.t, jumped.until], ['leap', 0, LEAP_SECONDS])

console.log('behavior: all checks passed')
