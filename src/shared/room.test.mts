// 실행: npm test
import assert from 'node:assert/strict'
import {FURNITURE, ROOM_W, TOWER_SHELVES, chooseFurniture, newlyUnlocked, plan, roomStep, startCat, unlockedAt, type RoomCat} from './room.ts'

const seeded = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)

// 가구: 처음엔 밥그릇만, 레벨업과 다 키운 수에 따라 늘어나고, 다 열면 전부
assert.deepEqual(unlockedAt({levels: 0, cats: 0}).map((f) => f.id), ['bowl'])
assert.ok(unlockedAt({levels: 11, cats: 0}).some((f) => f.id === 'tower'))
assert.ok(!unlockedAt({levels: 999, cats: 0}).some((f) => f.id === 'wheel')) // 특별 가구는 레벨로는 안 생긴다
assert.equal(unlockedAt({levels: 999, cats: 99}).length, FURNITURE.length)
assert.deepEqual(newlyUnlocked({levels: 2, cats: 0}, {levels: 3, cats: 0}), ['스크래쳐'])
assert.deepEqual(newlyUnlocked({levels: 11, cats: 0}, {levels: 0, cats: 1}), ['러그']) // 새 고양이는 레벨 1부터지만 레벨업 수는 계속 쌓인다(main)
assert.deepEqual(newlyUnlocked({levels: 3, cats: 0}, {levels: 3, cats: 0}), [])
assert.equal(new Set(FURNITURE.map((f) => f.id)).size, FURNITURE.length)

// 가구가 없으면 돌아다니기만 한다
for (let i = 0; i < 50; i++) assert.equal(chooseFurniture([], seeded(i)), null)

// 계획: 모든 가구에 대해 걷기/뛰기 목표가 방 안이고, 캣타워는 선반 높이로 올라갔다 바닥으로 내려온다
for (const f of FURNITURE) for (let i = 0; i < 20; i++) {
    const steps = plan(f, seeded(i))
    assert.ok(steps.length > 0, f.id)
    for (const s of steps) if (s.kind !== 'pose') assert.ok(s.x >= 0 && s.x <= ROOM_W, `${f.id} x=${s.x}`)
    const last = steps[steps.length - 1]
    if (last.kind === 'jump') assert.equal(last.y, 0, `${f.id}: 바닥으로 돌아온다`)
}
const tower = plan(FURNITURE.find((f) => f.id === 'tower')!, seeded(1))
assert.ok(tower.some((s) => s.kind === 'jump' && s.y === TOWER_SHELVES[0]))

// 오래 돌려도 방 밖으로 나가지 않고, 바닥 아래로 내려가지 않으며, 여러 가구를 쓴다
const rand = seeded(7)
const all = unlockedAt({levels: 999, cats: 99})
let c: RoomCat = startCat()
const poses = new Set<string>()
let spun = false
for (let i = 0; i < 60 * 60 * 10; i++) {
    c = roomStep(c, 1 / 60, all, rand)
    assert.ok(c.x >= 0 && c.x <= ROOM_W, `x=${c.x}`)
    assert.ok(c.y >= 0, `y=${c.y}`)
    poses.add(c.pose)
    spun ||= c.spin
}
for (const p of ['walk', 'leap', 'eat', 'sleep', 'stretch', 'sit', 'run', 'happy']) assert.ok(poses.has(p), p)
assert.ok(spun, '캣휠이 돈 적이 있다')

console.log('room: all checks passed')
