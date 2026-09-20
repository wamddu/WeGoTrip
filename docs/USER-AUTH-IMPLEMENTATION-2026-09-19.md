# USER API·로그인·프론트엔드 연결 작업 정리

- 작성일: 2026-09-19
- 후속 변경: 2026-09-20 token_hash 제거
- 작업 브랜치: `codex/user-api`
- 범위: USER API 구현, 실제 MySQL 스키마 반영, 이메일 로그인 및 프론트엔드 회원 기능 연결
- 이 문서에는 비밀번호, API 키, JWT 서명 키 등 실제 비밀값을 포함하지 않는다.

## 1. 작업 결과

기존 프론트엔드는 로컬 프로필을 선택하거나 아직 구현되지 않은 서버 경로를 호출하는 구조였다. 이번 작업으로 회원가입부터 로그인, 내 정보 수정, 비밀번호 변경, 탈퇴까지 실제 서버와 DB를 사용하도록 연결했다.

회원 정보는 서버에 저장한다. 여행·일정·장소·경비 등의 여행 데이터는 아직 서버 API에 연결하지 않았으며, 서버 사용자 ID별로 분리한 로컬 저장소를 사용한다. 따라서 이번 작업은 전체 여행 서비스의 서버 전환이 아니라 **회원·인증 기능의 서버 연결**이다.

## 2. 구현한 기능

| 기능 | 동작 |
| --- | --- |
| 회원가입 | 이름·이메일·비밀번호와 필수/선택 약관 동의를 서버에 제출한다. 성공 후 로그인 화면으로 전환한다. |
| 로그인 | 이메일과 BCrypt 비밀번호를 검증하고 30분 유효한 JWT를 발급한다. |
| 내 정보 | 로그인 사용자의 이름·이메일·계좌 마스킹 정보를 조회한다. |
| 이름 수정 | 서버에 저장하고 앱의 사용자 표시도 갱신한다. |
| 계좌 저장·삭제 | 서버에서 AES-256-GCM으로 암호화한다. 화면에는 마지막 네 자리만 표시하며 저장 후 입력값을 비운다. |
| 알림·위치 설정 | 푸시 수신 및 위치 공유 설정을 조회·수정한다. 실제 푸시나 위치 전송을 시작하지는 않는다. |
| 약관 내역 | 서버에 저장된 동의 종류·버전·날짜를 표시한다. |
| 비밀번호 변경 | 현재 비밀번호를 확인한 뒤 변경하고 기존 토큰을 무효화한다. 다시 로그인해야 한다. |
| 회원 탈퇴 | 현재 비밀번호로 재인증한 뒤 탈퇴한다. 계정 상태 변경, 비밀번호·계좌 삭제, 이름 익명화, 기기 삭제, 설정 해제를 수행한다. |
| 로그아웃 | 서버에서 해당 계정의 기존 토큰을 무효화하고 앱 세션을 비운다. |
| 인증 만료 | 보호 API의 401 또는 ACCOUNT_UNAVAILABLE 응답을 받으면 로그인 화면으로 전환한다. |
| 기기 등록·삭제 | 서버 API와 프론트 API 클라이언트 메서드는 구현했다. FCM 토큰 발급 연결이 없어 화면에서는 호출하지 않는다. |

## 3. API 목록

기준 경로는 `/api/v1`이다. 성공 응답은 `{ "code": "SUCCESS", "data": ... }`, 오류 응답은 `{ "code": "...", "message": "..." }` 형식이다. ID는 문자열로 전달한다.

| 메서드 | 경로 | 용도 |
| --- | --- | --- |
| POST | `/users` | 회원가입 |
| POST | `/auth/login` | 로그인 및 JWT 발급 |
| POST | `/auth/logout` | 로그아웃 및 기존 토큰 무효화 |
| GET | `/users/me` | 내 정보 조회 |
| PATCH | `/users/me` | 이름·계좌 수정 |
| PUT | `/users/me/password` | 비밀번호 변경 |
| DELETE | `/users/me` | 회원 탈퇴 |
| GET | `/users/me/settings` | 설정 조회 |
| PATCH | `/users/me/settings` | 설정 수정 |
| GET | `/users/me/consents` | 약관 동의 내역 조회 |
| POST | `/users/me/devices` | 기기 등록·갱신 |
| DELETE | `/users/me/devices/{deviceId}` | 본인 기기 삭제 |

