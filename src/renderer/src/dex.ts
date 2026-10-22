// 도감 화면: 고양이 방, 지금 키우는 고양이, 품종 도감(흔한 정도별), 다 키운 기록, 초기화.
import {COATS, GEAR_LEVEL, HARVEST_LEVEL, RARITY_NAME, SLOTS, STAGES, coatName, formatXp, gearName, rarityOf, stageOf, xpToNextLevel, type CatState, type Completed, type Gear, type Rarity, type Slot} from '../../shared/growth'
import {GRID_H, GRID_W} from '../../shared/sprites'
import {FURNITURE, unlockedAt} from '../../shared/room'
import type {AppState} from '../../preload/index'
import {spriteFor} from './draw'
import {mountRoom} from './room'

document.title = 'Token Cat 도감'
document.documentElement.className = 'dex'
document.body.className = 'dex'
document.body.replaceChildren()

// 태그 하나를 만든다. 내용은 textContent로만 넣어서 저장 파일 값이 HTML로 해석되지 않게 한다.
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag)
    if (className) e.className = className
    if (text) e.textContent = text
    return e
}

function catCanvas(cat: Pick<CatState, 'coat' | 'gear'> & { level?: number }, scale: number, silhouette = false, frame = 0): HTMLCanvasElement {
    const c = el('canvas', 'cat')
    c.width = GRID_W
    c.height = GRID_H
    c.style.width = `${GRID_W * scale}px`
    c.style.height = `${GRID_H * scale}px`
    const stage = cat.level ? stageOf(cat.level).id : 'adult'
    c.getContext('2d')!.drawImage(spriteFor(stage, cat.coat, 'sit', frame, cat.gear, silhouette).image, 0, 0)
    return c
}

