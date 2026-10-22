import {closeSync, openSync, readdirSync, readSync, statSync} from 'fs'
import {homedir} from 'os'
import {join} from 'path'
import {parseClaudeLine} from '../shared/claudeCode.ts'
import {parseCodexLine} from '../shared/codex.ts'
import type {UsageRecord} from '../shared/usage.ts'

// 파일 경로 -> 여기까지 읽었다는 바이트 위치
export type Offsets = Record<string, number>

export const defaultClaudeRoot = (): string => join(homedir(), '.claude', 'projects')
export const defaultCodexRoot = (): string => join(homedir(), '.codex', 'sessions')

type ParseLine = (line: string) => UsageRecord | null

function listJsonl(dir: string): string[] {
    try {
        return readdirSync(dir, {withFileTypes: true}).flatMap((e) => {
            const p = join(dir, e.name)
            return e.isDirectory() ? listJsonl(p) : e.name.endsWith('.jsonl') ? [p] : []
        })
    } catch {
        return [] // 폴더가 없으면(Claude Code 미사용) 아무것도 하지 않는다
    }
}

// 새로 추가된 로그만 읽어 UsageRecord로 돌려준다. 원본 파일은 읽기만 하고 수정하지 않는다.
// offsets가 null(첫 실행)이면 지금까지의 기록은 보상하지 않고 현재 위치만 기억한다.
// ponytail: 동기 읽기. 새로 추가된 바이트만 읽으므로 충분하다. 느려지면 비동기/워커로.
export function scanLogs(root: string, offsets: Offsets | null, parse: ParseLine): { records: UsageRecord[]; offsets: Offsets } {
    const next: Offsets = {}
    const records: UsageRecord[] = []
    for (const file of listJsonl(root)) {
        let size: number
        try {
            size = statSync(file).size
        } catch {
            continue
        }
        if (offsets === null) {
            next[file] = size // 첫 실행: 기준선만 잡는다
            continue
        }
        let start = offsets[file] ?? 0 // 새 파일은 처음부터
        if (size < start) start = 0 // 파일이 줄었으면 새로 시작된 것으로 본다
        if (size === start) {
            next[file] = start
            continue
        }
        const text = readRange(file, start, size)
        if (text === null) {
            next[file] = start
            continue
        }
        // 마지막 줄바꿈까지만 처리한다. 쓰는 중인 불완전한 줄은 다음에 읽는다.
        const end = text.lastIndexOf('\n') + 1
        next[file] = start + Buffer.byteLength(text.slice(0, end), 'utf8')
        for (const line of text.slice(0, end).split('\n')) {
            const r = line ? parse(line) : null
            if (r) records.push(r)
        }
    }
    return {records, offsets: next}
}

function readRange(file: string, start: number, end: number): string | null {
    let fd: number | null = null
    try {
        fd = openSync(file, 'r')
        const buf = Buffer.alloc(end - start)
        readSync(fd, buf, 0, buf.length, start)
        return buf.toString('utf8')
    } catch {
        return null
    } finally {
        if (fd !== null) closeSync(fd)
    }
}

export const scanClaudeLogs = (root: string, offsets: Offsets | null) => scanLogs(root, offsets, parseClaudeLine)
export const scanCodexLogs = (root: string, offsets: Offsets | null) => scanLogs(root, offsets, parseCodexLine)
