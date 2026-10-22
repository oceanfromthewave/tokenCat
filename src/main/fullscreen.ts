import {spawn, type ChildProcess} from 'child_process'

// 지금 맨 앞 창이 모니터 전체를 덮고 있는지(영상 전체화면, 게임) 알려준다.
// Electron에는 다른 앱의 창을 보는 기능이 없어서, PowerShell 하나를 계속 띄워 두고 Windows API로 1.5초마다 확인한다.
// 창 크기를 직접 비교하면 최대화한 IDE처럼 테두리가 큰 창도 전체화면으로 잘못 보여서, Windows가 '전체화면 중에는 알림을 미루는'
// 판단(SHQueryUserNotificationState)을 그대로 쓴다. (매번 새로 띄우면 무겁다. 값이 바뀔 때만 한 줄을 출력한다. 창 내용은 읽지 않는다.)
const SCRIPT = String.raw`
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class FS {
  [DllImport("shell32.dll")] static extern int SHQueryUserNotificationState(out int state);
  // Windows가 알림을 미룰 때 쓰는 판단을 그대로 쓴다: 2 = 전체화면 앱, 3 = 전체화면 게임(D3D), 4 = 프레젠테이션
  public static int Check() {
    int s; if (SHQueryUserNotificationState(out s) != 0) return 0;
    return (s == 2 || s == 3 || s == 4) ? 1 : 0;
  }
}
"@
$last = -1
$parent = [int]$env:TOKENCAT_PARENT
while ($true) {
  if (-not (Get-Process -Id $parent -ErrorAction SilentlyContinue)) { exit } # 앱이 비정상 종료돼도 남지 않게
  $v = [FS]::Check()
  if ($v -ne $last) { [Console]::Out.WriteLine($v); [Console]::Out.Flush(); $last = $v }
  Start-Sleep -Milliseconds 1500
}
`

export function watchFullscreen(onChange: (full: boolean) => void): ChildProcess | null {
    if (process.platform !== 'win32') return null
    try {
        const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64')
        const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], env: {...process.env, TOKENCAT_PARENT: String(process.pid)}})
        child.stdout?.setEncoding('utf8')
        child.stdout?.on('data', (chunk: string) => {
            const last = chunk.trim().split(/\s+/).pop()
            if (last === '1' || last === '0') onChange(last === '1')
        })
        child.on('error', (err) => console.error('전체화면 확인 실패:', err.message))
        return child
    } catch (err) {
        console.error('전체화면 확인 실패:', err instanceof Error ? err.message : err)
        return null
    }
}
