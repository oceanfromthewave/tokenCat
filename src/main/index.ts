import {app, BrowserWindow, dialog, ipcMain, Menu, net, Notification, powerMonitor, screen, shell, Tray} from 'electron'
import {autoUpdater} from 'electron-updater'
import {readFile, stat, writeFile} from 'fs/promises'
import {join} from 'path'
import {INITIAL_CAT, callName, cleanName, grantGear, harvestIfReady, newCat, type CatState, type Completed} from '../shared/growth'
import {EMPTY_SAVE, EMPTY_STATS, DEFAULT_SETTINGS, dateKey, mergeSettings, parseSave, recordXp, type Settings, type Stats} from '../shared/save'
import {TOKENS_PER_XP, applyUsage, type UsageRecord} from '../shared/usage'
import {RELEASES_API, isNewer, parseLatestRelease} from '../shared/version'
import {defaultClaudeRoot, defaultCodexRoot, scanClaudeLogs, scanCodexLogs, type Offsets} from './claudeLogs'
import {backupBeforeReset, loadSave, writeSave} from './store'
import {trayIcon} from './trayIcon'
import {watchFullscreen} from './fullscreen'

const TEST_PROVIDER = 'test'
const TEST_TOKENS = 30 * TOKENS_PER_XP // 테스트 1회당 30xp. 렌더러가 수치를 보내지 못하게 main에서 고정한다.
const WIN_H = 160 // 고양이 + 말풍선 + 뛰어오를 높이. 고양이가 없는 곳은 클릭이 그대로 통과한다.
const POLL_MS = 30_000

// 고양이 상태의 단일 출처. 렌더러는 IPC로 읽고 변경 알림을 받는다.
let cat: CatState = INITIAL_CAT
let collection: Completed[] = [] // 다 키워서 도감에 올린 고양이
let levelUps = 0 // 지금까지 오른 레벨 수 (방 가구)
let stats: Stats = EMPTY_STATS // 쓰다듬은 횟수, 날짜별 경험치
let userHidden = false // 트레이에서 고양이를 숨겼는지
let fullscreenNow = false // 맨 앞 창이 전체화면인지
let processed: string[] = []
let logOffsets: Offsets | null = null
let settings: Settings = DEFAULT_SETTINGS
let win: BrowserWindow | null = null
let tray: Tray | null = null
let dexWin: BrowserWindow | null = null
let askedVersion: string | null = null // 이번 실행에서 이미 물어본 버전 (같은 버전을 반복해서 묻지 않는다)

function persist(): void {
    writeSave({cat, collection, levelUps, stats, processed, settings, logOffsets})
}

// 고양이가 걸을 모니터: 설정에서 고른 모니터, 없으면(뽑혔거나 고르지 않음) 주 모니터
const catDisplay = (): Electron.Display => screen.getAllDisplays().find((d) => d.id === settings.displayId) ?? screen.getPrimaryDisplay()

// 작업표시줄 바로 위, 그 모니터 작업 영역의 가로 전체. (작업표시줄이 어디에 있든 작업 영역 아래쪽을 따라간다)
const stripBounds = (): Electron.Rectangle => {
    const wa = catDisplay().workArea
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

const getState = (): { cat: CatState; collection: Completed[]; levelUps: number; stats: Stats; sound: boolean } => ({cat, collection, levelUps, stats, sound: settings.sound})

// 고양이를 보일지: 트레이에서 숨기지 않았고, (설정이 켜져 있으면) 전체화면 앱이 없을 때
function applyVisibility(): void {
    if (!win || win.isDestroyed()) return
    const show = !userHidden && !(settings.hideFullscreen && fullscreenNow)
    if (show && !win.isVisible()) win.showInactive()
    else if (!show && win.isVisible()) win.hide()
}
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
    if (Notification.isSupported()) new Notification({title: '고양이가 다 컸어요!', body: `${callName(before)}이(가) 도감에 올라갔어요. 새 고양이가 왔어요.`}).show()
    return true
}

// 도감 창. 다 키운 고양이와 찾은 품종을 보여준다.
function openDex(): void {
    if (dexWin) {
        dexWin.focus()
        return
    }
    dexWin = new BrowserWindow({
        width: 580,
        height: 760,
        title: 'Token Cat 도감',
        autoHideMenuBar: true,
        webPreferences: {preload: join(__dirname, '../preload/index.js')}
    })
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (devUrl) void dexWin.loadURL(`${devUrl}#dex`)
    else void dexWin.loadFile(join(__dirname, '../renderer/index.html'), {hash: 'dex'})
    dexWin.on('closed', () => (dexWin = null))
    // 개발 확인용: TOKENCAT_SHOT=폴더 로 실행하면 도감을 위/아래 두 장 PNG로 저장한다 (설치 앱에서는 무시)
    const shot = !app.isPackaged && process.env.TOKENCAT_SHOT
    if (shot) {
        const w = dexWin
        w.webContents.once('did-finish-load', () => setTimeout(async () => {
            await writeFile(join(shot, 'dex-top.png'), (await w.webContents.capturePage()).toPNG())
            await w.webContents.executeJavaScript('window.scrollTo(0, 650)')
            await new Promise((r) => setTimeout(r, 300))
            await writeFile(join(shot, 'dex-mid.png'), (await w.webContents.capturePage()).toPNG())
            await w.webContents.executeJavaScript('window.scrollTo(0, document.body.scrollHeight)')
            await new Promise((r) => setTimeout(r, 300))
            await writeFile(join(shot, 'dex-end.png'), (await w.webContents.capturePage()).toPNG())
        }, 2500))
    }
}

