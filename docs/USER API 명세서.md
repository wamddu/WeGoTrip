# WeGoTrip User·Auth API 명세서

기준: 현재 백엔드 구현. 회원 탈퇴는 `currentPassword` 확인과 `DELETED_` 익명화 정책을 적용한다. 모든 경로의 접두사는 `/api/v1`이다.

## 1. 공통 계약

- JSON 필드명은 `camelCase`다. ID는 문자열, 시각은 ISO 8601 UTC 문자열로 반환한다.
- 성공: `{ "code": "SUCCESS", "data": ... }`. 데이터가 없으면 `data: null`이다. 목록은 `data` 안에 자원명으로 감싼다(예: `data.consents`). 생성은 HTTP 201, 그 외 성공은 HTTP 200이다.
- 오류: `{ "code": "오류코드", "message": "설명" }`.
- `GET /users/me` 등 보호 API는 `Authorization: Bearer <accessToken>`을 받는다. JWT의 `sub`에 담긴 사용자 PK로 대상을 조회한다. 사용자 ID를 Body로 받지 않는다.
- 회원가입·로그인은 Authorization이 필요 없다. 토큰 재발급은 Authorization 없이 Refresh Token으로 인증한다. 로그아웃은 Access Token 또는 Refresh Token을 받는다.
- 요청에 정의되지 않은 필드, 빈 Body, 잘못된 자료형은 원칙적으로 `400 INVALID_REQUEST`다. `PATCH`에서는 생략한 필드를 유지한다.

| 공통 오류 | 상태 | 의미 |
| --- | --- | --- |
| `INVALID_REQUEST` | 400 | 요청 필드·자료형·형식 오류 |
| `UNAUTHORIZED` | 401 | Access Token 누락·검증 실패, 유효하지 않은 사용자 또는 세션 버전 |
| `ACCOUNT_UNAVAILABLE` | 403 | 보호 API의 계정 상태가 `ACTIVE`가 아님 |
| `RESOURCE_NOT_FOUND` | 404 | 리소스가 없거나 본인 소유가 아님 |
| `CONFLICT` | 409 | DB 제약 위반 등 충돌 |
| `INTERNAL_SERVER_ERROR` | 500 | 처리 중 서버 오류 |

## 2. API 목록

| 기능 | Method·경로 | 인증 | 성공 상태 |
| --- | --- | --- | --- |
| 회원가입 | `POST /users` | 없음 | 201 |
| 로그인 | `POST /auth/login` | 이메일·비밀번호 | 200 |
| 토큰 재발급 | `POST /auth/tokens/refresh` | Refresh Token | 200 |
| 로그아웃 | `POST /auth/logout` | Access 또는 Refresh Token | 200 |
| 내 정보 조회 | `GET /users/me` | Access Token | 200 |
| 내 정보 수정 | `PATCH /users/me` | Access Token | 200 |
| 비밀번호 변경 | `PUT /users/me/password` | Access Token | 200 |
| 회원 탈퇴 | `DELETE /users/me` | Access Token + 현재 비밀번호 | 200 |
| 설정 조회·수정 | `GET`, `PATCH /users/me/settings` | Access Token | 200 |
| 기기 등록·갱신 | `POST /users/me/devices` | Access Token | 201 또는 200 |
| 기기 등록 해제 | `DELETE /users/me/devices/{deviceId}` | Access Token | 200 |
| 약관 동의 조회 | `GET /users/me/consents` | Access Token | 200 |

## 3. 회원가입

### `POST /api/v1/users`

Body:

| 필드 | 타입 | 필수 | 규칙 |
| --- | --- | --- | --- |
| `email` | string | O | 앞뒤 공백 제거·소문자 변환, 최대 255자, 이메일 형식, 중복 불가 |
| `name` | string | O | 앞뒤 공백 제거, 1~50자 |
| `password` | string | O | 10~64자, 영문과 숫자 각각 1개 이상, UTF-8 기준 최대 72바이트 |
| `consents` | array | O | `{consentType, version}` 객체의 배열 |
| `consents[].consentType` | string | O | `TERMS_OF_SERVICE`, `PRIVACY_POLICY`, `MARKETING` 중 하나. 중복 불가 |
| `consents[].version` | string | O | 현재 서버 설정 버전 `1.0` |

