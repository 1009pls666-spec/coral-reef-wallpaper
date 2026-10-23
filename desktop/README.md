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

Apple Developer Program에 가입하지 않은 빌드는 자동으로 임시 서명됩니다. 배포용 간편설치 ZIP의 `설치.command`는 앱을 사용자 `Applications` 폴더에 복사하고 해당 앱의 격리 속성만 제거한 뒤 실행합니다. `설치.command` 자체가 차단되면 터미널에 `bash `를 입력하고 파일을 끌어 놓아 실행합니다.

Windows NSIS 설치 파일/포터블 EXE:

```bash
npm run desktop:dist:win
```

결과물은 `release-wallpaper/`에 생성됩니다. Windows 설치 파일도 공개 배포 시 코드 서명을 권장합니다.

## 직접 설치용과 AI 설치용 ZIP

최신 Mac/Windows 앱 폴더를 만든 뒤 다음 명령으로 네 가지 ZIP을 생성합니다.

```bash
npm run desktop:install-bundles
```

- `*-direct.zip`: ChatGPT 없이도 사람이 설치할 수 있는 안내와 실행 스크립트
- `*-ai.zip`: 위 내용에 로컬 컴퓨터 제어형 AI가 읽을 `AI-INSTALL.md`를 추가한 버전

일반 무료 웹 채팅은 로컬 컴퓨터를 조작할 수 없으므로 직접 설치용 ZIP을 사용합니다.

## macOS 정식 서명과 공증

Gatekeeper 경고 없이 배포하려면 Apple Developer Program 가입, `Developer ID Application` 인증서, Apple 공증 인증 정보가 필요합니다. 인증서나 비밀번호 파일은 저장소에 넣지 않습니다.

1. Xcode의 `Settings > Accounts > Manage Certificates`에서 `Developer ID Application` 인증서를 만들고 이 Mac의 키체인에 설치합니다.
2. Apple ID의 앱 전용 암호를 만든 다음 아래 명령으로 공증 자격 증명을 키체인에 저장합니다. 명령이 암호를 물으면 Apple ID 일반 암호가 아니라 앱 전용 암호를 입력합니다.

```bash
xcrun notarytool store-credentials "coral-reef-notary" \
  --apple-id "APPLE_ID_EMAIL" \
  --team-id "APPLE_TEAM_ID"
```

3. 정식 DMG와 ZIP을 빌드합니다.

```bash
APPLE_KEYCHAIN_PROFILE="coral-reef-notary" npm run desktop:dist:mac:notarized
```

이 명령은 Developer ID 서명, Hardened Runtime, Apple 공증, 티켓 스테이플링을 수행한 뒤 `codesign`, `spctl`, `stapler`로 결과를 검증합니다. 공증 인증은 App Store Connect API 키 환경 변수 또는 Apple ID 환경 변수 방식도 지원합니다.

## 플랫폼 동작

- macOS: Electron의 데스크톱 윈도우 레벨을 사용해 Finder 아이콘 뒤에 표시합니다.
- Windows: Explorer의 `WorkerW` 바탕화면 레이어에 창을 연결합니다.
- 여러 모니터: 연결된 모든 디스플레이에 각각 바다 창을 생성하고, 디스플레이 구성이 바뀌면 자동으로 다시 맞춥니다.
