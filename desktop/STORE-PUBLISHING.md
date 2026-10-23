# Microsoft Store 배포

이 경로는 현재의 전체 기능 Electron 앱을 Windows 10·11용 APPX(MSIX 계열) 패키지로 제출한다. Microsoft Store가 심사 후 패키지를 다시 서명하므로 개발자가 별도의 코드 서명 인증서를 구매하지 않는다.

## 1. 개발자 계정 준비

1. `https://storedeveloper.microsoft.com` 에서 새 Microsoft Store 개발자 계정을 만든다.
2. 판매할 앱이므로 사업 형태에 맞는 계정 유형을 선택하고 본인/사업자 확인을 완료한다.
3. Partner Center에서 `나의 산호초 바탕화면` 앱 이름을 예약한다.
4. 상품의 **Product identity** 페이지에서 다음 값을 복사한다.
   - Package/Identity/Name
   - Package/Identity/Publisher
   - Publisher display name

## 2. 스토어 제출용 패키지 만들기

GitHub Actions의 `Build Microsoft Store Package` 워크플로를 수동 실행하고 1단계에서 복사한 세 값을 입력한다. 성공하면 `coral-reef-wallpaper-microsoft-store` 아티팩트에 APPX가 생성된다.

로컬 Windows PC에서는 다음 환경 변수를 지정한 뒤 빌드할 수 있다.

```powershell
$env:WINDOWS_STORE_IDENTITY_NAME="Partner Center의 Name"
$env:WINDOWS_STORE_PUBLISHER="CN=Partner Center의 Publisher"
$env:WINDOWS_STORE_PUBLISHER_DISPLAY_NAME="Partner Center의 게시자명"
npm run desktop:dist:store
```

`release-wallpaper/coral-reef-wallpaper-store-0.1.0-x64.appx`를 Partner Center 제출의 Packages에 올린다. 임의 값으로 만든 Preview APPX는 빌드 확인용이며 Store 제출용이 아니다.

## 3. 제출과 웹 연결

1. 가격 및 제공 지역, 연령 등급, 앱 설명, 스크린샷을 입력한다.
2. APPX를 업로드하고 인증을 요청한다.
3. 승인된 상품의 Microsoft Store 공개 URL을 웹 다운로드 버튼에 연결한다.
4. 사용자는 Store에서 신뢰된 설치·삭제·자동 업데이트를 사용하게 된다.

Store 상품이 승인되기 전에는 기존 GitHub EXE 다운로드 링크를 제거하지 않는다. 승인 후에 웹 버튼을 Store 링크로 교체한다.
