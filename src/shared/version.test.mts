// 실행: npm test
import assert from 'node:assert/strict'
import {RELEASES_URL_PREFIX, isNewer, parseLatestRelease, parseVersion} from './version.ts'

// 버전 파싱: v가 있어도 없어도, 이상한 형식은 거부
assert.deepEqual(parseVersion('0.2.1'), [0, 2, 1])
assert.deepEqual(parseVersion('v10.0.15'), [10, 0, 15])
assert.deepEqual(parseVersion(' v1.2.3 '), [1, 2, 3])
for (const bad of ['', '1.2', '1.2.3.4', 'v1.2.x', '1.2.3-beta', 'latest', null, undefined, 123, {}, '99999.0.0']) {
    assert.equal(parseVersion(bad), null, String(bad))
}

// 비교: 숫자로 비교한다 (문자열 비교였다면 0.10.0 < 0.9.0 이 된다)
assert.equal(isNewer('v0.2.2', '0.2.1'), true)
assert.equal(isNewer('0.3.0', '0.2.9'), true)
assert.equal(isNewer('1.0.0', '0.99.99'), true)
assert.equal(isNewer('0.10.0', '0.9.0'), true)
assert.equal(isNewer('0.2.1', '0.2.1'), false)
assert.equal(isNewer('0.2.0', '0.2.1'), false)
assert.equal(isNewer('0.1.9', '0.2.0'), false)
// 형식이 이상하면 업데이트를 권하지 않는다
assert.equal(isNewer('abc', '0.2.1'), false)
assert.equal(isNewer('0.3.0', 'abc'), false)
assert.equal(isNewer(undefined, undefined), false)

// 최신 릴리스 응답 검증
const url = RELEASES_URL_PREFIX + '/tag/v0.2.2'
assert.deepEqual(parseLatestRelease({tag_name: 'v0.2.2', html_url: url}), {version: '0.2.2', url})
for (const bad of [null, 'x', [], {},
    {tag_name: 'v0.2.2'}, // 주소 없음
    {tag_name: 'nightly', html_url: url},
    {tag_name: 'v0.2.2', html_url: 'https://evil.example.com/releases/tag/v0.2.2'}, // 다른 사이트
    {tag_name: 'v0.2.2', html_url: 'https://github.com/someone-else/tokenCat/releases/tag/v0.2.2'}, // 다른 저장소
    {tag_name: 'v0.2.2', html_url: RELEASES_URL_PREFIX + 'x/tag/v0.2.2'}, // 접두사만 닮은 주소
    {tag_name: 'v0.2.2', html_url: 'javascript:alert(1)'},
    {tag_name: 'v0.2.2', html_url: url, draft: true},
    {tag_name: 'v0.2.2', html_url: url, prerelease: true},
    {tag_name: 'v0.2.2', html_url: url + 'a'.repeat(300)}]) {
    assert.equal(parseLatestRelease(bad), null, JSON.stringify(bad)?.slice(0, 60))
}

console.log('version: all checks passed')
