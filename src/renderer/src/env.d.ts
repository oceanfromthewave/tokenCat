/// <reference types="vite/client" />
import type {CatApi} from '../../preload/index'

declare global {
    interface Window {
        api: CatApi
    }
}