// 사용 기록 반영의 유일한 입구. 실제 AI 연동부(adapter)도 이 함수로 기록을 넘긴다.
function ingestUsage(records: UsageRecord[]): void {
    const result = applyUsage(cat, processed, records)
    const changed = result.processed !== processed
    levelUps += Math.max(0, result.cat.level - cat.level)
    // 날짜별 기록에는 실제 사용량만 (테스트 경험치는 빼고)
    if (records.some((r) => r.provider !== TEST_PROVIDER)) stats = recordXp(stats, result.gainedXp, dateKey(new Date()))
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
    const toggle = (key: 'claude' | 'codex' | 'updateCheck' | 'sound' | 'hideFullscreen') => (item: Electron.MenuItem): void => {
        settings = mergeSettings(settings, {[key]: item.checked})
        persist()
        applyVisibility()
        send('state:changed', getState())
    }
    const primary = screen.getPrimaryDisplay().id
    const displays = screen.getAllDisplays().map((d, i): Electron.MenuItemConstructorOptions => ({
        label: `모니터 ${i + 1} (${d.size.width}x${d.size.height})${d.id === primary ? ' · 주 모니터' : ''}`,
        type: 'radio',
        checked: catDisplay().id === d.id,
        click: () => {
            settings = mergeSettings(settings, {displayId: d.id === primary ? null : d.id})
            persist()
            fitToTaskbar()
        }
    }))
    Menu.buildFromTemplate([
        {label: 'Claude Code 기록 읽기', type: 'checkbox', checked: settings.claude, click: toggle('claude')},
        {label: 'Codex 기록 읽기', type: 'checkbox', checked: settings.codex, click: toggle('codex')},
        {type: 'separator'},
        {label: '도감 열기', click: openDex},
        {type: 'separator'},
        {label: '쓰다듬으면 야옹 소리', type: 'checkbox', checked: settings.sound, click: toggle('sound')},
        {label: '전체화면일 때 숨기기', type: 'checkbox', checked: settings.hideFullscreen, click: toggle('hideFullscreen')},
        ...(displays.length > 1 ? [{label: '고양이가 걸을 모니터', submenu: displays}] : []),
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
        userHidden = !userHidden
        applyVisibility()
    }
    tray.on('click', toggle)
    tray.on('right-click', () => tray?.popUpContextMenu(Menu.buildFromTemplate([
        {label: userHidden ? '고양이 보이기' : '고양이 숨기기', click: toggle},
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

// 쓰다듬기(클릭) 횟수. 작업표시줄 고양이 창에서 온 것만 센다.
ipcMain.on('cat:pet', (e) => {
    if (e.sender !== win?.webContents) return
    stats = {...stats, pets: stats.pets + 1}
    persist()
    send('state:changed', getState())
})

// 이름 짓기 (도감 창에서만). 비우면 이름을 지운다.
ipcMain.handle('cat:setName', (e, value: unknown) => {
    if (!dexWin || e.sender !== dexWin.webContents) return getState()
    const name = cleanName(value)
    const {name: _old, ...rest} = cat
    cat = name ? {...rest, name} : rest
    persist()
    send('state:changed', getState())
    return getState()
})

// 내보내기/불러오기: 고양이, 도감, 방, 기록, 설정을 파일 하나로. 위치는 사용자가 저장/열기 창에서 고른다.
// 불러오기는 이 PC의 로그 읽은 위치와 처리한 기록은 그대로 둬서, 같은 사용 기록이 다시 경험치가 되지 않는다.
const MAX_IMPORT_BYTES = 2 * 1024 * 1024
type DataResult = 'saved' | 'loaded' | 'canceled' | 'error'

ipcMain.handle('data:export', async (e): Promise<DataResult> => {
    if (!dexWin || e.sender !== dexWin.webContents) return 'error'
    try {
        const {canceled, filePath} = await dialog.showSaveDialog(dexWin, {
            title: '데이터 내보내기',
            defaultPath: join(app.getPath('documents'), `TokenCat-backup-${dateKey(new Date())}.json`),
            filters: [{name: 'JSON', extensions: ['json']}]
        })
        if (canceled || !filePath) return 'canceled'
        const data = {app: 'tokencat', format: 1, exportedAt: new Date().toISOString(), cat, collection, levelUps, stats, settings}
        await writeFile(filePath.toLowerCase().endsWith('.json') ? filePath : filePath + '.json', JSON.stringify(data, null, 1))
        return 'saved'
    } catch (err) {
        console.error('내보내기 실패:', err instanceof Error ? err.message : err)
        return 'error'
    }
})

ipcMain.handle('data:import', async (e): Promise<DataResult> => {
    if (!dexWin || e.sender !== dexWin.webContents) return 'error'
    try {
        const {canceled, filePaths} = await dialog.showOpenDialog(dexWin, {title: '데이터 불러오기', properties: ['openFile'], filters: [{name: 'JSON', extensions: ['json']}]})
        if (canceled || !filePaths[0]) return 'canceled'
        if ((await stat(filePaths[0])).size > MAX_IMPORT_BYTES) return 'error'
        const raw = JSON.parse(await readFile(filePaths[0], 'utf8'))
        if (raw?.app !== 'tokencat') return 'error'
        // 저장 파일과 같은 검증을 거친다. 이 PC의 처리 기록/읽은 위치는 넣지 않는다.
        const data = parseSave(JSON.stringify({...raw, processed: [], logOffsets: null}))
        if (data === EMPTY_SAVE) return 'error'
        const {response} = await dialog.showMessageBox(dexWin, {
            type: 'warning',
            title: '데이터 불러오기',
            message: '지금 데이터를 불러온 데이터로 바꿀까요?',
            detail: '지금 키우는 고양이, 도감, 방, 기록, 설정이 모두 바뀌어요. 필요하면 먼저 내보내기를 해 두세요.',
            buttons: ['바꾸기', '취소'],
            defaultId: 1,
            cancelId: 1
        })
        if (response !== 0) return 'canceled'
        cat = data.cat
        collection = data.collection
        levelUps = data.levelUps
        stats = data.stats
        settings = data.settings
        settle()
        tray?.setImage(trayIcon(cat.coat))
        persist()
        fitToTaskbar()
        applyVisibility()
        send('state:changed', getState())
        return 'loaded'
    } catch (err) {
        console.error('불러오기 실패:', err instanceof Error ? err.message : err)
        return 'error'
    }
})

// 처음부터 다시 시작: 고양이, 도감, 방 가구를 지우고 새 아기 고양이로 시작한다. 설정과 로그 읽은 위치는 그대로 둔다.
// 읽은 위치를 유지하므로 지금까지의 사용 기록이 다시 경험치가 되지 않는다. 지우기 전에 저장 파일을 백업한다.
ipcMain.handle('data:reset', async (e): Promise<'reset' | 'canceled' | 'error'> => {
    if (!dexWin || e.sender !== dexWin.webContents) return 'error'
    try {
        const {response} = await dialog.showMessageBox(dexWin, {
            type: 'warning',
            title: '처음부터 다시 시작',
            message: '처음부터 다시 시작할까요?',
            detail: '지금 키우는 고양이, 도감, 방 가구가 모두 지워지고 새 아기 고양이부터 시작해요. 지금 데이터는 save.before-reset.json 파일로 백업해 둬요.',
            buttons: ['초기화', '취소'],
            defaultId: 1,
            cancelId: 1
        })
        if (response !== 0) return 'canceled'
        persist() // 백업에 최신 상태가 들어가도록 먼저 저장
        backupBeforeReset()
        cat = newCat()
        collection = []
        levelUps = 0
        stats = EMPTY_STATS
        tray?.setImage(trayIcon(cat.coat))
        persist()
        send('state:changed', getState())
        return 'reset'
    } catch (err) {
        console.error('초기화 실패:', err instanceof Error ? err.message : err)
        return 'error'
    }
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
        collection = save.collection
        levelUps = save.levelUps
        stats = save.stats
        settle() // 저장된 레벨에 맞는 소품을 주고, 이미 다 컸으면 도감에 올린다
        createWindow()
        createTray()
        if (!app.isPackaged && process.env.TOKENCAT_DEX) openDex() // 개발 확인용: 실행하자마자 도감 열기
        screen.on('display-added', fitToTaskbar)
        screen.on('display-removed', fitToTaskbar)
        screen.on('display-metrics-changed', fitToTaskbar)
        setInterval(fitToTaskbar, 3000) // 작업표시줄을 옮기거나 자동 숨김을 바꾼 경우를 놓치지 않게
        const watcher = watchFullscreen((full) => {
            fullscreenNow = full
            applyVisibility()
        })
        app.on('will-quit', () => watcher?.kill())
        pollLogs()
        setInterval(pollLogs, POLL_MS)
        setTimeout(() => void checkForUpdate(false), 15_000) // 시작 직후에는 고양이가 자리 잡도록 잠깐 기다린다
        setInterval(() => void checkForUpdate(false), 60 * 60 * 1000) // 켜 둔 채로도 한 시간 안에 새 버전을 알 수 있게
        powerMonitor.on('resume', () => setTimeout(() => void checkForUpdate(false), 15_000)) // 절전에서 깨어나면 한 번 확인 (네트워크가 붙을 시간을 둔다)
    })
}

app.on('window-all-closed', () => app.quit())
