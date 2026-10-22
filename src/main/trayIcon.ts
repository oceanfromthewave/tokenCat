import {nativeImage} from 'electron'
import type {CoatId} from '../shared/growth'
import {frameOf, paletteOf} from '../shared/sprites'

// 트레이 아이콘: 앉은 고양이 그림에서 얼굴 16x16 칸을 잘라서 쓴다. (이미지 파일을 따로 두지 않는다)
export function trayIcon(coat: CoatId): Electron.NativeImage {
    const rows = frameOf('adult', coat, 'sit', 0)
    const palette = paletteOf(coat)
    const buf = Buffer.alloc(16 * 16 * 4)
    for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
            const color = palette[rows[1 + y][19 + x]]
            if (!color) continue
            const i = (y * 16 + x) * 4
            buf[i] = parseInt(color.slice(5, 7), 16) // B
            buf[i + 1] = parseInt(color.slice(3, 5), 16) // G
            buf[i + 2] = parseInt(color.slice(1, 3), 16) // R
            buf[i + 3] = 255
        }
    }
    return nativeImage.createFromBitmap(buf, {width: 16, height: 16})
}
