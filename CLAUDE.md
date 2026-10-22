# CLAUDE.md — Token Cat

AI 사용 기록(토큰 숫자)을 경험치로 바꿔 작업표시줄 위를 걷고 뛰는 도트 고양이를 키우는 Windows 데스크톱 앱.
형제 프로젝트 `C:\dev\tokenGrove`(식물 키우기)의 로그 수집·경험치 규칙을 그대로 가져왔다. 두 저장소는 코드를 공유하지 않고 복사해서 따로 간다.

## 명령어
- `npm run dev` 개발 실행 / `npm run typecheck` / `npm test`(Node 내장, `src/**/*.test.mts`)
- `npm run preview:sprites [출력경로] [털,털,...|all]` 고양이 그림을 PNG 한 장으로 렌더. 환경변수 `SCALE=9 STAGE=adult POSE=walk,run`로 확대/필터, `GRID=6`이면 고양이 한 마리씩 6마리 줄로 모아 본다. 그림을 바꾸면 이걸로 눈으로 확인한다.
- `npm run build:win` → `dist/TokenCat-Setup-<버전>.exe` (서명 없음)

## 구조
- `src/shared/` 순수 로직(Electron 의존 없음, 테스트 옆에 둠): `growth.ts`(레벨/단계/털), `usage.ts`(토큰→XP, 멱등 `applyUsage`), `claudeCode.ts`·`codex.ts`(로그 한 줄→UsageRecord), `save.ts`(저장 검증·설정), `behavior.ts`(걷기/뛰기/앉기/자기 행동 규칙, 시간과 난수만 받음), `sprites.ts`(몸 부위를 그려 포즈·단계·털을 조합, 오른쪽 기준, 외곽선 자동).
- `src/main/index.ts`: 고양이 상태의 단일 출처(`ingestUsage` 하나로만 상태 변경). 창은 주 모니터 작업 영역 아래쪽 가로 전체의 투명 띠 하나(`WIN_H`). 평소 `setIgnoreMouseEvents(true,{forward:true})`로 클릭이 통과하고, 렌더러가 고양이 위에 마우스가 올라갔다고 알릴 때만(`cat:capture`) 클릭을 받는다.
- `src/shared/room.ts`: 도감 속 고양이 방. 기본 가구는 레벨업 수(`levelUps`, 고양이가 바뀌어도 누적), 특별 가구는 다 키운 수로 열린다. 방 고양이 행동 계획(`plan`/`roomStep`).
- `src/renderer/src/`: React 없이 DOM+canvas. `main.ts`가 해시로 `overlay.ts`(작업표시줄) / `dex.ts`(도감, `#dex`)를 고른다. `room.ts`는 방 그림, `draw.ts`는 고양이 그림 캐시.
- 개발 확인용: `TOKENCAT_DEX=1`로 개발 실행하면 도감 창이 바로 열린다(설치 앱에서는 무시).

## 지킬 규칙 (tokenGrove와 동일)
- 프롬프트 본문·코드·파일 내용은 수집하지 않는다. 토큰 숫자·ID·시각만. 원본 로그는 읽기만 한다. `~/.codex/auth.json`은 절대 읽지 않는다.
- Claude Code 로그는 한 응답이 여러 줄로 중복된다. 기록 ID는 `message.id|requestId`, `cache_read_input_tokens` 제외. 첫 확인은 과거를 보상하지 않고 읽은 위치만 저장(도구별 기준선).
- 렌더러 Node 통합 금지, contextIsolation 유지, preload `api` 객체로만 노출. 외부 통신 없음(MVP).
- 설치된 앱에서는 테스트 경험치를 막는다(`app.isPackaged`).
- 외부 통신은 업데이트 하나뿐: 새 버전 확인(`api.github.com/repos/oceanfromthewave/tokenCat/releases/latest`)과, 사용자가 [업데이트]를 눌렀을 때만 `electron-updater`(릴리스의 `latest.yml` 체크섬 검증)로 내려받아 "다시 시작하고 설치". 자동 설치는 하지 않는다(서명 없는 설치 파일). 개발 실행이나 실패 시에는 이 저장소의 릴리스 주소만 브라우저로 연다. 우클릭 메뉴에서 자동 확인을 끌 수 있다.
- 릴리스: `package.json` 버전 올림 -> typecheck/test -> `npm run build:win` -> `gh release create vX dist/TokenCat-Setup-X.exe dist/TokenCat-Setup-X.exe.blockmap dist/latest.yml --target main`. 세 파일을 모두 올려야 앱 안 업데이트가 새 버전을 찾는다.
- 개발 실행과 설치 앱은 같은 `%APPDATA%\tokencat\save.json`을 공유한다.
- `record.md`는 로컬 전용, git에 올리지 않는다.
