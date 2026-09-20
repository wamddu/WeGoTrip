# USER API 검토 및 구현 기록

기준: 첨부 초안 `USER-API-SPEC.md`. 작업 브랜치: `codex/user-api`.

## 검토 결과

- 경로와 응답 규칙이 명확해 USER API 10개를 구현할 수 있다. 기기 등록 표의 모호한 404 문장은 각주의 의미, 즉 **deviceId를 명시했지만 존재하지 않거나 타인 소유일 때**로 해석했다.
- 최초 구현은 저장소 코드의 `users(id/name/email)`를 기준으로 했다. 2026-09-16 실제 WeGoTrip RDS 확인 결과 기존 테이블은 `user`이며, 코드 매핑을 이에 맞췄다. 비밀번호 해시는 기존 `password` 컬럼을 사용하고 다른 테이블의 외래키는 유지한다.
- 기존 `/api/users`는 비밀번호 없이 사용자를 생성하고 엔티티를 그대로 반환했다. 이를 `/api/v1/users`와 응답 DTO로 대체했다. 기존 무인증 등록 엔드포인트를 별도로 남기지 않았다.
- 프론트엔드는 로컬 여행 저장소를 사용하며, 기존 HTTP 어댑터의 `/auth/register` 및 Workspace 응답과 이 API 계약은 다르다. 환경변수만 HTTP로 바꿔서는 연결되지 않는다. 후속 작업에서 UserApi/UserTravelRepository로 회원 기능을 연결했으며, 여행은 계정별 로컬 저장을 유지한다.
- 후속 사용자 요청으로 POST /api/v1/auth/login 및 /logout을 구현했다. BCrypt 검증 후 30분 JWT를 발급하고 로그아웃 시 tokenVersion으로 기존 토큰을 무효화한다. 재발급·소셜 로그인·이메일 인증·계정 복구는 미구현이다. 테스트는 서명한 JWT로 USER API의 인증 경계를 검증한다. 임시 무인증 userId 헤더나 테스트 로그인 엔드포인트는 만들지 않았다.

## 초안의 미확정 정책에 적용한 개발 기본값

아래는 제품 정책의 최종 확정이 아니라 이 브랜치를 검토하고 테스트하기 위한 구현 선택이다.

| 항목 | 구현 선택 |
| --- | --- |
| 가입 | 이메일·비밀번호, 토큰 반환 없음. 이메일 앞뒤 공백 제거/소문자 정규화. 이메일 소유 인증은 Auth 후속 작업 |
| 이름 | 공백 제거 후 1~50자, 중복 허용 |
| 비밀번호 | 영문·숫자 포함 10~64자, UTF-8 최대 72바이트. BCrypt cost 12 |
| 사용자 값 | 신규 USER/ACTIVE/LOCAL. ACTIVE 외 상태는 USER API에서 차단 |
| 약관 | TERMS_OF_SERVICE 및 PRIVACY_POLICY 필수, MARKETING 선택. 유효 버전은 users.consent-version(기본 1.0) |
| 계좌 | 숫자 8~30자, 앞자리 0 유지. AES-256-GCM 암호화 저장, 마지막 4자리만 응답. 은행 코드·예금주 미지원 |
| 설정 | 푸시/위치 공유 false, 누락 행 조회 시 false 반환, 수정 시 생성. TINYINT ↔ boolean |
| 기기 | ANDROID/IOS/WEB. 원본 fcm_token에 utf8mb4_0900_bin collation과 전역 UNIQUE를 적용해 대소문자를 구분한다. token_hash는 제거했다. 다른 계정으로 자동 이전하지 않음 |
| 탈퇴 | 5분 이내 auth_time 필요. WITHDRAWN 처리, 비밀번호·계좌 삭제, 이름 익명화, 기기 삭제, 설정 해제, tokenVersion 증가 |
| 탈퇴 후 보존 | 이메일과 약관 기록·사용자 ID는 유지, 같은 이메일 재가입은 중복 거절. 데이터 보관/삭제 기한과 재가입 정책은 제품 결정 필요 |
| 연결 데이터 | 실제 DB에 여행/정산/채팅 테이블이 존재한다. 해당 도메인의 서버 로직 및 탈퇴 제한·권한 이전 검사는 아직 미구현이다. 탈퇴는 사용자 상태를 변경하며 연결 데이터를 연쇄 삭제하지 않음 |

약관 본문/버전 카탈로그, 철회·재동의, 탈퇴 보관 정책, 이메일 인증, 소셜 계정 ENUM, 계좌 규칙은 운영 적용 전에 확정해야 한다. 은행 계좌는 암호화 키 미설정 시 저장을 거절하며 평문 저장으로 대체하지 않는다.

## 인증 연동 계약

- 인증 헤더: `Authorization: Bearer <JWT>`.
- 검증 알고리즘: HS256. `USER_JWT_SECRET`에 최소 32바이트 난수의 Base64 값을 설정한다. 미설정 시 회원가입은 가능하지만 모든 Bearer 토큰을 거절한다.
- 필수 claims: `sub`(문자열 사용자 ID), `iss`(기본 wegotrip-auth), `aud`(기본 wegotrip-api), `iat`, `exp`, `tokenVersion`(정수).
- 탈퇴에는 실제 최근 재인증 시각을 초 단위로 담은 `auth_time`이 추가로 필요하다. 일반 토큰 갱신 때 auth_time을 현재 시각으로 바꾸면 안 된다.
- 비밀번호 변경·탈퇴는 DB의 tokenVersion을 증가시킨다. USER API는 매 요청 DB 버전과 비교해 이전 토큰을 거절한다.
- 추후 Auth의 refresh 처리와 다른 보호 API도 계정 상태/tokenVersion을 검사해야 모든 서비스에 세션 무효화가 적용된다. 아직 존재하지 않는 refresh 저장소를 구현했다고 가정하지 않는다.
- 기존 지도 API와 `/api/test`의 접근 방식은 유지한다. 지도 전용 `mapsRun`도 보안 설정을 명시적으로 공유해 새 Security 의존성으로 기본 로그인 페이지가 생기지 않도록 했다.

