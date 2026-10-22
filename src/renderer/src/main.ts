import {LEAP_SECONDS, force, start, step, type Behavior, type Mood} from '../../shared/behavior'
import {INITIAL_CAT, coatName, formatXp, stageOf, xpToNextLevel, type CatState} from '../../shared/growth'
import {FRAMES, GRID_H, GRID_W, frameOf, paletteOf, type Pose} from '../../shared/sprites'
import './styles.css'

const P = 2 // 도트 한 칸의 화면 크기(px)
const EDGE = 2 // 그림 좌우 빈칸(칸). 이만큼은 화면 밖으로 나가도 된다.
const LEAP_HEIGHT = 22 // 뛰어오르는 높이(px)
const EXCITED_MS = 12_000 // 경험치를 얻고 신나 있는 시간
const SLEEPY_MS = 15 * 60_000 // 이만큼 조용하면 졸린다

const el = document.getElementById('cat') as HTMLDivElement
const canvas = document.getElementById('sprite') as HTMLCanvasElement
const zzz = document.getElementById('zzz') as HTMLDivElement
const bubble = document.getElementById('bubble') as HTMLDivElement
const ctx = canvas.getContext('2d')!
canvas.width = GRID_W
canvas.height = GRID_H
canvas.style.width = `${GRID_W * P}px`
canvas.style.height = `${GRID_H * P}px`

let cat: CatState = INITIAL_CAT
let lastGainAt = 0
const startedAt = performance.now()

// ---- 그림 캐시: (단계, 털, 포즈, 프레임) 하나당 캔버스 한 장 ----
interface Sprite {
    image: HTMLCanvasElement
    box: { l: number; r: number; t: number } // 그림이 실제로 차지하는 칸 범위 (마우스 판정용)
}
const sprites = new Map<string, Sprite>()

function spriteOf(pose: Pose, frame: number): Sprite {
    const stage = stageOf(cat.level).id
    const key = `${stage}|${cat.coat}|${pose}|${frame % FRAMES[pose]}`
    let s = sprites.get(key)
    if (!s) {
        const image = document.createElement('canvas')
        image.width = GRID_W
        image.height = GRID_H
        const c = image.getContext('2d')!
        const palette = paletteOf(cat.coat)
        const box = {l: GRID_W, r: 0, t: GRID_H}
        frameOf(stage, cat.coat, pose, frame).forEach((row, y) => [...row].forEach((ch, x) => {
            if (!palette[ch]) return
            c.fillStyle = palette[ch]
            c.fillRect(x, y, 1, 1)
            box.l = Math.min(box.l, x)
            box.r = Math.max(box.r, x)
            box.t = Math.min(box.t, y)
        }))
        s = {image, box}
        sprites.set(key, s)
    }
    return s
}

// ---- 상태와 알림 ----
let say = {text: '', until: 0}
const showSay = (text: string, ms: number): void => void (say = {text, until: performance.now() + ms})

function applyCat(next: CatState, gainedXp: number): void {
    const before = cat
    cat = next
    if (gainedXp > 0) lastGainAt = performance.now()
    if (next.level > before.level && before !== INITIAL_CAT) {
        const stage = stageOf(next.level)
        showSay(stage.id !== stageOf(before.level).id ? `${stage.name}이 됐어요!` : `레벨 ${next.level}!`, 4000)
    }
}

void window.api.getState().then((s) => applyCat(s.cat, 0))
window.api.onStateChanged((s) => applyCat(s.cat, s.gainedXp ?? 0))

// ---- 마우스: 고양이 위에 올라가면 창이 클릭을 받고, 고양이는 멈춰서 쳐다본다 ----
let mouse: { x: number; y: number } | null = null
let hover = false
document.addEventListener('mousemove', (e) => void (mouse = {x: e.clientX, y: e.clientY}))
document.documentElement.addEventListener('mouseleave', () => void (mouse = null))

let b: Behavior = start(window.innerWidth / 2, Math.random)

