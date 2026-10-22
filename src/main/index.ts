import {app, BrowserWindow, ipcMain, Menu, screen, Tray} from 'electron'
import {join} from 'path'
import {INITIAL_CAT, newCat, type CatState} from '../shared/growth'
import {EMPTY_SAVE, DEFAULT_SETTINGS, mergeSettings, type Settings} from '../shared/save'
import {TOKENS_PER_XP, applyUsage, type UsageRecord} from '../shared/usage'
import {defaultClaudeRoot, defaultCodexRoot, scanClaudeLogs, scanCodexLogs, type Offsets} from './claudeLogs'
import {loadSave, writeSave} from './store'
import {trayIcon} from './trayIcon'

const TEST_PROVIDER = 'test'
const TEST_TOKENS = 30 * TOKENS_PER_XP // 테스트 1회당 30xp. 렌더러가 수치를 보내지 못하게 main에서 고정한다.
const WIN_H = 220 // 고양이 + 말풍선 + 뛰어오를 높이. 고양이가 없는 곳은 클릭이 그대로 통과한다.
const POLL_MS = 30_000

// 고양이 상태의 단일 출처. 렌더러는 IPC로 읽고 변경 알림을 받는다.
let cat: CatState = INITIAL_CAT
let processed: string[] = []
let logOffsets: Offsets | null = null
let settings: Settings = DEFAULT_SETTINGS
let win: BrowserWindow | null = null
let tray: Tray | null = null

function persist(): void {
    writeSave({cat, processed, settings, logOffsets})
}

// 작업표시줄 바로 위, 주 모니터 작업 영역의 가로 전체. (작업표시줄이 어디에 있든 작업 영역 아래쪽을 따라간다)
const stripBounds = (): Electron.Rectangle => {
    const wa = screen.getPrimaryDisplay().workArea
    return {x: wa.x, y: wa.y + wa.height - WIN_H, width: wa.width, height: WIN_H}
}

function createWindow(): void {
    win = new BrowserWindow({
        ...stripBounds(),
        frame: false,
        transparent: true,
        resizable: false,
        movable: false,
        focusable: false, // 클릭해도 다른 창의 포커스를 빼앗지 않는다
        skipTaskbar: true,
        hasShadow: false,
        alwaysOnTop: true,
        webPreferences: {preload: join(__dirname, '../preload/index.js')}
    })
    // 평소에는 마우스가 창을 통과한다. 마우스 움직임만 전달받아 고양이 위에 올라갔을 때 renderer가 capture를 켠다.
    win.setIgnoreMouseEvents(true, {forward: true})
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (devUrl) void win.loadURL(devUrl)
    else void win.loadFile(join(__dirname, '../renderer/index.html'))
    win.on('closed', () => {
        win = null
        app.quit()
    })
}

// 작업표시줄 크기/위치나 모니터가 바뀌면 다시 맞춘다.
function fitToTaskbar(): void {
    if (!win || win.isDestroyed()) return
    const b = stripBounds(), cur = win.getBounds()
    if (b.x !== cur.x || b.y !== cur.y || b.width !== cur.width || b.height !== cur.height) win.setBounds(b)
}

const getState = (): { cat: CatState } => ({cat})
const send = (channel: string, payload: unknown): void => win?.webContents.send(channel, payload)

// 사용 기록 반영의 유일한 입구. 실제 AI 연동부(adapter)도 이 함수로 기록을 넘긴다.
function ingestUsage(records: UsageRecord[]): void {
    const result = applyUsage(cat, processed, records)
    const changed = result.processed !== processed
    cat = result.cat
    processed = result.processed
    persist() // 읽은 위치(logOffsets)도 함께 저장된다
    if (changed) send('state:changed', {...getState(), gainedXp: result.gainedXp})
}

// 이 폴더의 로그를 이미 한 번 확인(기준선을 저장)했는지. 도구별로 따로 판단해서, 나중에 지원하게 된 도구도
// 첫 확인 때는 과거 기록을 보상하지 않고 기준선만 잡는다.
const hasBaseline = (offsets: Offsets, root: string): boolean => Object.keys(offsets).some((p) => p.startsWith(root))