## 스키마와 실행

1. 현재 WeGoTrip에는 `db/migrations/002-existing-wegotrip-user-api.sql`을 2026-09-16 적용했다. 이 파일은 기존 `user` 스키마용 단독 마이그레이션이며 재실행하지 않는다. `001`은 과거 저장소의 `users` 구조용이므로 현재 DB에 실행하면 안 된다.
2. `backend/.env.example`을 참고해 DB 연결, USER_JWT_SECRET, USER_BANK_ENCRYPTION_KEY를 설정한다. 두 보안 키는 Google 키와 별개의 난수여야 한다.
3. 기본 DDL 모드는 validate이다. Hibernate가 기존 DB를 자동 변경하지 않는다. 버려도 되는 새 개발 DB에서만 DB_DDL_AUTO=create 또는 update를 선택한다.
4. `backend`에서 `./gradlew.bat bootRun`을 실행한다. `mapsRun`에는 USER API가 포함되지 않는다.

USER_BANK_ENCRYPTION_KEY는 정확히 32바이트 난수의 Base64 값이다. 이미 저장한 계좌가 있는 경우 키를 임의로 교체하면 복호화할 수 없으므로 키 이전 절차가 필요하다. 요청/응답에서 비밀번호·계좌·FCM 토큰 원문을 로그에 기록하지 않는다.

## 검증

`./gradlew.bat test`는 실제 운영 DB 대신 H2 MySQL 모드에서 실행한다. 서명/만료/issuer·audience 검증, 이메일 중복, 가입 트랜잭션, 생략/null/미지원 필드, 계좌 암호화 및 마스킹, 설정 기본값, 기기 소유권/토큰 충돌, 약관 정렬, 비밀번호 변경 및 탈퇴의 토큰 무효화를 검증한다.

2026-09-16 실제 MySQL 8.4.9에 002 마이그레이션을 적용하고 `ddl-auto=validate`로 서버가 8080에서 시작하는 것을 확인했다. `GET /api/test`도 HTTP 200을 반환했다. JDBC가 TINYINT(1)을 BIT로 보고하므로 설정 엔티티는 강제 TINYINT 지정 없이 기본 boolean 매핑을 사용한다.

기존 회원 1명, 기기/설정/동의 0행을 유지했다. 기존 계좌 값은 없었으며 암호화 컬럼은 별도 추가했다. 회원의 기존 비밀번호 값은 BCrypt 형식이 아니어서 그대로 보존했으며, 이 계정의 인증 전환/비밀번호 재설정은 Auth 연동 시 처리해야 한다. 후속 Auth 발급 토큰으로 브라우저 로그인과 내 정보 수정까지 검증했다.


2026-09-19 재개 시 외부에서 user_device 구조가 변경되어 token_hash가 다시 누락된 상태였다. 중복 해시가 없음을 검사하고 003-restore-device-token-hash.sql로 기존 기기 1건을 보존하면서 컬럼·값·UNIQUE를 복구했다. refresh_token과 다른 테이블은 변경하지 않았다. 다른 Auth 서비스가 같은 DB를 사용한다면 tokenVersion/토큰 해시 계약을 함께 적용해야 한다.


## 2026-09-20 실행 오류 재발 및 복구

bootRun 실행 시 user_device.token_hash 누락으로 스키마 검증이 실패했다. 실제 테이블에 기기 3건이 있었고 해시 중복은 0건이었다. 현재 테이블이 003 적용 전 상태임을 재확인한 후 003 SQL을 적용해 기존 3건의 해시를 채우고 UNIQUE를 복구했다. 회원·설정·약관·기기 원본 데이터는 삭제하지 않았다.

복구 후 bootRun 정상 기동 및 GET /api/test HTTP 200을 확인했다. 로컬 소스에서 token_hash 제거 SQL은 발견되지 않았다. 실제로 컬럼을 제거한 작업/주체는 확인되지 않았으며, 같은 DB를 사용하는 다른 서비스 또는 수동 DDL/초기화 작업의 확인이 필요하다. 003을 정상 상태의 DB에 반복 실행하는 방식으로 해결하지 않는다.

## 2026-09-20 token_hash 제거

사용자 요청으로 기기 해시 필드·SHA-256 계산·해시 조회를 제거하고 findByFcmToken으로 전환했다. 004 마이그레이션은 원본 fcm_token을 utf8mb4_0900_bin(NO PAD)으로 비교하며 UNIQUE를 적용하고 해시 인덱스/컬럼을 제거한다. 001~003은 과거 이력이며 현재 스키마를 복구하려고 재실행하면 안 된다. 기존 기기 및 refresh_token은 유지한다.

검증: 백엔드 테스트 16개 통과(기기 토큰 대소문자 구분 회귀 테스트 추가). 실제 DB의 기기 3건 유지, token_hash 컬럼 0개, fcm_token의 utf8mb4_0900_bin 및 전체 길이 UNIQUE 확인. 실제 MySQL 문자열 비교는 대소문자 다름=0, 후행 공백 다름=0, 동일=1이었다. 임시 테이블 생성 권한이 없어 실제 MySQL의 중복 INSERT 테스트는 수행하지 않았으며, 중복 거절은 H2 API 테스트와 실제 DB UNIQUE 메타데이터로 확인했다. bootRun 기동 및 /api/test HTTP 200 확인.
