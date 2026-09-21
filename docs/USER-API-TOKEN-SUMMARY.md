# USER API 및 토큰 관리 요약

기준: 2026-09-21 현재 구현. 공통 주소는 `/api/v1`이며 아래 경로 앞에 붙인다.

## 1. USER API

회원가입을 제외한 USER API는 `Authorization: Bearer <accessToken>`이 필요하다. `/me`의 사용자는 요청 본문이 아닌 인증 토큰으로 결정한다.

| 기능 | 메서드·경로 | 주요 입력/결과 |
| --- | --- | --- |
| 회원가입 | POST /users | name, email, password, consents → 회원 ID, 201 |
| 내 정보 조회 | GET /users/me | 프로필, 본인의 전체 계좌번호(bankAccountNumber) |
| 내 정보 수정 | PATCH /users/me | name, bankAccountNumber |
| 비밀번호 변경 | PUT /users/me/password | currentPassword, newPassword |
| 회원 탈퇴 | DELETE /users/me | 최근 5분 내 비밀번호 로그인 필요 |
| 설정 조회 | GET /users/me/settings | 푸시 알림·위치 공유 설정 |
| 설정 수정 | PATCH /users/me/settings | pushNotificationEnabled, locationSharingEnabled |
| 기기 등록/갱신 | POST /users/me/devices | fcmToken, deviceType, 선택 deviceId |
| 기기 삭제 | DELETE /users/me/devices/{deviceId} | 본인 기기 삭제 |
| 약관 동의 내역 | GET /users/me/consents | data.consents 배열 |

- 가입의 `consents`는 `{consentType, version}` 배열이다. `TERMS_OF_SERVICE`, `PRIVACY_POLICY`는 필수, `MARKETING`은 선택이다. 현재 약관 버전은 `1.0`이다.
- 가입 직후에는 토큰을 발급하지 않으므로 별도 로그인이 필요하다.
- 프로필 수정에서 필드 생략은 기존 값 유지, `bankAccountNumber: null`은 계좌 삭제다. 비밀번호는 BCrypt 해시, 계좌는 암호화해 저장한다.
- 기기 API는 구현되어 있으나 프론트의 실제 FCM 발급·푸시 수신은 아직 연결하지 않았다.

공통 응답은 성공 `{ "code": "SUCCESS", "data": ... }`, 실패 `{ "code": "오류코드", "message": "설명" }`이다. ID는 문자열, 시각은 UTC ISO8601 형식이다.

## 2. 인증 API

| 기능 | 메서드·경로 | 요청 본문 |
| --- | --- | --- |
| 로그인 | POST /auth/login | email, password, clientType |
| 토큰 재발급 | POST /auth/tokens/refresh | clientType, 네이티브는 refreshToken 추가 |
| 로그아웃 | POST /auth/logout | clientType, 네이티브는 refreshToken 추가 |

`clientType`은 `WEB` 또는 `NATIVE`다. 프론트는 항상 명시하며 로그인에서 생략하면 `NATIVE`로 처리한다.

로그인·재발급 응답에는 `accessToken`, `expiresIn`(1800초), `refreshExpiresAt`, `userId`가 포함된다. `NATIVE`에만 `refreshToken`을 본문으로 반환한다. `WEB`은 응답 쿠키로 전달한다.

재발급·로그아웃에는 만료된 access token을 보내지 않는다. 웹 요청은 `credentials: "include"`를 사용해 쿠키를 전송한다.

## 3. 토큰 저장 및 수명

| 구분 | Access token | Refresh token |
| --- | --- | --- |
| 역할 | 보호 API 인증 | 새 토큰 발급 |
| 형식 | 서명된 JWT | 무작위 문자열 |
| 유효기간 | 발급 후 30분 | 최초 로그인 후 30일, 갱신해도 만료 시각 고정 |
| 웹 저장 | 메모리 | HttpOnly 쿠키 `wego_refresh` |
| 모바일 저장 | 메모리 | Expo SecureStore |
| 서버 저장 | 토큰 원문 저장 안 함 | 별도 `auth_refresh_credential` 테이블에 SHA-256 digest 저장 |

Refresh 저장 테이블에는 회원 ID, tokenVersion, 최초 인증·만료 시각, 사용 여부도 저장한다. 원문 토큰은 DB에 저장하지 않는다. 제거했던 `user_device.token_hash`는 사용하지 않으며, 기존 `user_device.refresh_token`도 현재 인증에는 사용하지 않는다.

웹 쿠키는 HttpOnly, SameSite=Strict, Path=/api/v1/auth로 설정한다. 운영 HTTPS는 `AUTH_COOKIE_SECURE=true`, 로컬 HTTP 개발은 `false`를 사용한다. 허용 Origin을 검사하고 웹·API는 같은 사이트 내에 배치한다. 토큰을 localStorage나 여행 데이터에 저장하지 않는다. 웹 localStorage에는 로그아웃 여부만 기록한다.

## 4. 재발급·로그아웃 흐름

1. 로그인 성공 → access token과 refresh token을 각 저장소에 보관한다.
2. 보호 API가 401 반환 → refresh token으로 재발급한다. 여러 요청이 동시에 실패하면 하나의 재발급 작업을 공유한다.
3. 재발급 성공 → **두 토큰을 교체**하고 원래 API 요청을 한 번만 재시도한다. 이전 refresh token은 사용 완료로 표시한다.
4. 앱 시작·웹 새로고침 → 저장된 refresh token으로 로그인 복원을 시도한다.
5. 재발급 실패·응답 유실 → 자동 재발급 재시도를 중단하고 로컬 로그인을 해제한다.

**tokenVersion**은 회원별 세션 버전 번호다. 서버는 토큰 발급 당시 버전과 회원의 현재 버전을 비교한다. 로그아웃·비밀번호 변경·탈퇴 시 버전을 증가시켜 **모든 기기의 기존 access/refresh token을 무효화**한다.

이미 사용한 refresh token이 같은 버전에서 다시 제출되면 재사용으로 판단해 기존 세션 전체를 무효화한다. 갱신은 JWT의 `auth_time`을 새로 만들지 않으므로 회원 탈퇴에 필요한 최근 비밀번호 인증을 대신할 수 없다.

## 5. 주요 오류와 검증

| 오류 | 의미 |
| --- | --- |
| 401 INVALID_CREDENTIALS | 로그인 정보 불일치 |
| 401 INVALID_REFRESH_TOKEN | 재발급 토큰 누락·만료·무효화 |
| 401 REFRESH_TOKEN_REUSED | 이미 사용한 토큰 재사용 감지 |
| 403 ORIGIN_NOT_ALLOWED | 허용되지 않은 웹 Origin |
| 403 REAUTHENTICATION_REQUIRED | 탈퇴 전 비밀번호 재인증 필요 |

백엔드 21개·프론트엔드 34개 테스트, web/Android/iOS 번들 검증, 실제 DB 재발급 및 브라우저 로그인 복원을 확인했다. 모바일 실기기 SecureStore 검증과 만료된 refresh 레코드의 자동 정리 작업은 남아 있다.

상세 구현: [토큰 재발급 구현 문서](AUTH-REFRESH-2026-09-21.md).