`TERMS_OF_SERVICE`와 `PRIVACY_POLICY`는 필수, `MARKETING`은 선택이다. 비밀번호는 BCrypt 해시로 저장한다. 새 사용자는 `role=USER`, `status=ACTIVE`, `loginProvider=LOCAL`이며 설정값은 둘 다 `false`다. 동의 기록과 기본 설정은 가입과 함께 저장한다. **가입 직후 토큰은 발급하지 않는다.**

```json
{
  "email": "user@example.com",
  "name": "김여행",
  "password": "Password123!",
  "consents": [
    {"consentType": "TERMS_OF_SERVICE", "version": "1.0"},
    {"consentType": "PRIVACY_POLICY", "version": "1.0"}
  ]
}
```

성공 `201`:

```json
{"code":"SUCCESS","data":{"id":"101","email":"user@example.com","name":"김여행","createdAt":"2026-09-24T09:00:00Z"}}
```

주요 오류: `400 PASSWORD_POLICY_VIOLATION`, `400 INVALID_CONSENT`, `400 REQUIRED_CONSENT_MISSING`, `409 EMAIL_ALREADY_EXISTS`. 이메일·이름 형식 오류는 `400 INVALID_REQUEST`다.

## 4. 인증과 토큰

### 4.1 로그인 `POST /api/v1/auth/login`

Body: `email`(string, 필수), `password`(string, 필수), `clientType`(`WEB` 또는 `NATIVE`, 선택). `clientType`을 생략하면 NATIVE 방식으로 응답한다. 로그인 실패는 이메일 존재·비밀번호·상태를 구분하지 않고 `401 INVALID_CREDENTIALS`다. `ACTIVE`인 로컬 계정만 로그인한다.

```json
{"email":"user@example.com","password":"Password123!","clientType":"NATIVE"}
```

성공 `200`의 NATIVE `data`:

```json
{"code":"SUCCESS","data":{"accessToken":"<JWT>","expiresIn":1800,"refreshExpiresAt":"2026-10-24T09:00:00Z","userId":"101","refreshToken":"<token>"}}
```

WEB에서는 `data.refreshToken`이 없고, HttpOnly 쿠키 `wego_refresh`로 전달한다. `expiresIn`은 Access Token 유효기간(초), `refreshExpiresAt`은 Refresh Token의 고정 만료 시각이다.

### 4.2 토큰 재발급 `POST /api/v1/auth/tokens/refresh`

Authorization을 보내지 않는다. `clientType`은 `WEB` 또는 `NATIVE`다. 현재 구현은 생략도 허용한다. Body에 `refreshToken`이 없으면 WEB 방식으로 처리한다.

| 방식 | 요청 Body | Refresh Token 입력 |
| --- | --- | --- |
| NATIVE | `{"clientType":"NATIVE","refreshToken":"<현재 토큰>"}` | JSON Body |
| WEB | `{"clientType":"WEB"}` | HttpOnly 쿠키 `wego_refresh`; 허용된 `Origin` 필요 |

Postman에서는 Authorization을 `No Auth`로 설정하고 직접 추가한 Authorization 헤더도 제거한다. NATIVE 요청은 `raw → JSON` Body를 사용한다.

성공 `200`: `code=SUCCESS`. `data`는 로그인과 같은 구조다. NATIVE는 새 `refreshToken`을 포함하고 WEB은 새 쿠키를 설정한다. **재발급에 성공하면 Access Token과 Refresh Token을 모두 새 값으로 교체**한다. 기존 Refresh Token은 사용 완료 처리한다. 원래 Refresh Token의 만료 시각은 연장하지 않는다.

오류: 누락·형식 오류·만료·버전 불일치는 `401 INVALID_REFRESH_TOKEN`, 이미 사용한 토큰 재사용은 `401 REFRESH_TOKEN_REUSED`다. WEB 요청의 Origin이 허용되지 않으면 `403 ORIGIN_NOT_ALLOWED`다.

### 4.3 로그아웃 `POST /api/v1/auth/logout`