가입 성공은 201, 기기는 신규 등록 201·갱신 200을 사용한다. 약관 목록은 `data.consents`에 들어 있다. 프론트에서 처음에는 이를 배열 자체로 처리해 목록이 보이지 않았고, 실제 응답 구조에 맞춰 수정했다.

PATCH에서 생략한 값은 유지한다. 계좌의 명시적 `null`은 삭제를 의미한다. 서버는 지원하지 않는 요청 필드를 거절한다.

## 4. 인증 및 데이터 처리

### 로그인과 토큰

1. 이메일을 정규화하고 비밀번호를 BCrypt로 검증한다.
2. ACTIVE 상태의 LOCAL 계정에 HS256 JWT를 발급한다.
3. 프론트가 `Authorization: Bearer <JWT>`로 보호 API를 호출한다.
4. 서버는 서명·issuer·audience·유효기간과 사용자 상태·tokenVersion을 검사한다.

JWT에는 사용자 ID인 `sub`, `iss`, `aud`, `iat`, `exp`, `tokenVersion`, `auth_time`을 포함한다. 로그아웃·비밀번호 변경·탈퇴 시 tokenVersion이 증가하므로 이 USER/Auth API에서 해당 계정의 기존 토큰은 모두 사용할 수 없게 된다. 탈퇴는 최근 5분 이내 재인증이 필요하다.

토큰은 앱 메모리에만 보관한다. 앱 재시작이나 웹 새로고침 후에는 다시 로그인해야 한다. 비밀번호·JWT·계좌 원문을 로컬 여행 저장소에 기록하지 않는다.

### 회원가입과 계좌

- 비밀번호: 영문과 숫자를 포함한 10~64자, UTF-8 기준 최대 72바이트.
- 필수 약관: TERMS_OF_SERVICE, PRIVACY_POLICY. MARKETING은 선택이며 현재 연결 버전은 1.0이다.
- 계좌: 숫자 8~30자리. 앞자리 0을 보존하고 별도 암호화 키로 저장한다.
- 탈퇴 후 이메일과 약관 기록, 여행 관련 데이터는 남는다. 현재 정책에서는 같은 이메일의 재가입을 허용하지 않는다.

### 프론트엔드 저장소

```text
회원 화면 → UserApi → /api/v1 → Spring Boot → MySQL

여행 화면 → TravelProvider → UserTravelRepository
                         → 서버에서 현재 회원 확인
                         → 계정별 로컬 Workspace 조회·저장
```

http 모드는 `UserTravelRepository`를 사용하며 여행 저장 키는 `server-user-{id}-workspace-v1`이다. 기존 mock의 `workspace-v1`과 `local-session`은 유지한다. 예전 `HttpTravelRepository`는 미래 여행 서버용 제안 어댑터로 남아 있고 현재 http 모드에서는 선택하지 않는다.

## 5. DB 확인 및 반영

서버 실행 실패를 조사해 두 문제를 확인했다.

1. 연결 URL이 존재하지 않는 `travel` DB를 가리켰다. 실제 DB 이름은 `WeGoTrip`이었다.
2. DB 연결 후에는 기존 테이블과 코드의 구조 차이로 스키마 검증이 실패했다.

실제 DB는 `users`가 아닌 `user` 테이블을 사용하고, 비밀번호 컬럼도 `password`였다. 기존 테이블명과 외래키를 유지하도록 엔티티 매핑을 수정했다.

| 반영 항목 | 내용 |
| --- | --- |
| User 매핑 | `user` 테이블과 기존 `password` 컬럼에 연결 |
| 계좌·인증 버전 | `bank_account_encrypted`, `token_version` 추가 |
| 기기 토큰 | 원본 `fcm_token`에 대소문자 구분 collation과 UNIQUE 적용. `token_hash`는 후속 요청으로 제거 |
| 토큰 비교 | `utf8mb4_0900_bin`으로 대소문자·후행 공백까지 구분. 조회는 `findByFcmToken` 사용 |
| 설정 기본값 | 푸시·위치 설정 기본값을 false로 변경, 기존 설정값은 보존 |
| 약관 조회 | 사용자·동의 시각·ID 기준 인덱스 추가 |
| boolean 매핑 | JDBC가 TINYINT(1)을 BIT로 보고하는 특성에 맞춰 강제 TINYINT 지정을 제거 |

