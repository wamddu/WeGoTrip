# WeGoTrip

계획서 기반 React Native 그룹 여행 앱입니다. Expo SDK 57 / React Native 0.86 / TypeScript / Expo Router를 사용합니다. 컨셉 아트의 파랑·민트와 해안 풍경을 참고해 새 화면을 구성했습니다.

## 실행

```sh
cd frontend
npm ci
npm run web -- --port 8082
```

`.env.example`을 `.env.local`로 복사하고 백엔드를 `./gradlew.bat bootRun`으로 실행하세요. 브라우저에서 http://localhost:8082 를 열어 회원가입 후 로그인합니다. 샘플 여행을 보려면 `EXPO_PUBLIC_DATA_SOURCE=mock`으로 바꾸고 Metro를 재시작하세요. 기존 로컬 샘플 데이터는 유지됩니다.

```sh
npm start          # Expo 개발 서버
npm run android    # Android SDK/에뮬레이터 또는 연결 기기 필요
npm run ios        # macOS와 Xcode 필요
```

기존에 생성한 Android/iOS 프로젝트가 있다면 앱 설정 및 새 네이티브 의존성을 반영해 개발 빌드를 다시 생성해야 합니다. 기존 Android package 값은 유지했습니다.

Windows 네이티브 빌드는 프로젝트와 `node_modules`를 영어/숫자 경로에 두고 진행하세요. 현재 한글 폴더에서는 CMake가 경로를 읽지 못해 APK 생성이 실패했습니다. 웹 실행과 세 플랫폼 JS/에셋 export는 통과했습니다.

## Android 에뮬레이터에서 백엔드 연결

Android Studio 에뮬레이터의 `localhost`는 에뮬레이터 자신을 가리킵니다. PC에서 백엔드를 `./gradlew.bat bootRun`으로 실행한 뒤, `.env.local`의 두 API URL은 `http://localhost:8080/api`로 유지하고 아래 명령으로 PC의 8080 포트에 연결하세요.

```powershell
adb devices
adb -s emulator-5554 reverse tcp:8080 tcp:8080
```

