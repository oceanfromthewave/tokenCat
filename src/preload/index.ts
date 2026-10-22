import {contextBridge, ipcRenderer} from 'electron'
import type {CatState} from '../shared/growth'

export interface AppState {
    cat: CatState
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
    openMenu: (): void => ipcRenderer.send('cat:menu')
}

contextBridge.exposeInMainWorld('api', api)

export type CatApi = typeof api
