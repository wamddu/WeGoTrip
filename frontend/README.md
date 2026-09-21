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

## 기능

여행 생성·초대 코드·멤버·친구·파티, 날짜별 일정 CRUD, 장소 저장과 일정 연결, 경비 기록과 균등/직접 분담 정산, 준비물, 고정 공지, 그룹 대화, 변경 알림을 구현했습니다. 종료한 여행을 보관하고 다시 열 수도 있습니다.

- 더미 데이터: `src/data/fixtures/workspace.ts` 한 파일에서 관리합니다.
- 데이터 보존: 웹은 localStorage, Android/iOS는 앱 문서 디렉터리의 JSON 파일입니다.
- 로컬 프로필: `jiwoo@example.com`, `minsu@example.com`, `seoyeon@example.com`, `doyoon@example.com`, `haneul@example.com`. 비밀번호 없는 로컬 프로필 선택 방식입니다.
- 다른 프로필로 로그인한 뒤 초대 코드 `BUSAN26`을 입력하면 샘플 부산 여행에 참여할 수 있습니다. 같은 브라우저/앱 저장소에서만 데이터가 공유됩니다.

## API 연결

`EXPO_PUBLIC_DATA_SOURCE=http`는 `src/data/user-travel-repository.ts`를 사용합니다. 회원 정보는 `src/data/user-api.ts`를 통해 `/api/v1`에 연결하고, 여행 데이터는 서버 사용자 ID별 로컬 저장소에 보관합니다. 기존 `http-repository.ts`는 미래 여행 API용 제안 어댑터로 현재 선택되지 않습니다.

회원가입·로그인·로그아웃·이름/계좌 수정·설정·동의 내역·비밀번호 변경·탈퇴를 연결했습니다. Access token은 메모리에 보관하고 30일 유효한 refresh token으로 만료 시 자동 재발급 및 앱 시작/새로고침 시 로그인 복원을 수행합니다. 웹은 HttpOnly 쿠키, 네이티브는 SecureStore를 사용합니다. 로그아웃과 비밀번호 변경은 모든 기기의 기존 토큰을 무효화합니다. 탈퇴는 현재 비밀번호로 재인증합니다. 기기 간 여행/친구/채팅 동기화, 실제 푸시·GPS·OCR·AI는 아직 연결하지 않았습니다.

웹 CORS 허용 주소는 백엔드 `users.allowed-origins`에 쉼표로 지정합니다(기본 localhost:8081, localhost:8082). 실기기는 두 API URL의 localhost를 PC의 LAN 주소로 변경하세요. 전체 기능은 `bootRun`이 필요하며 `mapsRun`은 지도 전용입니다. 상세 계약은 [USER API 연결](docs/USER-API.md)을 참고하세요.

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
