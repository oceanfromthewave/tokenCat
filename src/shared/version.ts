// 새 버전 확인에 쓰는 순수 함수들. GitHub 응답은 외부 입력이므로 형식과 주소를 반드시 검증한다.
export const RELEASES_API = 'https://api.github.com/repos/oceanfromthewave/tokenCat/releases/latest'
// 사용자 브라우저로 열어도 되는 주소는 이 저장소의 릴리스 페이지뿐이다.
export const RELEASES_URL_PREFIX = 'https://github.com/oceanfromthewave/tokenCat/releases'

export type Version = [number, number, number]

// '0.2.1' 또는 'v0.2.1' 형식만 받는다. (프리릴리스 꼬리표 등은 거부)
export function parseVersion(v: unknown): Version | null {
    if (typeof v !== 'string') return null
    const m = /^v?(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/.exec(v.trim())
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

// latest가 current보다 높은 버전인가. 형식이 이상하면 false(업데이트를 권하지 않는다).
export function isNewer(latest: unknown, current: unknown): boolean {
    const a = parseVersion(latest), b = parseVersion(current)
    if (!a || !b) return false
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
    return false
}

export interface LatestRelease {
    version: string // 'v' 없는 버전 (예: '0.2.2')
    url: string // 릴리스 페이지 주소
}

// GitHub '최신 릴리스' 응답에서 필요한 값만 꺼낸다. 주소가 우리 저장소의 릴리스 페이지가 아니면 거부한다.
export function parseLatestRelease(json: unknown): LatestRelease | null {
    if (typeof json !== 'object' || json === null) return null
    const o = json as Record<string, unknown>
    const v = parseVersion(o.tag_name)
    const url = o.html_url
    if (!v || typeof url !== 'string' || !url.startsWith(RELEASES_URL_PREFIX + '/') || url.length > 200) return null
    if (o.draft === true || o.prerelease === true) return null
    return {version: v.join('.'), url}
}
