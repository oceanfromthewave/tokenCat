// 모든 단계 x 포즈 프레임을 한 장의 PNG로 만든다. 화면에서 그림을 눈으로 확인하는 용도.
// 실행: npm run preview:sprites [출력경로] [털무늬]   (기본: dist/sprite-preview.png, orange)
import {mkdirSync, writeFileSync} from 'node:fs'
import {dirname} from 'node:path'
import {deflateSync} from 'node:zlib'
import {COATS, STAGES, isCoatId} from '../src/shared/growth.ts'
import {FRAMES, GRID_H, GRID_W, frameOf, paletteOf, type Pose} from '../src/shared/sprites.ts'

const out = process.argv[2] ?? 'dist/sprite-preview.png'
const arg = process.argv[3] ?? 'orange'
const coats = arg === 'all' ? COATS.map((c) => c.id) : arg.split(',').filter(isCoatId)
const POSES = (Object.keys(FRAMES) as Pose[]).filter((p) => !process.env.POSE || process.env.POSE.split(',').includes(p))
const COLS = POSES.flatMap((p) => Array.from({length: FRAMES[p]}, (_, f) => [p, f] as const))

const SCALE = Number(process.env.SCALE ?? 3), PAD = 2
const CW = GRID_W * SCALE + PAD * 2, CH = GRID_H * SCALE + PAD * 2
const rows = coats.flatMap((coat) => STAGES.filter((st) => !process.env.STAGE || st.id === process.env.STAGE).map((st) => ({coat, stage: st.id})))
// GRID=n 이면 칸 하나에 고양이 한 마리(첫 포즈)씩, 한 줄에 n마리를 놓는다. 아니면 행=고양이/단계, 열=포즈 프레임.
const GRID = Number(process.env.GRID ?? 0)
const cells = GRID
    ? rows.map((r) => ({...r, pose: COLS[0][0], frame: 0}))
    : rows.flatMap((r, row) => COLS.map(([pose, frame], col) => ({...r, pose, frame, row, col})))
const perRow = GRID || COLS.length
const W = CW * perRow, H = CH * (GRID ? Math.ceil(cells.length / GRID) : rows.length)

const px = Buffer.alloc(W * H * 4)
const put = (x: number, y: number, [r, g, b]: number[]): void => {
    const i = (y * W + x) * 4
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255
}
const hex = (c: string): number[] => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))

cells.forEach(({coat, stage, pose, frame}, n) => {
    const row = Math.floor(n / perRow), col = n % perRow
    const palette = paletteOf(coat)
    const ox = col * CW, oy = row * CH
    const bg = (row + col) % 2 ? [0x5a, 0x66, 0x7a] : [0x6b, 0x78, 0x8c] // 칸 구분용 바둑판
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) put(ox + x, oy + y, bg)
    frameOf(stage, coat, pose, frame).forEach((line, gy) => [...line].forEach((ch, gx) => {
        if (!palette[ch]) return
        for (let y = 0; y < SCALE; y++) for (let x = 0; x < SCALE; x++) put(ox + PAD + gx * SCALE + x, oy + PAD + gy * SCALE + y, hex(palette[ch]))
    }))
})

// 최소한의 PNG 인코더 (이미지 라이브러리를 추가하지 않으려고 직접 작성)
const crcTable = Array.from({length: 256}, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
})
const crc = (b: Buffer): number => {
    let c = 0xffffffff
    for (const v of b) c = crcTable[(c ^ v) & 255] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
}
const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body))
    return Buffer.concat([len, body, sum])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6
const raw = Buffer.alloc((W * 4 + 1) * H)
for (let y = 0; y < H; y++) px.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4)

mkdirSync(dirname(out), {recursive: true})
writeFileSync(out, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
]))
console.log(`${out} (${W}x${H}) ${GRID ? '순서(왼쪽 위부터): ' + cells.map((c) => c.coat).join(', ') : '행: ' + rows.map((r) => `${r.coat}/${r.stage}`).join(', ') + ' / 열: ' + COLS.map(([p, f]) => `${p}${f}`).join(' ')}`)