Access Token이 있으면 Bearer 헤더로 보낸다. 또는 NATIVE는 Body의 `refreshToken`, WEB은 쿠키로 보낼 수 있다. Body에서 `clientType`은 선택이다. 응답은 `200 {"code":"SUCCESS","data":null}`이며 WEB Refresh 쿠키를 만료시킨다. 사용자의 `tokenVersion`을 올려 **모든 기기**의 기존 Access·Refresh Token을 무효화한다.

### 4.4 토큰 저장·검증

- Access Token은 HS256 서명 JWT이며 `sub`에 사용자 PK를 넣는다. `iss`, `aud`, `iat`, `exp`, `jti`, `tokenVersion`, `auth_time`을 포함한다. 유효기간은 30분이다.
- Refresh Token은 JWT가 아닌 무작위 문자열이며 최초 로그인부터 30일간 유효하다. 원문은 서버 DB에 저장하지 않는다.
- 서버는 `auth_refresh_credential` 테이블에 SHA-256 digest, 사용자 ID, 세션 버전, 인증·만료 시각, 사용 여부를 저장한다. `user_device.refresh_token`은 현재 인증에서 사용하지 않는다.
- 비밀번호 변경·탈퇴도 `tokenVersion`을 올려 모든 기기의 기존 토큰을 무효화한다.
- 웹 쿠키는 `wego_refresh`, `HttpOnly`, `SameSite=Strict`, `Path=/api/v1/auth`다. `Secure` 여부는 환경 설정에 따른다. WEB 인증 요청에는 허용된 Origin이 필요하다.
- `clientType`은 토큰 전달 방식을 정할 뿐 사용자·기기 인증값은 아니다.

## 5. 내 정보

### 5.1 조회 `GET /api/v1/users/me`

요청 Body·Path·Query 인자는 없다. Bearer Access Token의 `sub`로 사용자를 조회한다.

```json
{"code":"SUCCESS","data":{"id":"101","email":"user@example.com","name":"김여행","role":"USER","status":"ACTIVE","loginProvider":"LOCAL","bankAccountNumberMasked":"********1234","bankAccountNumber":"123456781234","createdAt":"2026-09-24T09:00:00Z","updatedAt":"2026-09-24T09:00:00Z"}}
```

계좌가 없으면 두 계좌 필드 모두 `null`이다. 비밀번호 해시와 `providerId`는 반환하지 않는다. 계좌번호는 암호화해 저장하며 **본인 응답에는 원문과 마스킹값을 모두 반환**한다.

### 5.2 수정 `PATCH /api/v1/users/me`

Body에서 하나 이상 입력한다.

| 필드 | 타입 | 규칙 |
| --- | --- | --- |
| `name` | string, 선택 | 앞뒤 공백 제거 후 1~50자. `null` 불가 |
| `bankAccountNumber` | string 또는 null, 선택 | 숫자 8~30자리. `null`이면 삭제 |

생략한 필드는 유지한다. **이메일 변경은 현재 API에서 지원하지 않는다.** 성공 `200`은 `code=SUCCESS`와 5.1절의 전체 프로필을 반환한다. 잘못된 필드는 `400 INVALID_REQUEST`다.

## 6. 비밀번호 변경

### `PUT /api/v1/users/me/password`

Body: `currentPassword`(필수), `newPassword`(필수). 현재 비밀번호를 확인한 후 새 비밀번호에 3절의 가입 정책을 적용한다. 기존 비밀번호와 같으면 거절한다. 로컬 비밀번호가 없는 계정은 변경할 수 없다. 성공 시 모든 기존 토큰이 무효화된다.

성공 `200`: `{"code":"SUCCESS","data":null}`.

오류: `400 CURRENT_PASSWORD_MISMATCH`, `400 PASSWORD_POLICY_VIOLATION`, `409 PASSWORD_CHANGE_NOT_SUPPORTED`.

## 7. 회원 탈퇴

### `DELETE /api/v1/users/me`

Bearer Access Token과 JSON Body의 **현재 비밀번호**가 필요하다. 최근 로그인 시각만으로 탈퇴를 허용하지 않는다.

```json
{"currentPassword":"Password123!"}
```

