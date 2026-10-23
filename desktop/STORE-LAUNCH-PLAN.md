# Microsoft Store 첫 출시 계획

## 1단계: 사업자 없이 20명 무료 비공개 베타

- 계정: Microsoft Store Individual developer
- 가격: Free
- 노출: `Private audience`
- 테스터: Microsoft 계정 이메일 20명을 명단에 추가
- 결과: 명단의 테스터만 Store 상품을 보고 무료로 설치 가능

Partner Center의 `Pricing and availability > Visibility`에서 `Private audience`를 선택한다. 테스터는 반드시 Windows의 Microsoft Store에 명단에 등록된 것과 같은 Microsoft 계정으로 로그인해야 한다.

앱을 한 번 받은 테스터의 접근권은 회수할 수 없다. 해당 테스터는 후속 업데이트도 계속 받는다.

## 업로드 순서

1. `https://storedeveloper.microsoft.com`에서 무료 Individual developer 계정을 만든다.
2. Partner Center에서 `New product > MSIX or PWA app`을 선택한다.
3. `나의 산호초 바탕화면`을 앱 이름으로 예약한다.
4. Product identity의 Name, Publisher, Publisher display name으로 GitHub Actions의 `Build Microsoft Store Package`를 실행한다.
5. 생성된 APPX를 `Packages`에 업로드한다.
6. 가격을 Free로, Visibility를 Private audience로 지정하고 20명의 Microsoft 계정 이메일을 넣는다.
7. 설명, 스크린샷, 연령 등급을 완성한 뒤 인증을 요청한다.

## 2단계: 유료 공개 출시

20명의 설치·삭제, 작업 표시줄, 렉, 자동 실행, 편집 복원 테스트를 완료한 뒤 사업자를 준비한다. Microsoft는 Individual을 Company로 직접 변경하지 않으므로, 유료 출시는 Company 계정에서 새로 제출하는 것을 기본 계획으로 한다.

## 베타 테스터에게 받을 항목

- Windows 10/11 버전과 PC 사양
- 설치·삭제가 자연스러운지
- 작업 표시줄과 바탕화면 아이콘을 가리지 않는지
- 10분 이상 실행 시 렉·발열·팬 소음
- 편집한 물고기 수·크기·속도가 재실행 후 복원되는지
- `바탕화면으로 사용하지 않기`가 정상 작동하는지