마이그레이션 파일:

- `backend/db/migrations/001-user-api.sql`: 과거 저장소의 `users` 테이블용. 현재 WeGoTrip에 적용하는 파일이 아니다.
- `backend/db/migrations/002-existing-wegotrip-user-api.sql`: 실제 `user` 구조에 맞춘 변경. 2026-09-16 적용했다.
- `backend/db/migrations/003-restore-device-token-hash.sql`: 2026-09-19 다시 누락된 token_hash를 복구했다. 중복이 없음을 확인한 후 기존 기기 1건에 해시를 채워 데이터와 외래키를 유지했다. refresh_token은 변경하지 않았다.

이 SQL들은 실제 확인한 상태에 한 번 적용한 수동 마이그레이션이다. 이미 적용한 DB에 재실행하면 안 된다. 애플리케이션은 `ddl-auto=validate`를 유지하며 실행 시 DB를 자동 변경하지 않는다.

## 6. 주요 변경 파일

아래 경로는 저장소 루트 기준이다.

### 프론트엔드

| 파일 | 역할 |
| --- | --- |
| `frontend/src/data/user-api.ts` | USER/Auth 요청, 응답 해제, Bearer 헤더, 오류·만료 처리 |
| `frontend/src/data/user-travel-repository.ts` | 서버 계정과 계정별 로컬 여행 데이터 연결 |
| `frontend/src/data/contracts.ts` | 저장소의 선택적 UserApi 계약 추가 |
| `frontend/src/data/repository.ts` | http 모드에서 새 저장소 선택 |
| `frontend/src/state/travel-provider.tsx` | 회원 API 노출, 프로필 표시 갱신, 만료 세션 정리 |
| `frontend/src/features/auth/auth-screen.tsx` | 실제 로그인, 회원가입, 약관 동의 및 입력 검증 |
| `frontend/src/features/home/user-settings.tsx` | 이름·계좌·설정·약관·비밀번호·탈퇴 화면 |
| `frontend/src/features/home/account-screens.tsx` | 내 정보 화면 통합 및 저장 방식 안내 |
| `frontend/scripts/test-app.cjs` | 응답 계약·인증 오류·계정별 데이터 분리 테스트 |
| `frontend/.env.example` | 서버 연결 예시 설정 |

### 백엔드

| 파일/디렉터리 | 역할 |
| --- | --- |
| `backend/src/main/java/com/travel/travelbackend/controller/AuthController.java` | 이메일 로그인, JWT 발급, 로그아웃 |
| `backend/src/main/java/com/travel/travelbackend/controller/UserController.java` | USER API 10개 엔드포인트 |
| `backend/src/main/java/com/travel/travelbackend/service/UserService.java` | 회원 기능, 소유권·입력 검증, 트랜잭션 |
| `backend/src/main/java/com/travel/travelbackend/userapi/` | 인증 설정, 공통 응답·오류, 입력 검증, 계좌 암호화 |
| `backend/src/main/java/com/travel/travelbackend/entity/` | 회원·설정·기기·약관 엔티티 및 실제 DB 매핑 |
| `backend/src/main/java/com/travel/travelbackend/repository/` | 회원 잠금 조회, 소유 기기·동의 내역 조회 |
| `backend/src/main/resources/application.properties` | DB 검증 모드 및 JPA 설정 |
| `backend/src/test/java/com/travel/travelbackend/UserApiTests.java` | 회원·인증·CORS·권한·암호화 검증 |
| `backend/db/migrations/` | 실제 적용 및 이력용 SQL |

추가 설명은 `frontend/docs/USER-API.md`, `frontend/docs/VALIDATION.md`, `backend/docs/USER-API-REVIEW.md`에 기록했다.

## 7. 실행 방법

서로 다른 PowerShell 터미널에서 실행한다.

```powershell
# 저장소 루트에서: 백엔드
cd backend
.\gradlew.bat bootRun
```

