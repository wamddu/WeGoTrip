# Android 실기기 테스트 APK

EAS 프로젝트: [@jeongheaum/frontend](https://expo.dev/accounts/jeongheaum/projects/frontend)

2026-11-01 아직 빌드하지 않은 변경: 채팅 키보드 회피. Android 채팅 화면의 `KeyboardAvoidingView`에 `height` 동작을 지정해 키보드가 열리면 메시지 영역을 줄이고 입력창을 키보드 위에 배치하도록 했다. 상단 안전 영역을 보정하고 여행 탭을 바꿀 때 높이를 새로 측정한다. Android 앱 설정에도 `softwareKeyboardLayoutMode: "resize"`를 명시했다. 최신 대화를 보는 중에는 기존 스크롤 처리가 줄어든 화면에서도 최신 메시지를 따라가며, 이전 대화를 읽는 중에는 위치를 유지한다.

타입 검사와 전체 191개 테스트가 통과했다. 새 APK는 만들지 않았으며 아래 1.0.0(5) APK에는 이 변경이 포함되지 않는다. 다음 빌드 후 Android에서 키보드 열기·닫기, 입력창과 최신 메시지 노출, 이전 대화 읽기, 다른 여행 탭에서 채팅으로 돌아오기를 확인해야 한다. 빌드는 사용자가 지시할 때만 진행한다.

2026-11-01 채팅 최신 메시지 표시 빌드: [APK 다운로드](https://expo.dev/artifacts/eas/NOau3LAZvJVwFa01f6a7xG86ZRSZ6WqQ_9KjYakAJfM.apk), [빌드 기록](https://expo.dev/accounts/jeongheaum/projects/frontend/builds/5b09f3d6-0dc8-46e6-aa48-033136c57d92). 버전은 1.0.0(5)이다. APK 서명 검증과 기존 APK의 서명 키 일치, 현재 API·지도 주소 포함, Android Firebase 활성화와 알림 채널 설정, 최신 채팅 스크롤 코드 포함을 확인했다.

채팅 전용 스크롤 영역을 분리했다. 채팅 진입·재진입과 대화방/이미지 필터 변경 시 최신 메시지로 초기화하고, 메시지와 화면의 크기가 정해진 다음 애니메이션 없이 맨 아래로 이동한다. 초기 크기 계산과 자동 이동에서 발생한 스크롤 이벤트가 최신 메시지 따라가기를 해제하지 않도록 했다. 사용자가 위로 스크롤해 이전 대화를 읽는 중에는 새 메시지가 추가돼도 현재 위치를 유지한다. 맨 아래로 돌아오면 다시 최신 메시지를 따라간다.

타입 검사와 전체 191개 테스트가 통과했다. 실제 서버 데이터에 영향을 주지 않는 긴 목 대화 웹 테스트에서 재진입 시 하단 여백이 0px인 최신 메시지 위치를 확인했고, 위로 스크롤한 상태에서 새 메시지를 추가해도 scrollTop 214px이 유지됐다. 관리 화면으로 이동했다가 뒤로 돌아와도 최신 위치로 복원됐고 브라우저 런타임 오류는 없었다. Android 설치 후 전체/파티 채팅 재진입과 이미지 필터 변경, 키보드 열기, 이전 대화 읽기를 확인한다. 기존 하단바 고정·사진 업로드·버튼 터치 수정도 포함한다.

2026-11-01 하단 네비게이션 고정 빌드: [APK 다운로드](https://expo.dev/artifacts/eas/ld4Dor7AcPwsSW2HjsGZ_EO5bakDJHQ-QrI4jLRf32o.apk), [빌드 기록](https://expo.dev/accounts/jeongheaum/projects/frontend/builds/52587c06-7eec-4a8f-9315-7d69d1c8034d). 버전은 1.0.0(4)이다. APK 서명 검증과 기존 APK의 서명 키 일치, 현재 API·지도 주소 포함, Android Firebase 활성화와 알림 채널 설정을 확인했다.

로그인 후 공통 레이아웃에서 화면 전환용 Stack과 하단바를 형제 요소로 배치했다. 각 Page와 여행 상세 화면에서 하단바를 제거하고, 공통 Frame이 기기 상하단 여백을 한 번만 처리한다. 주요 하단 메뉴와 여행 내부 탭은 즉시 전환하고, 상세·관리·편집 화면의 내용 영역은 슬라이드를 유지한다. 로그인·새 여행·작성·채팅 화면에서는 하단바를 숨긴다. 여행별 추가 대상과 공지 작성 권한, 준비물 저장 중 비활성화 조건은 현재 경로와 최신 여행 데이터로 계산한다.

타입 검사와 전체 185개 테스트가 통과했다. 실제 서버 대신 목 데이터 웹 화면에서 홈 → 내 여행 → 여행 상세 → 장소 이동 중 하단바 위치·크기가 유지되고 한 개만 표시되는 것을 확인했다. 일정/장소 추가 이동, 작성 화면의 숨김·뒤로가기 복원, 채팅의 숨김도 확인했고 브라우저 런타임 오류는 없었다. Android 설치 후에는 동일한 이동과 뒤로가기로 하단바가 함께 슬라이드하지 않는지 확인한다. 이전 사진 업로드와 버튼 터치 수정도 포함한다.

2026-11-01 장소 검색 버튼 터치 조정 빌드: [APK 다운로드](https://expo.dev/artifacts/eas/RxiYt7ZbgL8eoFQE4Utk-rnSoKwLSZ0hrgFlSaY5ses.apk), [빌드 기록](https://expo.dev/accounts/jeongheaum/projects/frontend/builds/317ef2cd-c19a-4557-a89d-293aff2d79c2). 버전은 1.0.0(3)이다. APK 서명 검증과 기존 APK의 서명 키 일치, 현재 API·지도 주소 포함, Android Firebase 활성화와 알림 채널 설정을 확인했다.

Android에서 장소 검색 버튼의 가운데를 누르면 검색되지만 좌우 영역은 반응하지 않는 증상에 대응했다. 배포된 검색 API는 `서울역` 요청에 HTTP 200과 결과 8개를 반환했다. 공통 `Button`의 `disabled || loading`이 활성화 시 `undefined`가 되는 경우가 있었다. Android에서는 이때 네이티브 버튼이 비활성 상태로 남고 자식 글자만 터치 대상이 될 수 있다. `Boolean(disabled || loading)`으로 항상 명시적인 `false`/`true`를 전달하도록 수정했다. 기존 코드에서 실패하는 회귀 테스트를 먼저 확인했으며 입력 전·후, 로딩 시작·종료, 기본 상태를 검사한다. `pointerEvents="box-only"`로 버튼 본체가 터치 대상이 되도록 하고 Android 터치 효과와 장소 검색 로딩 표시도 추가했다. 타입 검사와 전체 181개 테스트가 통과했다. 실제 Android에서 터치 좌표별 동작은 별도로 확인해야 한다.

업데이트 설치 후 키보드를 내린 상태와 열린 상태에서 각각 검색 버튼의 왼쪽·가운데·오른쪽을 눌러 검색이 시작되는지 확인한다. 결과를 선택하고 장소 저장까지 확인한다. 공통 버튼 변경이므로 로그인·저장 버튼도 함께 확인한다. 이전 사진 업로드 수정도 포함한다.

2026-11-01 사진 업로드 수정 빌드: [APK 다운로드](https://expo.dev/artifacts/eas/U61cXxRzoGlw-mQOnLbJC_DLDTusm9jW8op44Dh3Jv8.apk), [빌드 기록](https://expo.dev/accounts/jeongheaum/projects/frontend/builds/76986311-a4bf-44b2-b179-c3d193104f0c). 버전은 1.0.0(2)다. APK 서명 검증과 기존 APK의 서명 키 일치, 현재 `.env.local`의 API·지도 주소 포함, Android Firebase 활성화, 알림 채널 `default`, HTTP 테스트 통신 허용을 확인했다.

Android의 `Unsupported FormDataPart implementation` 오류는 Expo의 전송 기능이 `{ uri, name, type }` 객체를 지원하지 않아 발생했다. 실제 사진 데이터를 읽을 수 있는 `expo-file-system`의 `File` 객체를 전달하도록 수정했다. 원본 JPG·PNG·GIF, 변환된 JPEG의 바이트·파일명·MIME 형식과 임시 파일 정리를 Expo의 실제 multipart encoder를 사용한 회귀 테스트로 확인했다. React Native 기본 Blob의 바이너리 생성 제약을 피하기 위해 File을 직접 사용하며, 기본 Blob 생성이 실패하는 환경도 테스트에 반영했다. 타입 검사와 프런트엔드 전체 180개 테스트가 통과했다.

같은 서명 키로 빌드하므로 기존 앱을 삭제하지 않고 새 APK를 업데이트 설치한다. 설치 후 일반 JPG/PNG 사진 한 장과 여러 장을 보내고, 상대방 웹 채팅에서 사진이 보이는지 확인한다. 앱 코드 수정이므로 서버 재시작은 필요하지 않다. 실제 휴대폰에서의 업로드 결과는 별도로 확인해야 한다.

2026-10-31 테스트 빌드: [APK 다운로드](https://expo.dev/artifacts/eas/FRBsq7i0HaYfHXhrWLuBU8DYunYheBL2y_AXdnSoCuQ.apk), [빌드 기록](https://expo.dev/accounts/jeongheaum/projects/frontend/builds/130cefc7-72d9-44b3-a288-160a069b20ba).

버전 1.0.0(1), 패키지 `com.jeongheaum.frontend`, Android 7(API 24) 이상이다. APK 서명 검증을 통과했고 현재 `.env.local`의 API·지도 주소, Android Firebase 활성화, 알림 채널 `default`, 알림 권한 선언, HTTP 테스트 통신 허용을 설치 파일에서 확인했다. 실제 휴대폰의 실행·로그인·알림 수신은 아래 절차로 확인한다.

`frontend` 디렉터리에서 다음 명령을 실행한다.

```powershell
npx eas-cli@27.2.0 build --platform android --profile preview
```

`preview`는 Metro 없이 실행되는 설치용 APK다. 서버는 계속 실행되어 있어야 한다. 설치 파일은 성공한 EAS 빌드 페이지에서 다운로드한다. 기존 앱과 같은 패키지·서명 키를 사용하면 새 APK를 업데이트로 설치할 수 있다.

## 빌드에 사용하는 환경 변수

EAS 프로젝트의 `preview` 환경에 다음 값을 등록한다. 로컬 `.env.local`을 수정해도 EAS에 저장된 값은 자동으로 바뀌지 않는다.

| 변수 | 용도 |
| --- | --- |
| `EXPO_PUBLIC_DATA_SOURCE=http` | 실제 서버 데이터 사용 |
| `EXPO_PUBLIC_API_URL` | 테스트 API 주소. `/api`로 끝나야 한다 |
| `EXPO_PUBLIC_MAPS_API_URL` | 지도 프록시 주소. `/api`로 끝나야 한다 |
| `GOOGLE_SERVICES_JSON` | Android Firebase 클라이언트 설정 파일. EAS의 secret/file 변수 |

문자열 변수는 다음 형식으로 갱신한다. 주소는 실제 서버 주소로 바꾼다.

```powershell
npx eas-cli@27.2.0 env:set --environment preview --name EXPO_PUBLIC_API_URL --value "https://api.example.com/api" --visibility plaintext --non-interactive
npx eas-cli@27.2.0 env:set --environment preview --name EXPO_PUBLIC_MAPS_API_URL --value "https://api.example.com/api" --visibility plaintext --non-interactive
```

Firebase 파일을 바꾼 경우:

```powershell
npx eas-cli@27.2.0 env:set --environment preview --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret --non-interactive
```

`firebase.json`의 `messaging_android_notification_channel_id`와 `app.json`의 Expo Notifications `defaultChannel`은 모두 `default`로 유지한다. 두 값이 다르면 Android manifest 병합이 실패한다. 앱이 생성하는 알림 채널과 서버가 보내는 Android 채널 ID도 `default`다.

현재 HTTP 테스트 서버도 사용할 수 있도록 `app.config.js`가 `preview` 프로필에서만 Android cleartext 통신을 허용한다. 다른 EAS 프로필에서는 HTTP API 주소를 거부한다. 배포 빌드에는 데이터 소스, 두 API 주소, Android Firebase 파일이 모두 필요하다.

저장소 루트의 `.easignore`는 백엔드, 보고서, 임시 파일, 로컬 환경 파일, 자격 증명, generated Android/iOS 폴더를 업로드에서 제외한다. EAS가 앱 설정과 Firebase 파일을 사용해 Android 프로젝트를 새로 생성한다.

## 휴대폰에서 확인하기

1. Android 휴대폰에서 APK를 다운로드해 설치한다. 요청받으면 해당 브라우저/파일 앱의 APK 설치를 허용한다.
2. Wi-Fi와 모바일 데이터에서 서버 접속·로그인을 확인한다.
3. 같은 여행에 참여한 서로 다른 계정으로 채팅·사진·지도·일정·경비·준비물·공지를 확인한다.
4. 앱을 완전히 종료했다가 다시 열어 로그인 복원을 확인한다.
5. 휴대폰의 알림 권한과 앱 `내 정보 → 푸시 알림`을 모두 켠다. 한 계정에서 앱을 백그라운드로 보내고 다른 계정으로 새 메시지를 보내 수신·알림 탭 이동을 확인한다.

알림 발송에는 AWS 백엔드의 Firebase 인증과 푸시 활성화 설정도 필요하다. 서버용 서비스 계정 private key는 APK나 `EXPO_PUBLIC_*` 변수에 넣지 않는다.

iOS 실기기 빌드는 현재 보류 상태다.
