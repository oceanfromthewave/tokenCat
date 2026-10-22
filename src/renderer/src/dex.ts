// 도감 화면: 지금 키우는 고양이, 품종별 발견 여부, 다 키운 기록.
import {COATS, HARVEST_LEVEL, SLOTS, coatName, gearName, stageOf, type CatState, type Completed, type Gear} from '../../shared/growth'
import {GRID_H, GRID_W} from '../../shared/sprites'
import type {AppState} from '../../preload/index'
import {spriteFor} from './draw'
import {mountRoom} from './room'
import {FURNITURE, unlockedAt} from '../../shared/room'

const SCALE = 2

document.title = 'Token Cat 도감'
document.documentElement.className = 'dex'
document.body.className = 'dex'
document.body.replaceChildren()

let latest: AppState | null = null

// 고양이 방: 한 번만 만들고 계속 움직인다. 아래 내용은 상태가 바뀔 때마다 다시 그린다.
const roomBox = document.createElement('section')
roomBox.className = 'room'
const roomCanvas = document.createElement('canvas')
const roomNote = document.createElement('p')
roomNote.className = 'muted'
roomBox.append(roomCanvas, roomNote)
const content = document.createElement('div')
document.body.append(roomBox, content)

// 태그 하나를 만든다. 내용은 textContent로만 넣어서 저장 파일 값이 HTML로 해석되지 않게 한다.
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag)
    if (className) e.className = className
    if (text) e.textContent = text
    return e
}

function catCanvas(cat: Pick<CatState, 'coat' | 'gear'> & { level?: number }, silhouette = false): HTMLCanvasElement {
    const c = el('canvas', 'cat')
    c.width = GRID_W
    c.height = GRID_H
    c.style.width = `${GRID_W * SCALE}px`
    c.style.height = `${GRID_H * SCALE}px`
    const stage = cat.level ? stageOf(cat.level).id : 'adult'
    c.getContext('2d')!.drawImage(spriteFor(stage, cat.coat, 'sit', 0, cat.gear, silhouette).image, 0, 0)
    return c
}

const gearText = (gear: Gear): string => SLOTS.filter((s) => gear[s]).map((s) => gearName(s, gear[s]!)).join(', ') || '소품 없음'
const day = (iso: string): string => iso.slice(0, 10)

// 다음에 생길 가구 안내
function nextFurniture(levelUps: number, cats: number): string {
    const has = unlockedAt({levels: levelUps, cats})
    const next = FURNITURE.find((f) => !has.includes(f))
    const count = `가구 ${has.length} / ${FURNITURE.length}`
    if (!next) return `${count} · 방을 다 꾸몄어요!`
    const need = 'levels' in next.unlock ? `레벨업 ${next.unlock.levels - levelUps}번 더` : `고양이 ${next.unlock.cats - cats}마리 더 키우면`
    return `${count} · 다음 가구: ${next.name} (${need})`
}

function render(state: AppState): void {
    const {cat, collection} = state
    latest = state
    roomNote.textContent = nextFurniture(state.levelUps, collection.length)
    const byCoat = new Map<string, Completed[]>()
    for (const c of collection) byCoat.set(c.coat, [...(byCoat.get(c.coat) ?? []), c])

    const head = el('header')
    head.append(el('h1', '', '도감'), el('p', 'sub', `찾은 품종 ${byCoat.size} / ${COATS.length} · 다 키운 고양이 ${collection.length}마리`))

    const now = el('section', 'now')
    const info = el('div')
    info.append(
        el('b', '', `${coatName(cat.coat)}`),
        el('p', '', `${stageOf(cat.level).name} · Lv.${cat.level} (Lv.${HARVEST_LEVEL}에 다 커요)`),
        el('p', 'muted', gearText(cat.gear))
    )
    now.append(el('h2', '', '지금 키우는 고양이'), catCanvas(cat), info)

    const grid = el('section', 'grid')
    for (const c of COATS) {
        const found = byCoat.get(c.id)
        const card = el('div', found ? 'card' : 'card locked')
        const last = found?.[found.length - 1]
        card.append(catCanvas(last ?? {coat: c.id, gear: {}}, !found), el('span', '', found ? c.name : '???'))
        if (found) card.append(el('small', '', `${found.length}마리`))
        grid.append(card)
    }

    const history = el('section', 'history')
    history.append(el('h2', '', '다 키운 기록'))
    if (!collection.length) history.append(el('p', 'muted', `아직 없어요. Lv.${HARVEST_LEVEL}까지 키우면 여기에 남아요.`))
    for (const c of [...collection].reverse()) history.append(el('p', '', `${day(c.completedAt)} · ${coatName(c.coat)} · ${gearText(c.gear)}`))

    content.replaceChildren(head, now, grid, history)
}

void window.api.getState().then((s) => {
    render(s)
    mountRoom(roomCanvas, () => ({cat: latest!.cat, levelUps: latest!.levelUps, cats: latest!.collection.length}))
})
window.api.onStateChanged(render)