document.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !hover) return
    b = force(b, b.action === 'sleep' ? 'sit' : 'leap', Math.random) // 자고 있으면 깨우고, 아니면 폴짝
    showSay(statusText(), 2500)
})
document.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    if (hover) window.api.openMenu()
})

function statusText(): string {
    const need = xpToNextLevel(cat.level)
    return `${coatName(cat.coat)} · ${stageOf(cat.level).name} · Lv.${cat.level}<div class="bar"><i style="width:${Math.min(100, (cat.xp / need) * 100)}%"></i></div>${formatXp(cat.xp)} / ${need}`
}

// ---- 한 프레임 ----
const FPS: Record<Pose, number> = {sit: 1.5, walk: 8, run: 14, groom: 3, sleep: 0.7, leap: 1}
let prev = performance.now()
let lastKey = ''

function frame(now: number): void {
    const dt = Math.min((now - prev) / 1000, 0.1) // 절전 복귀 등으로 시간이 튀어도 한 번에 멀리 가지 않게
    prev = now
    const stage = stageOf(cat.level)
    const mood: Mood = {
        excited: now - lastGainAt < EXCITED_MS && lastGainAt > 0,
        sleepy: now - Math.max(lastGainAt, startedAt) > SLEEPY_MS,
        pace: stage.pace
    }
    const bounds = {min: -EDGE * P, max: window.innerWidth - (GRID_W - EDGE) * P}

    const pose = b.action
    const s = spriteOf(pose, Math.floor(b.t * FPS[pose]))
    // 이 그림이 차지하는 화면 영역. 왼쪽을 보고 있으면 좌우가 뒤집힌다.
    const left = b.x + (b.dir === 1 ? s.box.l : GRID_W - 1 - s.box.r) * P
    const width = (s.box.r - s.box.l + 1) * P
    const lift = pose === 'leap' ? Math.sin(Math.PI * Math.min(b.t / LEAP_SECONDS, 1)) * LEAP_HEIGHT : 0
    const top = window.innerHeight - GRID_H * P + s.box.t * P - lift

    const over = mouse !== null && mouse.x >= left - 6 && mouse.x <= left + width + 6 && mouse.y >= top - 6 && mouse.y <= window.innerHeight
    if (over !== hover) {
        hover = over
        window.api.capture(hover)
    }

    if (hover && (b.action === 'walk' || b.action === 'run')) b = force(b, 'sit', Math.random)
    // 마우스를 올린 동안은 앉아서(또는 자면서) 가만히 있는다. 뛰는 중이면 끝까지 뛴다.
    b = hover && b.action !== 'leap' ? b : step(b, dt, bounds, Math.random, mood)

    const key = `${pose}${Math.floor(b.t * FPS[pose]) % FRAMES[pose]}${stage.id}${cat.coat}`
    if (key !== lastKey || sprites.size === 0) {
        lastKey = key
        ctx.clearRect(0, 0, GRID_W, GRID_H)
        ctx.drawImage(s.image, 0, 0)
    }
    el.style.transform = `translate(${b.x}px, ${-lift}px)`
    canvas.style.transform = `scaleX(${b.dir})`
    zzz.classList.toggle('on', b.action === 'sleep')
    zzz.style.left = `${(b.dir === 1 ? s.box.r - 8 : GRID_W - 1 - s.box.r) * P}px`
    zzz.style.top = `${s.box.t * P - 20}px`

    // 말풍선: 마우스를 올리면 상태, 아니면 알림 문구
    const text = hover ? statusText() : now < say.until ? say.text : ''
    bubble.style.display = text ? 'block' : 'none'
    if (text) {
        if (bubble.innerHTML !== text) bubble.innerHTML = text
        bubble.style.left = `${Math.min(Math.max(left + width / 2, 70), window.innerWidth - 70)}px`
        bubble.style.top = `${Math.max(top - 6, 50)}px`
    }
    requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