// 막대 하나 (0~1)
function bar(ratio: number, label: string): HTMLElement {
    const wrap = el('div', 'meter')
    const fill = el('i')
    fill.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`
    const track = el('div', 'track')
    track.append(fill)
    wrap.append(track, el('small', '', label))
    return wrap
}

const SLOT_NAME: Record<Slot, string> = {neck: '목', tail: '꼬리', head: '머리'}
const gearText = (gear: Gear): string => SLOTS.filter((s) => gear[s]).map((s) => gearName(s, gear[s]!)).join(', ') || '소품 없음'
const day = (iso: string): string => iso.slice(0, 10)

// ---- 고정된 틀: 방은 한 번만 만들고 계속 움직인다. 나머지는 상태가 바뀔 때마다 다시 그린다. ----
let latest: AppState | null = null

const banner = el('header', 'banner')
const roomBox = el('section', 'panel room')
const roomCanvas = el('canvas')
const furnitureList = el('div', 'furniture')
roomBox.append(el('h2', '', '고양이 방'), roomCanvas, furnitureList)
const content = el('div')
const settingsBox = el('section', 'panel settings')
const resetNote = el('p', 'muted')
const resetBtn = el('button', 'danger', '처음부터 다시 시작')
resetBtn.addEventListener('click', async () => {
    resetBtn.disabled = true
    const r = await window.api.resetData()
    resetBtn.disabled = false
    resetNote.textContent = r === 'reset' ? '새 아기 고양이와 다시 시작했어요. 예전 데이터는 save.before-reset.json에 백업했어요.' : r === 'error' ? '초기화하지 못했어요.' : ''
})
settingsBox.append(
    el('h2', '', '설정'),
    el('p', 'muted', '고양이, 도감, 방 가구를 모두 지우고 새로 시작해요. 지금까지 쓴 토큰은 다시 경험치가 되지 않아요.'),
    resetBtn,
    resetNote
)
document.body.append(banner, roomBox, content, settingsBox)

function renderBanner({cat, collection, levelUps}: AppState): void {
    const found = new Set(collection.map((c) => c.coat)).size
    const chips = el('div', 'chips')
    for (const [label, value] of [
        ['찾은 품종', `${found} / ${COATS.length}`],
        ['다 키운 고양이', `${collection.length}마리`],
        ['방 가구', `${unlockedAt({levels: levelUps, cats: collection.length}).length} / ${FURNITURE.length}`],
        ['지금', `${stageOf(cat.level).name} Lv.${cat.level}`]
    ]) {
        const chip = el('div', 'chip')
        chip.append(el('small', '', label), el('b', '', value))
        chips.append(chip)
    }
    banner.replaceChildren(el('h1', '', 'Token Cat 도감'), el('p', 'sub', 'AI를 쓸수록 자라는 고양이들의 기록'), chips)
}

function renderFurniture(levelUps: number, cats: number): void {
    const has = unlockedAt({levels: levelUps, cats})
    furnitureList.replaceChildren(...FURNITURE.map((f) => {
        const open = has.includes(f)
        const need = 'levels' in f.unlock ? `레벨업 ${f.unlock.levels}번` : `${f.unlock.cats}마리 키우기`
        const item = el('div', open ? 'item' : 'item locked')
        item.append(el('b', '', open ? f.name : '???'), el('small', '', open ? '있어요' : need))
        return item
    }))
}

function renderNow(cat: CatState): HTMLElement {
    const box = el('section', 'panel now')
    const need = xpToNextLevel(cat.level)
    const pic = el('div', 'pic')
    pic.append(catCanvas(cat, 3))
    const info = el('div', 'info')
    info.append(
        el('span', `badge ${rarityOf(cat.coat)}`, RARITY_NAME[rarityOf(cat.coat)]),
        el('h3', '', coatName(cat.coat)),
        el('p', '', `${stageOf(cat.level).name} · Lv.${cat.level}`),
        bar(cat.xp / need, `다음 레벨까지 ${formatXp(cat.xp)} / ${need}`),
        bar((cat.level - 1) / (HARVEST_LEVEL - 1), `다 크기까지 Lv.${cat.level} / ${HARVEST_LEVEL}`)
    )
    // 성장 단계 표시
    const stages = el('div', 'stages')
    for (const s of STAGES) stages.append(el('span', cat.level >= s.minLevel ? 'on' : '', `${s.name} Lv.${s.minLevel}`))
    // 소품 칸
    const slots = el('div', 'slots')
    for (const slot of SLOTS) {
        const id = cat.gear[slot]
        const cell = el('div', id ? 'slot on' : 'slot')
        cell.append(el('small', '', `${SLOT_NAME[slot]} · Lv.${GEAR_LEVEL[slot]}`), el('b', '', id ? gearName(slot, id) : '아직 없어요'))
        slots.append(cell)
    }
    info.append(stages, slots)
    box.append(el('h2', '', '지금 키우는 고양이'), pic, info)
    // 앉아서 꼬리를 살랑이게 두 장을 번갈아 그린다
    let f = 0
    const timer = setInterval(() => {
        if (!box.isConnected) return clearInterval(timer)
        f = 1 - f
        pic.replaceChildren(catCanvas(cat, 3, false, f))
    }, 700)
    return box
}

function renderBook(collection: Completed[]): HTMLElement {
    const byCoat = new Map<string, Completed[]>()
    for (const c of collection) byCoat.set(c.coat, [...(byCoat.get(c.coat) ?? []), c])
    const box = el('section', 'panel book')
    box.append(el('h2', '', '품종 도감'))
    const groups: [Rarity, string][] = [['common', '코리안 숏헤어'], ['uncommon', '품종묘'], ['rare', '희귀 품종']]
    for (const [rarity, title] of groups) {
        const list = COATS.filter((c) => rarityOf(c.id) === rarity)
        const got = list.filter((c) => byCoat.has(c.id)).length
        box.append(el('h3', '', `${title} · ${RARITY_NAME[rarity]}  (${got} / ${list.length})`))
        const grid = el('div', 'grid')
        for (const c of list) {
            const found = byCoat.get(c.id)
            const last = found?.[found.length - 1]
            const card = el('div', `card ${rarity}${found ? '' : ' locked'}`)
            card.append(catCanvas(last ?? {coat: c.id, gear: {}}, 2, !found), el('span', '', found ? c.name.replace(/^코리안 숏헤어 \((.*)\)$/, '$1') : '???'))
            if (found) card.append(el('small', '', `${found.length}마리 · 처음 ${day(found[0].completedAt)}`))
            grid.append(card)
        }
        box.append(grid)
    }
    return box
}

function renderHistory(collection: Completed[]): HTMLElement {
    const box = el('section', 'panel history')
    box.append(el('h2', '', '다 키운 기록'))
    if (!collection.length) box.append(el('p', 'muted', `아직 없어요. Lv.${HARVEST_LEVEL}까지 키우면 여기에 남아요.`))
    for (const c of [...collection].reverse()) {
        const row = el('div', 'row')
        const text = el('div')
        text.append(el('b', '', coatName(c.coat)), el('small', '', `${day(c.completedAt)} · ${gearText(c.gear)}`))
        row.append(catCanvas(c, 1), text)
        box.append(row)
    }
    return box
}

function render(state: AppState): void {
    latest = state
    renderBanner(state)
    renderFurniture(state.levelUps, state.collection.length)
    content.replaceChildren(renderNow(state.cat), renderBook(state.collection), renderHistory(state.collection))
}

void window.api.getState().then((s) => {
    render(s)
    mountRoom(roomCanvas, () => ({cat: latest!.cat, levelUps: latest!.levelUps, cats: latest!.collection.length}))
})
window.api.onStateChanged(render)
