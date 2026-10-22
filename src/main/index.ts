import {app, BrowserWindow, dialog, ipcMain, Menu, net, Notification, powerMonitor, screen, shell, Tray} from 'electron'
import {autoUpdater} from 'electron-updater'
import {join} from 'path'
import {INITIAL_CAT, coatName, grantGear, harvestIfReady, newCat, type CatState, type Completed} from '../shared/growth'
import {EMPTY_SAVE, DEFAULT_SETTINGS, mergeSettings, type Settings} from '../shared/save'
import {TOKENS_PER_XP, applyUsage, type UsageRecord} from '../shared/usage'
import {RELEASES_API, isNewer, parseLatestRelease} from '../shared/version'
import {defaultClaudeRoot, defaultCodexRoot, scanClaudeLogs, scanCodexLogs, type Offsets} from './claudeLogs'
import {loadSave, writeSave} from './store'
import {trayIcon} from './trayIcon'

const TEST_PROVIDER = 'test'
const TEST_TOKENS = 30 * TOKENS_PER_XP // 테스트 1회당 30xp. 렌더러가 수치를 보내지 못하게 main에서 고정한다.
const WIN_H = 160 // 고양이 + 말풍선 + 뛰어오를 높이. 고양이가 없는 곳은 클릭이 그대로 통과한다.
const POLL_MS = 30_000

// 고양이 상태의 단일 출처. 렌더러는 IPC로 읽고 변경 알림을 받는다.
let cat: CatState = INITIAL_CAT
let collection: Completed[] = [] // 다 키워서 도감에 올린 고양이
let processed: string[] = []
let logOffsets: Offsets | null = null
let settings: Settings = DEFAULT_SETTINGS
let win: BrowserWindow | null = null
let tray: Tray | null = null
let dexWin: BrowserWindow | null = null
let askedVersion: string | null = null // 이번 실행에서 이미 물어본 버전 (같은 버전을 반복해서 묻지 않는다)

function persist(): void {
    writeSave({cat, collection, processed, settings, logOffsets})
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

const getState = (): { cat: CatState; collection: Completed[] } => ({cat, collection})
const send = (channel: string, payload: unknown): void => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send(channel, payload)
}

// 레벨에 맞는 소품을 주고, 다 컸으면 도감에 올린 뒤 새 고양이를 시작한다. 다 컸으면 true.
function settle(): boolean {
    cat = grantGear(cat)
    const before = cat
    const r = harvestIfReady(cat, collection, new Date().toISOString())
    if (r.cat === cat) return false
    cat = r.cat
    collection = r.collection
    tray?.setImage(trayIcon(cat.coat))
    if (Notification.isSupported()) new Notification({title: '고양이가 다 컸어요!', body: `${coatName(before.coat)}이(가) 도감에 올라갔어요. 새 고양이가 왔어요.`}).show()
    return true
}

// 도감 창. 다 키운 고양이와 찾은 품종을 보여준다.
function openDex(): void {
    if (dexWin) {
        dexWin.focus()
        return
    }
    dexWin = new BrowserWindow({
        width: 560,
        height: 680,
        title: 'Token Cat 도감',
        autoHideMenuBar: true,
        webPreferences: {preload: join(__dirname, '../preload/index.js')}
    })
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (devUrl) void dexWin.loadURL(`${devUrl}#dex`)
    else void dexWin.loadFile(join(__dirname, '../renderer/index.html'), {hash: 'dex'})
    dexWin.on('closed', () => (dexWin = null))
}

