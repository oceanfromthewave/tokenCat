import {contextBridge, ipcRenderer} from 'electron'
import type {CatState, Completed} from '../shared/growth'
import type {Stats} from '../shared/save'

export interface AppState {
    cat: CatState
    collection: Completed[] // 다 키워서 도감에 올린 고양이
    levelUps: number // 지금까지 오른 레벨 수 (방 가구)
    stats: Stats // 쓰다듬은 횟수, 날짜별 경험치
    sound: boolean // 쓰다듬으면 야옹 소리를 낼지
    gainedXp?: number // 이번 변경으로 얻은 경험치 (알림 표시용)
}

// 렌더러에 노출할 기능은 여기 적힌 것뿐이다. (ipcRenderer 자체는 노출하지 않는다)
const api = {
    getState: (): Promise<AppState> => ipcRenderer.invoke('state:get'),
    onStateChanged: (cb: (state: AppState) => void): (() => void) => {
        const handler = (_: unknown, state: AppState): void => cb(state)
        ipcRenderer.on('state:changed', handler)
        return () => ipcRenderer.removeListener('state:changed', handler)
    },
    // 고양이 위에 마우스가 있을 때만 창이 클릭을 받는다
    capture: (on: boolean): void => ipcRenderer.send('cat:capture', on),
    openMenu: (): void => ipcRenderer.send('cat:menu'),
    openDex: (): void => ipcRenderer.send('dex:open'),
    resetData: (): Promise<'reset' | 'canceled' | 'error'> => ipcRenderer.invoke('data:reset'),
    exportData: (): Promise<'saved' | 'canceled' | 'error'> => ipcRenderer.invoke('data:export'),
    importData: (): Promise<'loaded' | 'canceled' | 'error'> => ipcRenderer.invoke('data:import'),
    setName: (name: string): Promise<AppState> => ipcRenderer.invoke('cat:setName', name),
    pet: (): void => ipcRenderer.send('cat:pet'),
    // 개발 실행 전용 테스트 경험치 (양은 main이 정한다)
    addTestXp: (kind: 'small' | 'big'): void => ipcRenderer.send('cat:testXp', kind)
}

contextBridge.exposeInMainWorld('api', api)

export type CatApi = typeof api
