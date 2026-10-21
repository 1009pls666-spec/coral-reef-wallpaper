# 나의 산호초 바다

실사 산호초 장면 속 생물을 추가하고 편집하며 감상할 수 있는 인터랙티브 바다입니다. 웹과 모바일 설치형 앱(PWA), Windows·macOS 데스크톱 바탕화면을 한 코드베이스에서 제공합니다.

## 바로 사용하기

- 모바일·웹 앱: https://my-coral-reef-mobile.dleldjf.chatgpt.site/
- iPhone: Safari의 공유 버튼에서 `홈 화면에 추가`
- Android: 앱의 저장 메뉴에서 `휴대폰 앱 설치` 또는 Chrome의 `앱 설치`

모바일 웹앱은 홈 화면에서 전체 화면 앱으로 실행됩니다. iPhone은 운영체제 제한 때문에 인터랙티브 앱을 시스템 홈 화면 배경으로 계속 실행할 수 없습니다. Android의 시스템 라이브 배경화면은 별도 네이티브 `WallpaperService` 패키지가 필요합니다.

## 개발 실행

Node.js 22.13 이상이 필요합니다.

```bash
npm install
npm run dev
```

웹 빌드:

```bash
npm run build
```

데스크톱 앱 확인:

```bash
npm run desktop:typecheck
npm run desktop:run
```

패키지 생성:

```bash
npm run desktop:dist:mac
npm run desktop:dist:win
```

Windows에서 앱을 직접 실행하면 편집창이 앞에 열립니다. 바탕화면 모드에서는 작업표시줄의 산호초 아이콘을 누르거나 `Ctrl+Shift+E`로 편집창을 다시 열 수 있습니다.

## 주요 기능

- 물고기·상어·고래·해파리·거북이 유영
- 클릭 도망, 먹이 반응, 거품과 수중 효과
- 생물 추가·이동·크기·깊이·속도 편집
- 자동 저장, 실행 취소·다시 실행, JSON 가져오기·내보내기
- UI를 제외한 바다 이미지 저장
- 구형 CCD 디지털카메라 후처리
- 모바일 홈 화면 설치와 오프라인 기본 로딩
