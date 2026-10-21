# 나의 산호초 바탕화면

기존 산호초 웹을 그대로 사용하는 Windows/macOS용 라이브 바탕화면 앱입니다. 물고기 유영, 클릭 도망, 먹이, 편집, 자동 저장, JSON과 PNG 내보내기를 모두 유지합니다.

## 개발 실행

```bash
npm install
npm run desktop:run
```

앱은 기본적으로 바탕화면 모드로 시작합니다. 편집창을 바로 띄워 점검하려면 다음처럼 실행합니다.

```bash
npm run desktop:run -- --editor
```

## 조작

- `Ctrl/⌘ + Shift + E`: 바탕화면 모드와 편집 모드 전환
- `Ctrl/⌘ + Shift + Space`: 움직임 일시정지/재생
- 메뉴 막대(macOS) 또는 시스템 트레이(Windows): 편집, 바탕화면 복귀, 자동 실행, 종료
- 편집창 왼쪽 위의 `바탕화면으로 돌아가기`: 편집을 마치고 바탕화면 레이어로 복귀

Windows에서는 앱을 직접 실행하면 편집창이 화면 앞으로 열립니다. 바탕화면 모드에서는 시스템 트레이의 바다 아이콘을 한 번 누르거나 `Ctrl + Shift + E`를 눌러 편집창을 다시 불러올 수 있습니다.

바탕화면 모드에서는 마우스 입력이 아래의 데스크톱으로 통과하므로 파일과 아이콘을 평소처럼 사용할 수 있습니다. 물고기를 누르거나 먹이를 놓는 상호작용은 편집 모드에서 사용할 수 있습니다.

## 설치 파일 만들기

현재 운영체제용:

```bash
npm run desktop:dist
```

macOS DMG/ZIP:

```bash
npm run desktop:dist:mac
```

Windows NSIS 설치 파일/포터블 EXE:

```bash
npm run desktop:dist:win
```

결과물은 `release-wallpaper/`에 생성됩니다. macOS에서 외부 배포하려면 Apple Developer ID 서명과 공증 설정이 별도로 필요합니다. Windows 설치 파일도 공개 배포 시 코드 서명을 권장합니다.

## 플랫폼 동작

- macOS: Electron의 데스크톱 윈도우 레벨을 사용해 Finder 아이콘 뒤에 표시합니다.
- Windows: Explorer의 `WorkerW` 바탕화면 레이어에 창을 연결합니다.
- 여러 모니터: 연결된 모든 디스플레이에 각각 바다 창을 생성하고, 디스플레이 구성이 바뀌면 자동으로 다시 맞춥니다.