| Body 필드 | 타입 | 필수 | 검증 |
| --- | --- | --- | --- |
| `currentPassword` | string | O | 저장된 비밀번호 해시와 일치해야 함 |

처리 결과:

1. 비밀번호가 틀리면 `400 CURRENT_PASSWORD_MISMATCH`로 거절하고 사용자 정보를 변경하지 않는다. 누락·빈 값은 `400 INVALID_REQUEST`다.
2. 사용자 행과 PK를 유지하고 `status=DELETED`로 변경한다.
3. 이메일과 이름을 각각 고유한 `DELETED_` + 32자리 무작위 16진 문자열로 변경한다. 원래 이메일은 비워져 같은 이메일로 새로 가입할 수 있다.
4. 기존 비밀번호 해시를 서버가 생성한 임의 비밀번호의 해시로 교체하고 계좌정보를 삭제한다.
5. `tokenVersion`을 증가시켜 기존 Access·Refresh Token을 무효화한다. 등록 기기를 삭제하고 푸시·위치 공유 설정을 `false`로 변경한다.
6. 여행 등 연결 데이터와 약관 기록은 유지한다. 탈퇴를 막는 추가 조건은 없다.

성공 `200`: `{"code":"SUCCESS","data":null}`. 이후 기존 Access Token으로 보호 API를 호출하면 `403 ACCOUNT_UNAVAILABLE`다.

## 8. 사용자 설정

### 조회 `GET /api/v1/users/me/settings`

Body·Path·Query 인자 없음. 성공 `200`:

```json
{"code":"SUCCESS","data":{"pushNotificationEnabled":false,"locationSharingEnabled":false}}
```

### 수정 `PATCH /api/v1/users/me/settings`

Body: `pushNotificationEnabled?`(boolean), `locationSharingEnabled?`(boolean). 최소 하나 필요하며 `null`은 허용하지 않는다. 생략한 필드는 유지한다. 성공 응답은 조회와 같은 구조다. 회원가입 시 두 설정의 기본값은 `false`다.

## 9. 푸시 기기

### 등록·갱신 `POST /api/v1/users/me/devices`

Body: `fcmToken`(필수 string, 최대 500자), `deviceType`(필수 `ANDROID`·`IOS`·`WEB`), `deviceId`(기존 행 갱신 시 선택 string). 본인 소유 기기만 갱신한다. 같은 사용자의 기존 토큰이면 해당 행을 갱신한다. 다른 사용자나 다른 기기 행과 토큰이 충돌하면 `409 DEVICE_TOKEN_CONFLICT`다.

신규 `201`, 갱신 `200`:

```json
{"code":"SUCCESS","data":{"id":"501","deviceType":"ANDROID","createdAt":"2026-09-24T09:00:00Z","lastActiveAt":"2026-09-24T09:00:00Z"}}
```

### 등록 해제 `DELETE /api/v1/users/me/devices/{deviceId}`

Path: `deviceId`(필수 string). Body 없음. 본인 소유 기기를 삭제한다. 없거나 타인 소유면 `404 RESOURCE_NOT_FOUND`. 성공 `200`: `{"code":"SUCCESS","data":null}`.

## 10. 약관 동의 내역

### `GET /api/v1/users/me/consents`

Body·Path·Query 인자 없음. 본인의 기록을 `agreedAt` 내림차순, 같은 시각이면 ID 내림차순으로 반환한다. 기록이 없으면 `consents: []`다.

```json
{"code":"SUCCESS","data":{"consents":[{"id":"701","consentType":"TERMS_OF_SERVICE","version":"1.0","agreedAt":"2026-09-24T09:00:00Z"}]}}
```

현재 응답은 동의 **기록**이다. 재동의·철회 상태를 별도로 표현하지 않는다.

## 11. 범위와 현재 제약

- 이메일 소유 인증, 이메일 변경, 비밀번호 분실 재설정, 소셜 로그인은 현재 API에 없다.
- 실제 푸시 토큰 발급·수신은 프론트엔드에 아직 연결되지 않았다.
- 기기 API의 `user_device`와 인증용 `auth_refresh_credential`은 별도로 관리된다.