// 사용 기록 반영의 유일한 입구. 실제 AI 연동부(adapter)도 이 함수로 기록을 넘긴다.
function ingestUsage(records: UsageRecord[]): void {
    const result = applyUsage(cat, processed, records)
    const changed = result.processed !== processed
    cat = result.cat
    processed = result.processed
    const harvested = settle()
    persist() // 읽은 위치(logOffsets)도 함께 저장된다
    if (changed || harvested) send('state:changed', {...getState(), gainedXp: result.gainedXp})
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

// 새 버전을 내려받아 설치한다. 설치된 앱(패키지)에서만 동작하고, 개발 실행이나 실패 시에는 다운로드 페이지를 연다.
// 내려받기는 사용자가 [업데이트]를 눌렀을 때만 하고, 자동 설치도 하지 않는다. (무결성은 릴리스의 latest.yml 체크섬으로 확인)
let updating = false
async function downloadAndInstall(releaseUrl: string): Promise<void> {
    if (!app.isPackaged) {
        await shell.openExternal(releaseUrl)
        return
    }
    if (updating) return
    updating = true
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    const onProgress = (p: { percent: number }): void => tray?.setToolTip(`Token Cat ${Math.floor(p.percent)}%`)
    autoUpdater.on('download-progress', onProgress)
    try {
        new Notification({title: 'Token Cat', body: '새 버전을 내려받는 중이에요'}).show()
        const found = await autoUpdater.checkForUpdates()
        if (!found?.isUpdateAvailable) throw new Error('업데이트 정보를 찾지 못함')
        await autoUpdater.downloadUpdate()
        const {response} = await dialog.showMessageBox({
            type: 'info',
            title: 'Token Cat',
            message: '다운로드를 마쳤어요',
            detail: `지금 다시 시작하면 v${found.updateInfo.version} 설치가 끝나요. 저장된 고양이는 그대로예요.`,
            buttons: ['다시 시작하고 설치', '나중에'],
            defaultId: 0,
            cancelId: 1
        })
        if (response === 0) {
            persist()
            autoUpdater.quitAndInstall(true, true) // 조용히 설치하고 끝나면 다시 실행
        }
    } catch (err) {
        console.error('업데이트 설치 실패:', err instanceof Error ? err.message : err)
        const {response} = await dialog.showMessageBox({
            type: 'warning',
            title: 'Token Cat',
            message: '업데이트를 설치하지 못했어요',
            detail: '다운로드 페이지에서 설치 파일을 직접 받을 수 있어요.',
            buttons: ['다운로드 페이지 열기', '닫기'],
            defaultId: 0,
            cancelId: 1
        })
        if (response === 0) await shell.openExternal(releaseUrl)
    } finally {
        autoUpdater.off('download-progress', onProgress)
        tray?.setToolTip('Token Cat')
        updating = false
    }
}

// 새 버전 확인. GitHub의 '최신 릴리스' 정보만 받아오고(사용 기록 등은 보내지 않는다), 새 버전이면 물어본다.
async function checkForUpdate(manual: boolean): Promise<void> {
    if (!manual && !settings.updateCheck) return
    const current = app.getVersion()
    try {
        const res = await net.fetch(RELEASES_API, {
            headers: {'User-Agent': 'TokenCat', Accept: 'application/vnd.github+json'},
            signal: AbortSignal.timeout(8000)
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const latest = parseLatestRelease(await res.json())
        if (!latest) throw new Error('응답 형식이 올바르지 않음')

        if (!isNewer(latest.version, current)) {
            if (manual) await dialog.showMessageBox({type: 'info', title: 'Token Cat', message: '최신 버전을 쓰고 있어요', detail: `현재 v${current}`})
            return
        }
        if (!manual && latest.version === askedVersion) return // 자동 확인은 이미 물어본 버전을 다시 묻지 않는다
        askedVersion = latest.version

        const {response} = await dialog.showMessageBox({
            type: 'info',
            title: '새 버전이 있어요',
            message: `새 버전 v${latest.version}이 나왔어요. 업데이트 하시겠어요?`,
            detail: `현재 v${current}\n\n업데이트를 누르면 새 버전을 내려받아요. 설치 후 다시 시작해도 저장된 고양이는 그대로 유지돼요.`,
            buttons: ['업데이트', '나중에'],
            defaultId: 0,
            cancelId: 1
        })
        if (response === 0) await downloadAndInstall(latest.url) // parseLatestRelease가 우리 저장소의 릴리스 주소만 통과시킨다
    } catch (err) {
        console.error('업데이트 확인 실패:', err instanceof Error ? err.message : err)
        if (manual) await dialog.showMessageBox({type: 'warning', title: 'Token Cat', message: '업데이트를 확인하지 못했어요', detail: '인터넷 연결을 확인하고 잠시 뒤에 다시 시도해 주세요.'})
    }
}

function showMenu(): void {
    if (!win) return
    const toggle = (key: 'claude' | 'codex' | 'updateCheck') => (item: Electron.MenuItem): void => {
        settings = mergeSettings(settings, {[key]: item.checked})
        persist()
    }
    Menu.buildFromTemplate([
        {label: 'Claude Code 기록 읽기', type: 'checkbox', checked: settings.claude, click: toggle('claude')},
        {label: 'Codex 기록 읽기', type: 'checkbox', checked: settings.codex, click: toggle('codex')},
        {type: 'separator'},
        {label: '도감 열기', click: openDex},
        {type: 'separator'},
        {label: '업데이트 확인', click: () => void checkForUpdate(true)},
        {label: '새 버전 자동 확인', type: 'checkbox', checked: settings.updateCheck, click: toggle('updateCheck')},
        {
            label: 'Windows 시작 시 자동 실행',
            type: 'checkbox',
            checked: app.getLoginItemSettings().openAtLogin,
            enabled: app.isPackaged, // 개발 모드(npm run dev)에서는 등록하지 않는다
            click: (item) => app.setLoginItemSettings({openAtLogin: item.checked})
        },
        ...(app.isPackaged ? [] : [{label: '테스트 경험치 +30 (개발 전용)', click: () => addTestXp()}]),
        {type: 'separator'},
        {label: '종료', click: () => app.quit()}
    ]).popup({window: win})
}

function addTestXp(times = 1): void {
    if (app.isPackaged) return // 설치된 앱에서는 막는다
    ingestUsage([{
        id: `test-${Date.now()}-${Math.random()}`,
        provider: TEST_PROVIDER,
        occurredAt: new Date().toISOString(),
        totalTokens: TEST_TOKENS * times,
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
        {label: '도감 열기', click: openDex},
        {label: '업데이트 확인', click: () => void checkForUpdate(true)},
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
// 개발 실행 전용 테스트 버튼. 양은 렌더러가 아니라 여기서 정한다.
ipcMain.on('cat:testXp', (e, kind: unknown) => {
    if (e.sender !== win?.webContents || app.isPackaged) return
    if (kind === 'small' || kind === 'big') addTestXp(kind === 'big' ? 10 : 1)
})
ipcMain.on('dex:open', openDex)
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
        collection = save.collection
        settle() // 저장된 레벨에 맞는 소품을 주고, 이미 다 컸으면 도감에 올린다
        createWindow()
        createTray()
        screen.on('display-added', fitToTaskbar)
        screen.on('display-removed', fitToTaskbar)
        screen.on('display-metrics-changed', fitToTaskbar)
        setInterval(fitToTaskbar, 3000) // 작업표시줄을 옮기거나 자동 숨김을 바꾼 경우를 놓치지 않게
        pollLogs()
        setInterval(pollLogs, POLL_MS)
        setTimeout(() => void checkForUpdate(false), 15_000) // 시작 직후에는 고양이가 자리 잡도록 잠깐 기다린다
        setInterval(() => void checkForUpdate(false), 60 * 60 * 1000) // 켜 둔 채로도 한 시간 안에 새 버전을 알 수 있게
        powerMonitor.on('resume', () => setTimeout(() => void checkForUpdate(false), 15_000)) // 절전에서 깨어나면 한 번 확인 (네트워크가 붙을 시간을 둔다)
    })
}

app.on('window-all-closed', () => app.quit())