`emulator-5554`는 `adb devices`에 표시된 대상 기기 ID로 바꾸세요. 여러 기기가 연결되어 있으면 `-s`로 테스트할 기기를 지정해야 합니다. `adb` 명령을 찾지 못하면 Windows의 기본 SDK 경로로 실행할 수 있습니다.

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" -s emulator-5554 reverse tcp:8080 tcp:8080
```

연결한 뒤 앱에서 로그인 요청을 다시 실행하세요. 에뮬레이터를 종료하거나 재시작하면 `adb reverse`를 다시 설정해야 합니다. 이 방식은 웹에서도 같은 `localhost` 설정을 사용할 수 있습니다.

대신 Android 에뮬레이터에서 PC를 가리키는 `10.0.2.2`를 직접 사용할 수도 있습니다. 이 경우 `.env.local`의 두 주소를 함께 바꾸고 Metro를 종료한 뒤 다시 실행하세요.

```dotenv
EXPO_PUBLIC_API_URL=http://10.0.2.2:8080/api
EXPO_PUBLIC_MAPS_API_URL=http://10.0.2.2:8080/api
```

`10.0.2.2`는 Android 에뮬레이터용 주소입니다. 웹을 테스트할 때는 두 주소를 `localhost`로 되돌리고 Metro를 재시작하세요. 실기기는 PC의 LAN 주소를 사용합니다.

## 기능

여행 생성·초대 코드·멤버·친구·파티, 날짜별 일정 CRUD, 장소 저장과 일정 연결, 경비 기록과 균등/직접 분담 정산, 준비물, 고정 공지, 그룹 대화, 변경 알림을 구현했습니다. 종료한 여행을 보관하고 다시 열 수도 있습니다.

- 더미 데이터: `src/data/fixtures/workspace.ts` 한 파일에서 관리합니다.
- 데이터 보존: 웹은 localStorage, Android/iOS는 앱 문서 디렉터리의 JSON 파일입니다.
- 로컬 프로필: `jiwoo@example.com`, `minsu@example.com`, `seoyeon@example.com`, `doyoon@example.com`, `haneul@example.com`. 비밀번호 없는 로컬 프로필 선택 방식입니다.
- 다른 프로필로 로그인한 뒤 초대 코드 `BUSAN26`을 입력하면 샘플 부산 여행에 참여할 수 있습니다. 같은 브라우저/앱 저장소에서만 데이터가 공유됩니다.

## API 연결

`EXPO_PUBLIC_DATA_SOURCE=http`는 `src/data/user-travel-repository.ts`를 사용합니다. 회원 정보는 `src/data/user-api.ts`를 통해 `/api/v1`에 연결합니다. 여행·멤버·친구·파티·일정·장소·지출·정산·준비물은 서버에서 공유합니다. 대화·이미지·투표는 `src/data/chat-api.ts`와 WebSocket으로 공유합니다. 공지는 `src/data/notice-api.ts`로 서버에 연결했으며 사용자 승인 후 015 DB 스키마 적용도 완료했습니다. 백엔드를 다시 실행하고 클라이언트를 새로고침하세요. [공지 실행 안내](../docs/TRIP-NOTICE-IMPLEMENTATION.md)를 참고하세요. 기존 기기 공지 원본은 보존합니다. 기존 `http-repository.ts`는 현재 선택되지 않습니다.

회원가입·로그인·로그아웃·이름/계좌 수정·설정·동의 내역·비밀번호 변경·탈퇴를 연결했습니다. Access token은 메모리에 보관하고 30일 유효한 refresh token으로 만료 시 자동 재발급 및 앱 시작/새로고침 시 로그인 복원을 수행합니다. 웹은 HttpOnly 쿠키, 네이티브는 SecureStore를 사용합니다. 로그아웃과 비밀번호 변경은 모든 기기의 기존 토큰을 무효화합니다. 탈퇴는 현재 비밀번호로 재인증합니다. GPS·OCR·AI 기능은 아직 구현하지 않았습니다.

대화는 여행 전체와 참여 중인 파티를 구분합니다. `+ → 사진`을 누르면 하단 패널에서 기기 사진 여러 장을 선택해 한 번에 전송할 수 있습니다. 웹에서는 파일 선택으로 가져온 사진을 같은 패널에서 선택합니다. Cloudinary 이미지 첨부와 여행 장소를 연결한 단일·복수 선택 투표(생성·변경·취소·마감)를 지원합니다. 기존 `chat_message`가 있는 WeGoTrip DB에는 `011-existing-chat-schema.sql`을 적용하고 백엔드의 Cloudinary 키를 설정해야 합니다. `010-chat-polls.sql`은 기존 채팅 테이블이 없는 DB 전용입니다. 기존 네이티브 앱은 `expo-media-library`, `expo-image-manipulator`, `expo-image-picker`와 사진 권한을 반영해 다시 빌드하세요(Android: `npm run android`, iOS: macOS에서 `npm run ios`). [채팅 구현·설정 상세](../docs/CHAT-IMPLEMENTATION.md)를 참고하세요.

준비물은 공용 또는 담당 멤버를 지정해 추가하고, 전체·내 준비물·공용·미완료 필터로 확인합니다. 완료 체크와 내용 수정은 별도 API로 처리하며 동시 변경을 감지합니다. 서버 공유는 화면 진입·앱 복귀·새로고침 시 반영됩니다. 이전 기기 준비물은 `:checklist-backup-v1` 원본 백업으로 보존하고 자동 업로드하지 않습니다. [준비물 구현 상세](../docs/CHECKLIST-IMPLEMENTATION.md)를 참고하세요.

투표 생성 화면의 `복수 선택` 토글을 켜면 여러 항목에 각각 한 표씩 선택할 수 있습니다. 기본값은 단일 선택이며, 복수 선택에서도 참여 인원은 중복 없이 집계합니다. `자동 마감`을 켜면 빠른 시간 선택 또는 날짜·시간 직접 입력으로 마감 시각을 지정할 수 있습니다. 남은 시간을 표시하고 기한 이후에는 투표·변경·취소를 차단합니다. 채팅 스키마 준비 후 `012-chat-poll-deadline.sql`과 `013-chat-poll-multiple.sql`이 필요하며, 연결된 WeGoTrip DB에는 각각 승인 후 적용을 완료했습니다. 기존 투표의 선택 내역과 마감 설정은 유지됩니다.

채팅 푸시는 새 텍스트·사진·투표 생성 시 작성자를 제외한 현재 멤버의 허용된 등록 기기에 전송합니다. 서버에서 014 발송 대기 스키마와 Firebase 인증을 준비하고, 수신 기기의 OS 알림 권한 및 계정 `푸시 알림` 설정을 모두 켜야 합니다. 알림을 누르면 로그인 계정을 확인한 뒤 해당 전체·파티 채팅으로 이동합니다. [채팅 푸시 실행 안내](../docs/CHAT-PUSH-IMPLEMENTATION.md)를 참고하세요. 실기기 수신 테스트는 사용자 요청으로 생략했습니다.

웹 CORS 허용 주소는 백엔드 `users.allowed-origins`에 쉼표로 지정합니다(기본 localhost:8081, localhost:8082). 실기기는 두 API URL의 localhost를 PC의 LAN 주소로 변경하세요. 전체 기능은 `bootRun`이 필요하며 `mapsRun`은 지도 전용입니다. 상세 계약은 [USER API 연결](docs/USER-API.md)를 참고하세요.

**일정 → 지도 동선**에서 날짜·팀별 방문 번호와 연결선을 볼 수 있습니다. 점선은 방문 순서이고 실제 도로 경로가 아닙니다. 장소 추가/수정에서 호텔·카페 이름을 검색하고 결과를 선택하면 이름·주소·분류·위치가 자동으로 채워지고 지도에 표시됩니다. 저장을 누르면 여행 장소로 추가됩니다.

검색은 Google Places API (New), 배경 지도는 Maps Static API를 사용합니다. 키는 `backend/.env`의 `GOOGLE_MAPS_API_KEY`에 설정하고 `backend`에서 `./gradlew.bat mapsRun`을 실행하세요. MySQL 없이 지도 서버만 실행할 수 있습니다. [휴대전화 연결·API 설정·지도 구조](docs/MAPS.md)를 참고하세요.

## 검사와 빌드

```sh
npm test
npm run typecheck
npm run build:web
npm run build:native
```

네이티브 export는 JS/에셋 번들 검증입니다. APK/IPA 생성이나 실제 기기 검증을 대신하지 않습니다. 웹 dist를 호스팅할 때는 동적 경로를 index.html로 연결하세요.

- [구조와 기능 범위](docs/ARCHITECTURE.md)
- [제안 API 계약](docs/API-CONTRACT.md)
- [검증 기록](docs/VALIDATION.md)
- [생성 이미지와 프롬프트](docs/ASSETS.md)