```powershell
# 저장소 루트에서: 프론트엔드
cd frontend
npm run web -- --port 8082
```

브라우저 주소는 `http://localhost:8082`, 백엔드 포트는 8080이다. `mapsRun`은 지도 전용이므로 회원 기능을 사용하려면 `bootRun`이 필요하다.

프론트엔드 `.env.local` 설정:

```dotenv
EXPO_PUBLIC_DATA_SOURCE=http
EXPO_PUBLIC_API_URL=http://localhost:8080/api
EXPO_PUBLIC_MAPS_API_URL=http://localhost:8080/api
```

환경변수 변경 후 Metro를 재시작한다. 실기기는 localhost 대신 PC의 LAN 주소를 사용한다. 웹 CORS는 기본적으로 localhost:8081과 localhost:8082를 허용하며 백엔드 `users.allowed-origins`로 조정한다.

백엔드에는 DB 연결값, `USER_JWT_SECRET`, `USER_BANK_ENCRYPTION_KEY`가 필요하다. JWT 키는 Base64로 인코딩한 최소 32바이트, 계좌 암호화 키는 정확히 32바이트다. 실제 비밀값은 `.env`에만 보관하며 공개 프론트 환경변수에 넣지 않는다. 저장된 계좌가 있는 상태에서 암호화 키를 임의 교체하면 복호화할 수 없다.

## 8. 검증 결과

| 검사 | 결과 |
| --- | --- |
| 프론트 TypeScript 검사 | 통과 |
| 프론트 테스트 | 27개 통과 |
| 백엔드 테스트 | 15개 통과: USER/Auth 11, 지도 3, context 1 |
| 웹 export | 통과 |
| Android/iOS export | 통과 — JS·에셋 번들 검증 |
| 브라우저 | 실제 로그인, 이름 수정, 약관 2건 표시, 계좌 저장·입력 초기화·마스킹, 무효 세션의 로그인 화면 전환 확인 |
| 실제 MySQL/API | 설정 저장·재조회, 비밀번호 변경 후 기존 JWT 401, 재로그인, 재인증 후 탈퇴, 탈퇴 후 보호 API 403 및 로그인 401 확인 |

검증에는 별도로 만든 테스트 회원 2번을 사용했다. 해당 회원은 탈퇴 상태로 남았으며, 다른 회원을 인증·비밀번호 변경·탈퇴 테스트 대상으로 사용하지 않았다.

## 9. 남은 범위와 한계

- 여행·친구·채팅의 실제 서버 저장 및 기기 간 동기화는 미구현이다.
- 자동 로그인, refresh token, 이메일 인증, 소셜 로그인, 비밀번호 찾기·계정 복구는 미구현이다.
- FCM 발급과 실제 푸시 수신, GPS 위치 공유는 연결하지 않았다.
- 약관 전문·버전 운영, 탈퇴 데이터 보관 기간, 재가입 정책은 별도 확정이 필요하다.
- 기존 BCrypt 형식이 아닌 비밀번호는 그대로 보존했으며 현재 로그인으로 인증할 수 없다. 해당 계정은 별도 복구 절차가 필요하다.
- 다른 인증 서비스가 같은 DB를 사용한다면 tokenVersion과 기기 토큰 해시 계약을 함께 맞춰야 한다.
- Android/iOS export 성공은 APK/IPA 생성이나 실기기 설치 검증을 의미하지 않는다.

이번 결과는 기존 `codex/user-api` 브랜치의 작업 파일에 반영했다. 커밋·푸시·배포는 수행하지 않았다.


## 10. 후속 변경 — token_hash 제거 (2026-09-20)

사용자 요청으로 token_hash 엔티티 필드와 SHA-256 계산, findByTokenHash 조회를 제거했다. 원본 fcm_token에 utf8mb4_0900_bin(NO PAD) collation 및 UNIQUE를 적용하고 findByFcmToken으로 중복 검사한다. 적용 SQL은 backend/db/migrations/004-remove-device-token-hash.sql이다. 기존 기기 데이터와 refresh_token은 보존하며, 001~003의 해시 추가/복구 SQL은 과거 이력으로만 남긴다.
