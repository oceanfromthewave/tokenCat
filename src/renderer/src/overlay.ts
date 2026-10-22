import {LEAP_SECONDS, force, start, step, type Behavior, type Mood} from '../../shared/behavior'
import {HARVEST_LEVEL, INITIAL_CAT, SLOTS, callName, coatName, formatXp, gearName, stageOf, xpToNextLevel, type CatState} from '../../shared/growth'
import {GRID_H, GRID_W, POSE_FPS as FPS} from '../../shared/sprites'
import type {AppState} from '../../preload/index'
import {spriteFor, type Sprite} from './draw'
import {newlyUnlocked} from '../../shared/room'

const P = 2 // 도트 한 칸의 화면 크기(px)
const EDGE = 2 // 그림 좌우 빈칸(칸). 이만큼은 화면 밖으로 나가도 된다.
const LEAP_HEIGHT = 22 // 뛰어오르는 높이(px)
const EXCITED_MS = 12_000 // 경험치를 얻고 신나 있는 시간
const SLEEPY_MS = 15 * 60_000 // 이만큼 조용하면 졸린다

const el = document.getElementById('cat') as HTMLDivElement
const canvas = document.getElementById('sprite') as HTMLCanvasElement
const zzz = document.getElementById('zzz') as HTMLDivElement
const bubble = document.getElementById('bubble') as HTMLDivElement
const dev = document.getElementById('dev') as HTMLDivElement
const ctx = canvas.getContext('2d')!
canvas.width = GRID_W
canvas.height = GRID_H
canvas.style.width = `${GRID_W * P}px`
canvas.style.height = `${GRID_H * P}px`

let cat: CatState = INITIAL_CAT
let sound = true // 쓰다듬으면 야옹 소리
const FRAME_MS = 1000 / 30 // 초당 30번만 그린다 (60번은 눈에 띄는 차이 없이 CPU만 더 쓴다)

// 말풍선은 HTML로 그리므로 사용자가 지은 이름은 반드시 글자로만 넣는다
const esc = (t: string): string => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

// 밤(23시~6시)에는 더 자주 존다
const isNight = (): boolean => {
    const h = new Date().getHours()
    return h >= 23 || h < 6
}

// "야옹": 파일 없이 소리를 합성한다. 음 높이가 올라갔다 내려오는 짧은 소리.
let audio: AudioContext | null = null
function meow(): void {
    try {
        audio ??= new AudioContext()
        const t = audio.currentTime
        const osc = audio.createOscillator(), gain = audio.createGain(), filter = audio.createBiquadFilter()
        osc.type = 'sawtooth'
        osc.frequency.setValueAtTime(480, t)
        osc.frequency.linearRampToValueAtTime(820, t + 0.12)
        osc.frequency.linearRampToValueAtTime(520, t + 0.4)
        filter.type = 'lowpass'
        filter.frequency.setValueAtTime(1400, t)
        filter.Q.value = 6
        gain.gain.setValueAtTime(0, t)
        gain.gain.linearRampToValueAtTime(0.08, t + 0.04)
        gain.gain.linearRampToValueAtTime(0.06, t + 0.25)
        gain.gain.linearRampToValueAtTime(0, t + 0.42)
        osc.connect(filter).connect(gain).connect(audio.destination)
        osc.start(t)
        osc.stop(t + 0.45)
    } catch {
        // 소리를 못 내도 고양이는 그대로 동작한다
    }
}
let lastGainAt = 0
const startedAt = performance.now()

const spriteOf = (pose: Behavior['action'], frame: number): Sprite => spriteFor(stageOf(cat.level).id, cat.coat, pose, frame, cat.gear)

// ---- 상태와 알림 ----
let say = {text: '', until: 0}
const showSay = (text: string, ms: number): void => void (say = {text, until: performance.now() + ms})

let known = -1 // 도감에 올라간 고양이 수 (처음 받은 상태는 알림 없이 기억만 한다)
let knownUps = 0 // 지금까지 오른 레벨 수

// 상태가 바뀌면 무엇이 바뀌었는지 보고 말풍선을 띄운다. 다 큼 > 소품 > 단계 > 레벨 순으로 하나만.
function apply(next: AppState): void {
    const before = cat
    cat = next.cat
    sound = next.sound
    if ((next.gainedXp ?? 0) > 0) lastGainAt = performance.now()
    const first = known < 0
    const grown = !first && next.collection.length > known
    const furniture = newlyUnlocked({levels: knownUps, cats: Math.max(known, 0)}, {levels: next.levelUps, cats: next.collection.length})
    known = next.collection.length
    knownUps = next.levelUps
    if (first) return
    if (grown) {
        showSay(`다 컸어요! ${esc(callName(before))}은(는) 도감에 올라갔어요. 새 고양이가 왔어요`, 7000)
        return
    }
    const got = SLOTS.find((slot) => cat.gear[slot] && !before.gear[slot])
    if (furniture.length) showSay(`방에 ${furniture.join(', ')}이(가) 생겼어요! (도감에서 볼 수 있어요)`, 5000)
    else if (got) showSay(`${gearName(got, cat.gear[got]!)}을(를) 얻었어요!`, 5000)
    else if (cat.level > before.level) {
        const stage = stageOf(cat.level)
        showSay(stage.id !== stageOf(before.level).id ? `${stage.name}이 됐어요!` : `레벨 ${cat.level}!`, 4000)
    }
}