// Claude Code와 Codex 로그에서 새 사용 기록을 읽어 반영한다. 첫 확인은 기준선만 잡고 과거 기록은 보상하지 않는다.
function pollLogs(): void {
    try {
        const first = logOffsets === null
        const known = logOffsets ?? {}
        const claudeRoot = defaultClaudeRoot(), codexRoot = defaultCodexRoot()
        const claude = scanClaudeLogs(claudeRoot, hasBaseline(known, claudeRoot) ? known : null)
        const codex = scanCodexLogs(codexRoot, hasBaseline(known, codexRoot) ? known : null)
        // 꺼 둔 도구의 기록은 읽은 위치만 앞으로 보내고 버린다. (다시 켰을 때 그동안의 기록이 한꺼번에 들어오지 않게)
        const records = [...(settings.claude ? claude.records : []), ...(settings.codex ? codex.records : [])]
        const newBaseline =
            (!hasBaseline(known, claudeRoot) && Object.keys(claude.offsets).length > 0) ||
            (!hasBaseline(known, codexRoot) && Object.keys(codex.offsets).length > 0)
        logOffsets = {...claude.offsets, ...codex.offsets}
        if (first || records.length > 0 || newBaseline) ingestUsage(records)
    } catch (err) {
        // 내용은 담지 않고 짧은 설명만 남긴다 (프롬프트 등이 섞여 나오지 않게)
        console.error('로그 읽기 실패:', err instanceof Error ? err.message : err)
    }
}

function showMenu(): void {
    if (!win) return
    const toggle = (key: 'claude' | 'codex') => (item: Electron.MenuItem): void => {
        settings = mergeSettings(settings, {[key]: item.checked})
        persist()
    }
    Menu.buildFromTemplate([
        {label: 'Claude Code 기록 읽기', type: 'checkbox', checked: settings.claude, click: toggle('claude')},
        {label: 'Codex 기록 읽기', type: 'checkbox', checked: settings.codex, click: toggle('codex')},
        {type: 'separator'},
        {
            label: 'Windows 시작 시 자동 실행',
            type: 'checkbox',
            checked: app.getLoginItemSettings().openAtLogin,
            enabled: app.isPackaged, // 개발 모드(npm run dev)에서는 등록하지 않는다
            click: (item) => app.setLoginItemSettings({openAtLogin: item.checked})
        },
        ...(app.isPackaged ? [] : [{label: '테스트 경험치 +30 (개발 전용)', click: addTestXp}]),
        {type: 'separator'},
        {label: '종료', click: () => app.quit()}
    ]).popup({window: win})
}

function addTestXp(): void {
    if (app.isPackaged) return // 설치된 앱에서는 막는다
    ingestUsage([{
        id: `test-${Date.now()}-${Math.random()}`,
        provider: TEST_PROVIDER,
        occurredAt: new Date().toISOString(),
        totalTokens: TEST_TOKENS,
        source: 'test-menu',
        confidence: 'exact'
    }])
}

function createTray(): void {
    tray = new Tray(trayIcon(cat.coat))
    tray.setToolTip('Token Cat')
    const toggle = (): void => {
        if (!win) return
        if (win.isVisible()) win.hide()
        else win.showInactive()
    }
    tray.on('click', toggle)
    tray.on('right-click', () => tray?.popUpContextMenu(Menu.buildFromTemplate([
        {label: win?.isVisible() ? '고양이 숨기기' : '고양이 보이기', click: toggle},
        {type: 'separator'},
        {label: '종료', click: () => app.quit()}
    ])))
}

ipcMain.handle('state:get', getState)
// renderer가 고양이 위에 마우스가 올라갔는지 알려주면 그때만 클릭을 받는다. 이 창에서 온 요청만 받는다.
ipcMain.on('cat:capture', (e, on: unknown) => {
    if (e.sender !== win?.webContents || typeof on !== 'boolean') return
    if (on) win.setIgnoreMouseEvents(false)
    else win.setIgnoreMouseEvents(true, {forward: true})
})
ipcMain.on('cat:menu', (e) => {
    if (e.sender === win?.webContents) showMenu()
})

// 이미 실행 중이면 새로 띄우지 않는다 (고양이가 두 마리가 되지 않게)
if (!app.requestSingleInstanceLock()) {
    app.quit()
} else {
    app.whenReady().then(() => {
        const save = loadSave()
        cat = save === EMPTY_SAVE ? newCat() : save.cat // 첫 실행(또는 저장 파일 없음/손상)은 무작위 털 무늬
        settings = save.settings
        processed = save.processed
        logOffsets = save.logOffsets
        createWindow()
        createTray()
        screen.on('display-added', fitToTaskbar)
        screen.on('display-removed', fitToTaskbar)
        screen.on('display-metrics-changed', fitToTaskbar)
        setInterval(fitToTaskbar, 3000) // 작업표시줄을 옮기거나 자동 숨김을 바꾼 경우를 놓치지 않게
        pollLogs()
        setInterval(pollLogs, POLL_MS)
    })
}

app.on('window-all-closed', () => app.quit())
