// 실행: npm test
import assert from 'node:assert/strict'
import {COATS, STAGES} from './growth.ts'
import {FRAMES, GRID_H, GRID_W, frameOf, paletteOf, type Pose} from './sprites.ts'

// 모든 털 x 단계 x 포즈 x 프레임: 크기가 맞고, 정의되지 않은 글자가 없고, 빈 그림이 아니며, 가장자리가 잘리지 않는다
for (const coat of COATS) {
    const palette = paletteOf(coat.id)
    for (const st of STAGES) {
        for (const pose of Object.keys(FRAMES) as Pose[]) {
            for (let f = 0; f < FRAMES[pose]; f++) {
                const rows = frameOf(st.id, coat.id, pose, f)
                const tag = `${coat.id}/${st.id}/${pose}${f}`
                assert.equal(rows.length, GRID_H, tag)
                for (const row of rows) {
                    assert.equal(row.length, GRID_W, tag)
                    for (const ch of row) assert.ok(ch === '.' || ch in palette, `${tag}: 알 수 없는 글자 '${ch}'`)
                }
                assert.ok(rows.some((r) => r !== '.'.repeat(GRID_W)), tag)
                // 그림이 그리드 경계에 닿으면 몸이 잘린 것 (좌우 한 칸, 위는 테두리 때문에 비어 있어야 한다)
                assert.ok(rows.every((r) => r[0] === '.'), `${tag}: 왼쪽이 잘림`)
                assert.ok(rows.every((r) => r[GRID_W - 1] === '.'), `${tag}: 오른쪽이 잘림`)
                assert.ok(rows[0] === '.'.repeat(GRID_W), `${tag}: 위가 잘림`)
            }
        }
    }
}
// 프레임 번호는 순환한다
assert.deepEqual(frameOf('adult', 'orange', 'walk', 5), frameOf('adult', 'orange', 'walk', 1))
// 성장하면 모습이 달라진다
assert.notDeepEqual(frameOf('baby', 'orange', 'sit', 0), frameOf('adult', 'orange', 'sit', 0))

console.log('sprites: all checks passed')
