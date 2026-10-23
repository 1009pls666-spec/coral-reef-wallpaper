# 나의 산호초 바탕화면 — AI 설치 지침

이 폴더를 받은 사용자가 “이 컴퓨터에 설치해줘”라고 요청하면 아래 절차를 수행한다.
사용자의 로컬 파일과 명령 실행 권한이 없는 환경에서는 설치했다고 말하지 말고
`설치안내.txt`의 직접 설치 절차를 안내한다.

## 공통 원칙

- 현재 운영체제와 CPU 아키텍처를 먼저 확인한다.
- 이 폴더 밖의 사용자 파일을 삭제하거나 변경하지 않는다.
- 설치 스크립트가 성공한 뒤 앱 프로세스가 실행 중인지 확인한다.
- 설치 결과와 편집 단축키를 사용자에게 알려준다.

## macOS (Apple Silicon)

```bash
bash "./설치.command" --unattended
```

설치 위치는 `~/Applications/CoralReefWallpaper.app`이다. 성공 후
`pgrep -x CoralReefWallpaper`로 실행 상태를 확인한다. Intel Mac에는 설치하지 않는다.

## Windows 10/11 x64

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\install-windows.ps1" -Unattended
```

설치 위치는 `%LOCALAPPDATA%\Programs\CoralReefWallpaper`이다. 성공 후
`Get-Process CoralReefWallpaper -ErrorAction Stop`으로 실행 상태를 확인한다.

## 완료 안내

- 편집/바탕화면 복귀: `Ctrl/Command + Shift + E`
- 일시정지/재생: `Ctrl/Command + Shift + Space`
