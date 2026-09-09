# WeGoTrip

계획서 기반 React Native 그룹 여행 앱입니다. Expo SDK 57 / React Native 0.86 / TypeScript / Expo Router를 사용합니다. 컨셉 아트의 파랑·민트와 해안 풍경을 참고해 새 화면을 구성했습니다.

## 실행

```sh
cd frontend
npm ci
npm run web -- --port 8088
```

브라우저에서 http://localhost:8088 을 열고 **샘플 계정으로 시작하기**를 선택하세요. 기본 설정은 mock이며 별도 API 키가 필요하지 않습니다.

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

`.env.example`을 `.env.local`로 복사하고 `EXPO_PUBLIC_DATA_SOURCE=http`와 API 주소를 설정한 뒤 Metro를 재시작합니다. 화면과 도메인 코드는 유지하며 `src/data/http-repository.ts`에서 서버 계약을 연결합니다.

현재 Java 백엔드는 새 API 계약을 구현하지 않았습니다. 실제 서버 인증, 기기 간 채팅·푸시, 장소 검색·도로 길찾기 API, OCR, GPS 및 AI는 후속 연결 대상입니다.

**일정 → 지도 동선**에서 날짜·파티별 방문 번호와 연결선을 볼 수 있습니다. 지도는 이동·확대·축소가 가능하며, 점선은 방문 순서이고 실제 도로 경로가 아닙니다. 장소 수정에서 지도를 눌러 좌표를 저장하거나 위도·경도를 입력하세요. 주소만 있는 장소는 위치 등록 안내가 나옵니다. 기존 부산 샘플의 수정하지 않은 장소에는 예시 좌표가 자동 보완됩니다.

배경 지도는 OpenStreetMap의 온라인 타일을 사용합니다. `src/data/map-provider.ts`와 `.env.example`의 공개 설정으로 제공자와 저작권 표시를 교체할 수 있습니다. [지도 구조와 운영 범위](docs/MAPS.md)를 참고하세요.

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