void window.api.getState().then(apply)
window.api.onStateChanged(apply)

// ---- 마우스: 고양이 위에 올라가면 창이 클릭을 받고, 고양이는 멈춰서 쳐다본다 ----
let mouse: { x: number; y: number } | null = null
let hover = false
document.addEventListener('mousemove', (e) => void (mouse = {x: e.clientX, y: e.clientY}))
document.documentElement.addEventListener('mouseleave', () => void (mouse = null))

let b: Behavior = start(window.innerWidth / 2, Math.random)

// 개발 실행(npm run dev)에서만 테스트 경험치 버튼을 보여준다. main도 설치된 앱에서는 요청을 무시한다.
let overDev = false
if (import.meta.env.DEV) {
    dev.hidden = false
    dev.addEventListener('click', (e) => {
        const kind = (e.target as HTMLElement).dataset.xp
        if (kind === 'small' || kind === 'big') window.api.addTestXp(kind)
    })
}
let captured = false // 지금 창이 마우스 클릭을 받고 있는지

// 지난 프레임에 고양이가 그려진 화면 영역 (하트를 띄울 자리)
let catBox = {left: 0, width: 0, top: 0}

// 머리 근처에서 하트 몇 개가 떠오르다 사라진다
function hearts(): void {
    const headX = b.dir === 1 ? catBox.left + catBox.width - 18 : catBox.left + 18
    for (let i = 0; i < 4; i++) {
        const h = document.createElement('div')
        h.className = 'heart'
        h.textContent = '♥'
        h.style.left = `${headX + (Math.random() - 0.5) * 34}px`
        h.style.top = `${catBox.top + 4 + Math.random() * 10}px`
        h.style.animationDelay = `${i * 0.15}s`
        h.addEventListener('animationend', () => h.remove())
        document.body.append(h)
    }
}

document.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !hover) return
    if (b.action === 'sleep') {
        b = force(b, 'sit', Math.random) // 자고 있으면 깨우기만 한다
        return
    }
    b = force(b, 'happy', Math.random) // 쓰다듬으면 웃으면서 하트
    hearts()
    window.api.pet()
    if (sound) meow()
})
document.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    if (hover) window.api.openMenu()
})

function statusText(): string {
    const need = xpToNextLevel(cat.level)
    const title = cat.name ? `<b>${esc(cat.name)}</b> · ${coatName(cat.coat)}` : coatName(cat.coat)
    return `${title} · ${stageOf(cat.level).name} · Lv.${cat.level}<div class="bar"><i style="width:${Math.min(100, (cat.xp / need) * 100)}%"></i></div>${formatXp(cat.xp)} / ${need} · Lv.${HARVEST_LEVEL}에 다 커요`
}

// ---- 한 프레임 ----
let prev = performance.now()
let lastImage: HTMLCanvasElement | null = null

function frame(now: number): void {
    if (now - prev < FRAME_MS - 1) {
        requestAnimationFrame(frame)
        return
    }
    const dt = Math.min((now - prev) / 1000, 0.1) // 절전 복귀 등으로 시간이 튀어도 한 번에 멀리 가지 않게
    prev = now
    const stage = stageOf(cat.level)
    const mood: Mood = {
        excited: now - lastGainAt < EXCITED_MS && lastGainAt > 0,
        sleepy: isNight() || now - Math.max(lastGainAt, startedAt) > SLEEPY_MS,
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
    catBox = {left, width, top}

    const over = mouse !== null && mouse.x >= left - 6 && mouse.x <= left + width + 6 && mouse.y >= top - 6 && mouse.y <= window.innerHeight
    hover = over
    if (!dev.hidden && mouse) {
        const r = dev.getBoundingClientRect()
        overDev = mouse.x >= r.left && mouse.x <= r.right && mouse.y >= r.top && mouse.y <= r.bottom
    }
    if ((hover || overDev) !== captured) {
        captured = hover || overDev
        window.api.capture(captured)
    }

    if (hover && (b.action === 'walk' || b.action === 'run')) b = force(b, 'sit', Math.random)
    // 마우스를 올린 동안은 앉아서(또는 자면서) 가만히 있는다. 뛰는 중이면 끝까지 뛴다.
    // 웃기와 뛰기는 마우스를 올려 둬도 끝까지 한다
    b = hover && b.action !== 'leap' && b.action !== 'happy' ? b : step(b, dt, bounds, Math.random, mood)

    if (s.image !== lastImage) {
        lastImage = s.image
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
