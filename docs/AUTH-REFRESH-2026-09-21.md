# 로그인 토큰 재발급 구현

## 동작

- Access token: 30분 유효한 JWT, 프론트 메모리에 보관한다.
- Refresh token: 로그인 시 발급하며 30일 후 만료한다. 재발급해도 최초 만료 시각은 연장하지 않는다.
- 보호 API가 401을 반환하면 토큰을 재발급하고 해당 요청을 한 번만 다시 보낸다. 동시 요청은 하나의 재발급 작업을 공유한다.
- 앱 시작/웹 새로고침 시 refresh token으로 로그인 상태를 복원한다.
- 로그아웃, 비밀번호 변경, 탈퇴는 계정의 tokenVersion을 변경해 기존 access/refresh token을 무효화한다. 현재 로그아웃은 모든 기기에 적용된다.
- 재발급 시 refresh token을 교체한다. 이미 사용한 토큰이 같은 tokenVersion에서 다시 제출되면 해당 계정의 기존 세션 전체를 무효화한다.
- 재발급 후에도 JWT의 auth_time은 최초 비밀번호 인증 시각을 유지한다. 탈퇴용 최근 재인증을 대신할 수 없다.

## API 계약

기준 경로: `/api/v1/auth`. 성공 응답은 `{ "code": "SUCCESS", "data": ... }`이다.

| 요청 | 본문 | 동작 |
| --- | --- | --- |
| POST /login | email, password, clientType | 로그인 및 두 토큰 발급 |
| POST /tokens/refresh | clientType, 네이티브는 refreshToken | access/refresh token 교체 |
| POST /logout | clientType, 네이티브는 refreshToken | 세션 무효화 및 웹 쿠키 삭제 |

`clientType`은 `WEB` 또는 `NATIVE`이며 로그인에서 생략하면 `NATIVE`다. 프론트 구현은 항상 명시한다. 재발급/로그아웃 요청에는 만료된 Bearer 토큰을 보내지 않는다.

네이티브 재발급 요청 예시:

```json
{ "clientType": "NATIVE", "refreshToken": "로그인 응답에서 받은 토큰" }
```

로그인/재발급의 data에는 `accessToken`, `expiresIn`(1800), `refreshExpiresAt`(UTC ISO8601), `userId`(문자열)가 있다. NATIVE 응답에만 `refreshToken`이 추가된다.

웹은 `{ "clientType": "WEB" }`를 보내고 브라우저가 `wego_refresh` 쿠키를 전송한다. JavaScript에는 refresh token을 반환하지 않는다. 쿠키는 HttpOnly, SameSite=Strict, Path=/api/v1/auth이며 운영 기본값은 Secure다. 토큰 응답에는 Cache-Control: no-store를 적용한다.

잘못되거나 만료/무효화된 자격증명은 401 `INVALID_REFRESH_TOKEN`, 사용한 토큰의 재사용은 401 `REFRESH_TOKEN_REUSED`, 허용하지 않은 웹 Origin은 403 `ORIGIN_NOT_ALLOWED`다. 웹 재발급의 401 응답은 쿠키도 삭제한다.

## 저장소 및 DB

네이티브는 expo-secure-store를 사용한다. 웹은 HttpOnly 쿠키를 사용하며 localStorage에는 비밀값 없이 로그아웃 여부만 기록한다. Access token과 refresh token을 여행 저장소에 넣지 않는다.

`backend/db/migrations/005-auth-refresh-credentials.sql`은 별도 `auth_refresh_credential` 테이블을 만든다. 토큰 원문 대신 SHA-256 digest, 회원 ID, tokenVersion, 최초 인증/만료 시각, 사용 여부를 저장한다. 사용자와 자격증명을 잠가 MySQL REPEATABLE READ에서도 같은 토큰을 동시에 두 번 소비하지 못하게 한다.

앞서 제거한 `user_device.token_hash`는 다시 추가하지 않았다. 기존 `user_device.refresh_token`은 사용하지 않으며 기기 데이터는 변경하지 않는다. 005는 앞선 작업에서 실제 DB에 적용했다. 이미 적용한 DB에는 재실행하지 않는다. 만료된 자격증명의 자동 정리 작업은 아직 없으며, 정리가 필요하면 만료 시각이 지난 행만 대상으로 해야 한다.

## 실행 설정

`backend/.env`에는 기존 DB_URL, DB_USERNAME, DB_PASSWORD, USER_JWT_SECRET, USER_BANK_ENCRYPTION_KEY 설정이 필요하다. 기존 키를 임의로 교체하지 않는다. PowerShell에서 backend 디렉터리로 이동한 뒤 `./gradlew.bat bootRun`으로 실행한다.

로컬 HTTP 개발에는 `AUTH_COOKIE_SECURE=false`, 운영 HTTPS에는 `AUTH_COOKIE_SECURE=true`를 사용한다. `users.allowed-origins`에 웹의 정확한 Origin을 지정하며 기본값은 localhost:8081과 localhost:8082다. CORS는 credentials를 허용한다. SameSite=Strict이므로 운영 웹과 API는 같은 사이트 내에 배치해야 한다. localhost와 127.0.0.1을 혼용하지 않는다.

SecureStore가 추가되어 기존 네이티브 개발 빌드/앱은 다시 빌드해야 한다. 실기기의 API 주소에는 PC의 localhost가 아닌 접근 가능한 서버 주소를 사용한다.

## 오류 및 동시성 처리

- 응답 유실/시간 초과로 토큰 소비 여부가 불명확하면 재발급을 자동 재시도하지 않고 로컬 로그인을 해제한다.
- 웹은 Web Locks를 지원할 때 같은 Origin의 탭 사이에서 재발급을 직렬화한다. 지원하지 않는 브라우저에서 충돌하면 재로그인이 필요할 수 있다.
- 다른 탭에서 로그인 계정이 바뀌면 대기 중이던 수정 요청을 다른 계정으로 재전송하지 않는다.
- 로그아웃은 진행 중인 재발급을 기다린 후 최신 자격증명을 무효화한다. 이전 계정 요청의 늦은 응답이 새 로그인을 덮어쓰거나 해제하지 못하게 검사한다.

## 검증

2026-09-21 백엔드 테스트 21개 통과. 회전/재사용 차단, 동시 재발급, 로그아웃/비밀번호 변경/탈퇴 후 무효화, 최근 재인증 시각 유지, 웹 쿠키/CORS/Origin 검사를 포함한다.

프론트엔드 typecheck 및 테스트 34개, 최종 코드의 web/Android/iOS export가 통과했다. Android/iOS export는 JavaScript 번들 검사이며 실기기의 보안 저장소 검증과 다르다.

처음에는 backend/.env가 없어 서버 시작이 실패했으나 사용자가 복원한 뒤 실제 MySQL 연결과 8080 포트 시작을 확인했다. 테스트 전용 계정으로 실제 API의 동시 재발급 결과 200/401, 만료 시각 유지, 재사용 후 후속 토큰 무효화, 재로그인, 로그아웃 후 재발급 401을 확인했다. 다른 회원은 테스트에 사용하지 않았다.

브라우저에서 테스트 계정 로그인과 새로고침 후 동일 계정 복원, 로그아웃 및 이후 새로고침에서도 로그인 화면 유지을 확인했다. 실제 기기의 SecureStore 및 앱 재시작 검증은 수행하지 않았다.
