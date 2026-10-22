import {app} from 'electron'
import {copyFileSync, existsSync, readFileSync, renameSync, writeFileSync} from 'fs'
import {join} from 'path'
import {EMPTY_SAVE, parseSave, type SaveData} from '../shared/save'

const savePath = (): string => join(app.getPath('userData'), 'save.json')
const backupPath = (): string => savePath() + '.bak'

const tryLoad = (path: string): SaveData | null => {
    try {
        const data = parseSave(readFileSync(path, 'utf8'))
        return data === EMPTY_SAVE ? null : data // 형식이 잘못되면 null
    } catch {
        return null
    }
}

// 저장 파일을 읽는다. 파일이 깨졌으면 시작할 때 만들어 둔 백업(.bak)으로 복구한다. 둘 다 없거나 깨졌으면 새로 시작.
export function loadSave(): SaveData {
    const main = tryLoad(savePath())
    if (main) {
        try {
            copyFileSync(savePath(), backupPath()) // 정상으로 읽힌 저장 파일을 백업해 둔다
        } catch (e) {
            console.error('백업 실패:', e instanceof Error ? e.message : e)
        }
        return main
    }
    if (existsSync(savePath())) {
        const backup = tryLoad(backupPath())
        if (backup) {
            console.error('저장 파일이 깨져서 백업에서 복구했어요')
            return backup
        }
    }
    return EMPTY_SAVE // 첫 실행 등
}

// 임시 파일에 쓴 뒤 이름을 바꿔서, 쓰는 도중 종료돼도 기존 저장 파일이 깨지지 않게 한다.
export function writeSave(data: SaveData): void {
    try {
        const tmp = savePath() + '.tmp'
        writeFileSync(tmp, JSON.stringify(data))
        renameSync(tmp, savePath())
    } catch (e) {
        console.error('저장 실패:', e instanceof Error ? e.message : e)
    }
}

// 초기화하기 전에 지금 저장 파일을 따로 복사해 둔다. (실수로 눌러도 이 파일 이름을 save.json으로 바꾸면 되돌릴 수 있다)
export function backupBeforeReset(): void {
    copyFileSync(savePath(), join(app.getPath('userData'), 'save.before-reset.json'))
}
