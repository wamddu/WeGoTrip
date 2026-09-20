# USER API 명세서

## 1. 범위

다음 테이블을 기준으로 작성한다.

- `user`: 회원가입, 내 정보, 비밀번호 변경, 회원 탈퇴
- `user_setting`: 사용자 설정
- `user_device`: 푸시 기기 등록·갱신·해제
- `user_consent`: 약관 동의 내역

로그인·로그아웃·토큰 재발급·소셜 인증은 Auth API, 친구·알림함은 각각 별도 API로 분리하는 초안이다.

> API 경로, 인증 방식, ENUM 값, 기본값, 업무 정책은 ERD만으로 확정할 수 없다. 아래 명세에서 제안한 내용은 **11. 결정이 필요한 사항**에서 확인한다.
> 

---

## 2. 공통 규칙

### 2.1 요청

| 항목 | 규칙 |
| --- | --- |
| Base URL | `/api/v1` |
| Content-Type | JSON 본문이 있는 요청은 `application/json` |
| 인증 | 회원가입을 제외하고 `Authorization: Bearer {accessToken}` 사용 제안 |
| 필드명 | JSON은 `camelCase` |
| ID | DB의 `BIGINT`는 JSON에서 문자열로 전달 |
| 일시 | ISO 8601, UTC. 예: `2026-09-15T03:00:00Z` |
| 본인 식별 | 인증 정보에서 추출. 본문으로 `userId`를 받지 않음 |
| 부분 수정 | 생략한 필드는 유지. `null`은 명시적으로 허용한 필드만 사용 |
| 미지원 필드 | 요청에 정의되지 않은 필드는 `400 INVALID_REQUEST` |

각 API의 요청 인자 표에서는 위 공통 헤더를 생략한다.

### 2.2 성공 응답

최상위 필드는 항상 `code`, `data`다.

**단일 객체**

객체의 필드를 `data`에 바로 넣는다.

```
{
  "code": "SUCCESS",
  "data": {
    "id": "101",
    "name": "김여행"
  }
}
```

**리스트**

`data` 내부에 API 자원에 맞는 필드명을 사용한다. `items`로 고정하지 않는다.

```
{
  "code": "SUCCESS",
  "data": {
    "consents": []
  }
}
```

**반환 데이터 없음**

```
{
  "code": "SUCCESS",
  "data": null
}
```

- 일반 성공은 `200 OK`, 신규 생성은 `201 Created`를 사용한다.
- 성공 응답 본문을 유지하기 위해 `204 No Content`는 사용하지 않는다.
- 성공 `code` 값은 우선 `SUCCESS`로 제안한다.

### 2.3 오류 응답

최상위 필드는 항상 `code`, `message`다. `data`, `errors`는 포함하지 않는다.

```
{
  "code": "INVALID_REQUEST",
  "message": "이름은 1~50자여야 합니다."
}
```

| HTTP 상태 | code | 의미 |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | 필수값 누락, 형식·길이 오류, 미지원 필드 |
| 401 | `UNAUTHORIZED` | 인증 정보 누락·만료·유효하지 않음 |
| 403 | `ACCOUNT_UNAVAILABLE` | 정지·탈퇴 등 이용 불가능한 계정 |
| 404 | `RESOURCE_NOT_FOUND` | 대상이 없거나 본인 소유가 아님 |
| 409 | `CONFLICT` | 현재 상태에서 처리할 수 없음 |
| 429 | `TOO_MANY_REQUESTS` | 요청 횟수 제한 초과 |
| 500 | `INTERNAL_SERVER_ERROR` | 서버 내부 오류 |

API별 업무 오류는 각 항목에 추가한다. 서버 내부 오류 응답에는 DB 정보나 내부 예외 내용을 노출하지 않는다.

---

## 3. API 목록

| 번호 | Method | Endpoint | 기능 | 인증 | 성공 상태 |
| --- | --- | --- | --- | --- | --- |
| 1 | POST | `/users` | 회원가입 | 불필요 | 201 |
| 2 | GET | `/users/me` | 내 정보 조회 | 필요 | 200 |
| 3 | PATCH | `/users/me` | 내 정보 수정 | 필요 | 200 |
| 4 | PUT | `/users/me/password` | 비밀번호 변경 | 필요 | 200 |
| 5 | DELETE | `/users/me` | 회원 탈퇴 | 필요 | 200 |
| 6 | GET | `/users/me/settings` | 사용자 설정 조회 | 필요 | 200 |
| 7 | PATCH | `/users/me/settings` | 사용자 설정 수정 | 필요 | 200 |
| 8 | POST | `/users/me/devices` | 푸시 기기 등록·갱신 | 필요 | 200 / 201 |
| 9 | DELETE | `/users/me/devices/{deviceId}` | 푸시 기기 등록 해제 | 필요 | 200 |
| 10 | GET | `/users/me/consents` | 약관 동의 내역 조회 | 필요 | 200 |

---

## 4. 회원가입

### `POST /api/v1/users`

이메일·비밀번호로 일반 회원을 생성한다.

### Request

- 인증: 불필요
- Path 인자: 없음
- Query 인자: 없음

**Body**

| 인자 | 타입 | 필수 | 설명·검증 |
| --- | --- | --- | --- |
| `email` | string | O | 이메일 형식, 최대 255자, 중복 불가 제안 |
| `password` | string | O | 비밀번호 정책 충족. 세부 정책 미정 |
| `name` | string | O | 앞뒤 공백 제거 후 1~50자 |
| `consents` | array<object> | O | 동의한 약관 목록 |
| `consents[].consentType` | string | O | 서버에서 지원하는 약관 종류 |
| `consents[].version` | string | O | 유효한 약관 버전, 최대 20자 |

```
{
  "email": "user@example.com",
  "password": "MyPassword!123",
  "name": "김여행",
  "consents": [
    {
      "consentType": "TERMS_OF_SERVICE",
      "version": "1.0"
    },
    {
      "consentType": "PRIVACY_POLICY",
      "version": "1.0"
    }
  ]
}
```

### 처리 규칙

- 비밀번호는 해시로 저장한다. 원문을 응답하거나 로그에 기록하지 않는다.
- `role`, `status`, `loginProvider`는 클라이언트가 지정할 수 없다.
- 서버 설정값은 각각 `USER`, `ACTIVE`, `LOCAL`을 임시로 사용한다.
- 요청의 약관 목록은 **동의한 항목만** 전달한다. 선택 약관 미동의는 목록에서 제외한다.
- 필수 약관 누락, 유효하지 않은 버전, 동일 약관 종류 중복을 검증한다.
- 동의 시각은 서버에서 기록한다.
- 사용자, 기본 설정, 동의 내역을 하나의 트랜잭션으로 생성한다.
- 기본 설정은 푸시 알림 `false`, 위치 공유 `false`를 제안한다.
- 가입 성공 시 토큰은 반환하지 않고 별도 로그인을 진행하는 초안이다.

### Response — `201 Created`

```
{
  "code": "SUCCESS",
  "data": {
    "id": "101",
    "email": "user@example.com",
    "name": "김여행",
    "createdAt": "2026-09-15T03:00:00Z"
  }
}
```

| 응답 인자 | 타입 | 설명 |
| --- | --- | --- |
| `data.id` | string | 생성된 사용자 ID |
| `data.email` | string | 가입 이메일 |
| `data.name` | string | 사용자 이름 |
| `data.createdAt` | string | 가입 시각 |

### 주요 오류

| HTTP 상태 | code | 조건 |
| --- | --- | --- |
| 400 | `PASSWORD_POLICY_VIOLATION` | 비밀번호 정책 미충족 |
| 400 | `REQUIRED_CONSENT_MISSING` | 필수 약관 누락 |
| 400 | `INVALID_CONSENT` | 약관 종류·버전 오류 또는 중복 |
| 409 | `EMAIL_ALREADY_EXISTS` | 이미 가입된 이메일 |

---

## 5. 내 정보 관리

### 5.1 내 정보 조회

### `GET /api/v1/users/me`

#### Request

| 구분 | 인자 |
| --- | --- |
| Path | 없음 |
| Query | 없음 |
| Body | 없음 |

#### Response — `200 OK`

```
{
  "code": "SUCCESS",
  "data": {
    "id": "101",
    "email": "user@example.com",
    "name": "김여행",
    "role": "USER",
    "status": "ACTIVE",
    "loginProvider": "LOCAL",
    "bankAccountNumberMasked": "********1234",
    "createdAt": "2026-09-15T03:00:00Z",
    "updatedAt": "2026-09-15T03:00:00Z"
  }
}
```

| 응답 인자 | 타입 | 설명 |
| --- | --- | --- |
| `data.id` | string | 사용자 ID |
| `data.email` | string | 이메일 |
| `data.name` | string | 이름 |
| `data.role` | string | 서비스 권한. 여행 내 역할과 별개 |
| `data.status` | string | 계정 상태 |
| `data.loginProvider` | string | 로그인 제공자 |
| `data.bankAccountNumberMasked` | string 또는 null | 마스킹한 계좌번호. 미등록 시 null |
| `data.createdAt` | string | 가입 시각 |
| `data.updatedAt` | string | 사용자 정보 최종 수정 시각 |

#### 처리 규칙

- `password`, `providerId`, 계좌번호 원문은 반환하지 않는다.
- 계좌번호 마스킹 규칙은 별도 확정한다.
- `role`, `status`, `loginProvider`의 예시 값은 확정 전이다.

---

### 5.2 내 정보 수정

### `PATCH /api/v1/users/me`

#### Request

- Path 인자: 없음
- Query 인자: 없음

**Body**

| 인자 | 타입 | 필수 | 설명·검증 |
| --- | --- | --- | --- |
| `name` | string | 선택 | 앞뒤 공백 제거 후 1~50자. null 불가 |
| `bankAccountNumber` | string 또는 null | 선택 | 계좌번호 등록·변경. null이면 삭제 |

```
{
  "name": "이여행",
  "bankAccountNumber": "12345678901234"
}
```

#### 처리 규칙

- 하나 이상의 수정 인자가 필요하다.
- 생략한 필드는 기존 값을 유지한다.
- 계좌번호는 문자열로 받아 앞자리 `0`을 보존한다.
- 계좌번호 길이·허용 문자는 실제 DDL과 지원 범위를 확인한 후 확정한다.
- `email`, `role`, `status`, `loginProvider`, `providerId`는 이 API로 변경할 수 없다.
- `updated_at`을 갱신한다.

#### Response — `200 OK`

내 정보 조회와 동일한 구조로 수정 결과를 반환한다.

```
{
  "code": "SUCCESS",
  "data": {
    "id": "101",
    "email": "user@example.com",
    "name": "이여행",
    "role": "USER",
    "status": "ACTIVE",
    "loginProvider": "LOCAL",
    "bankAccountNumberMasked": "**********1234",
    "createdAt": "2026-09-15T03:00:00Z",
    "updatedAt": "2026-09-15T04:00:00Z"
  }
}
```

---

## 6. 비밀번호 변경

### `PUT /api/v1/users/me/password`

로그인한 사용자가 현재 비밀번호를 확인하고 새 비밀번호로 변경한다. 비밀번호를 잊어버렸을 때의 재설정 기능은 별도 인증 API가 필요하다.

### Request

- Path 인자: 없음
- Query 인자: 없음

**Body**

| 인자 | 타입 | 필수 | 설명·검증 |
| --- | --- | --- | --- |
| `currentPassword` | string | O | 현재 비밀번호 |
| `newPassword` | string | O | 기존 비밀번호와 다르고 공통 비밀번호 정책을 충족해야 함 |

```
{
  "currentPassword": "MyPassword!123",
  "newPassword": "NewPassword!456"
}
```

### 처리 규칙

- 로컬 비밀번호가 설정된 계정만 사용할 수 있다.
- 현재 비밀번호를 검증한 후 새 비밀번호를 해시로 저장한다.
- `updated_at`을 갱신한다.
- 성공 시 기존 로그인 세션을 무효화하고 재로그인을 요구하는 정책을 제안한다. 구현 방식은 인증 설계에서 확정한다.

### Response — `200 OK`

```
{
  "code": "SUCCESS",
  "data": null
}
```

### 주요 오류

| HTTP 상태 | code | 조건 |
| --- | --- | --- |
| 400 | `CURRENT_PASSWORD_MISMATCH` | 현재 비밀번호 불일치 |
| 400 | `PASSWORD_POLICY_VIOLATION` | 새 비밀번호 정책 미충족 |
| 409 | `PASSWORD_CHANGE_NOT_SUPPORTED` | 로컬 비밀번호가 없는 계정 |

---

## 7. 회원 탈퇴

### `DELETE /api/v1/users/me`

### Request

| 구분 | 인자 |
| --- | --- |
| Path | 없음 |
| Query | 없음 |
| Body | 없음 |

> 최근 재인증을 요구하는 정책을 제안한다. 재인증을 증명하는 방식과 추가 요청 인자 필요 여부는 확정 전이다.
> 

### 처리 규칙 — 제안

- `user.status`를 `WITHDRAWN`으로 변경하는 논리적 탈퇴 방식으로 처리한다.
- `updated_at`을 갱신한다.
- 로그인 세션과 등록된 푸시 기기를 무효화한다.
- 여행·지출·채팅 데이터는 다른 사용자와 연결되어 있으므로 일괄 연쇄 삭제하지 않는다.
- 연결 데이터 유지 범위와 개인정보 제거 정책을 확정한 후 구현한다.
- 여행장 권한 이전·미정산 지출 등이 탈퇴를 제한하는지는 결정이 필요하다.

### Response — `200 OK`

```
{
  "code": "SUCCESS",
  "data": null
}
```

### 주요 오류 — 정책 채택 시 적용

| HTTP 상태 | code | 조건 |
| --- | --- | --- |
| 403 | `REAUTHENTICATION_REQUIRED` | 필요한 재인증을 완료하지 않음 |
| 409 | `WITHDRAWAL_BLOCKED` | 탈퇴 선행 조건을 충족하지 않음 |

---

## 8. 사용자 설정

### 8.1 설정 조회

### `GET /api/v1/users/me/settings`

#### Request

| 구분 | 인자 |
| --- | --- |
| Path | 없음 |
| Query | 없음 |
| Body | 없음 |

#### Response — `200 OK`

```
{
  "code": "SUCCESS",
  "data": {
    "pushNotificationEnabled": false,
    "locationSharingEnabled": false
  }
}
```

| 응답 인자 | 타입 | 설명 |
| --- | --- | --- |
| `data.pushNotificationEnabled` | boolean | 사용자 전체 푸시 알림 허용 여부 |
| `data.locationSharingEnabled` | boolean | 앱 내부 위치 공유 허용 여부 |

#### 처리 규칙

- DB의 `TINYINT(1)`을 boolean으로 반환한다.
- 사용자당 설정 행은 하나만 유지한다.
- 기본값은 둘 다 `false`를 제안한다.
- 설정 행이 없는 기존 사용자는 동일한 기본값을 반환하는 초안이다.

---

### 8.2 설정 수정

### `PATCH /api/v1/users/me/settings`

#### Request

- Path 인자: 없음
- Query 인자: 없음

**Body**

| 인자 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `pushNotificationEnabled` | boolean | 선택 | 전체 푸시 알림 허용 여부 |
| `locationSharingEnabled` | boolean | 선택 | 위치 공유 허용 여부 |

```
{
  "pushNotificationEnabled": true,
  "locationSharingEnabled": false
}
```

#### 처리 규칙

- 하나 이상의 인자가 필요하다.
- `null`은 허용하지 않으며, 생략한 필드는 유지한다.
- 설정 행이 없으면 기본값을 기준으로 생성한다.
- 여행별 푸시는 전체 설정과 `trip_member.notification_enabled`가 모두 `true`일 때 허용하는 정책을 제안한다.
- 기기 운영체제의 알림·위치 권한은 이 API가 변경하지 않는다.
- 실제 위치 수집·공유 API는 이 범위에 포함하지 않는다.

#### Response — `200 OK`

```
{
  "code": "SUCCESS",
  "data": {
    "pushNotificationEnabled": true,
    "locationSharingEnabled": false
  }
}
```

---

## 9. 푸시 기기 관리

### 9.1 기기 등록·토큰 갱신

### `POST /api/v1/users/me/devices`

최초 등록과 기존 FCM 토큰 갱신을 처리한다.

#### Request

- Path 인자: 없음
- Query 인자: 없음

**Body**

| 인자 | 타입 | 필수 | 설명·검증 |
| --- | --- | --- | --- |
| `deviceId` | string | 선택 | 기존 등록 갱신 시 서버에서 발급받은 기기 ID |
| `fcmToken` | string | O | 비어 있지 않은 문자열, 최대 500자 |
| `deviceType` | string | O | 기기 종류. `ANDROID`, `IOS`, `WEB` 제안 |

**최초 등록**

```
{
  "fcmToken": "example-fcm-token",
  "deviceType": "ANDROID"
}
```

**기존 등록 갱신**

```
{
  "deviceId": "501",
  "fcmToken": "renewed-fcm-token",
  "deviceType": "ANDROID"
}
```

#### 처리 규칙 — 제안

| 조건 | 처리 |
| --- | --- |
| `deviceId`가 있고 본인 소유임 | 해당 행의 토큰·기기 종류·최근 활동 시각 갱신 |
| `deviceId`가 없고 동일 토큰이 본인에게 등록됨 | 기존 행 갱신 |
| `deviceId`가 없고 토큰이 등록되지 않음 | 신규 행 생성 |
| `deviceId`가 없거나 본인 소유가 아닌 행을 명시함 | 404 반환 |
| 토큰이 다른 기기 행에 이미 등록됨 | 409 반환 |
- 위 표의 404 조건은 **요청에 `deviceId`를 전달했지만 해당 행이 없거나 타인 소유인 경우**를 의미한다.
- 최초 생성 시 `created_at`, `last_active_at`을 서버 시각으로 저장한다.
- 갱신 시 `created_at`은 유지하고 `last_active_at`을 갱신한다.
- 이 명세에서 최근 활동 시각은 해당 API를 마지막으로 호출한 시각이다.
- 토큰 원문은 응답하지 않는다.
- 토큰 중복 방지 제약과 계정 전환 시 토큰 이전 정책은 확정이 필요하다.

#### Response — 신규 `201 Created` / 갱신 `200 OK`

```
{
  "code": "SUCCESS",
  "data": {
    "id": "501",
    "deviceType": "ANDROID",
    "createdAt": "2026-09-15T03:00:00Z",
    "lastActiveAt": "2026-09-15T04:00:00Z"
  }
}
```

| 응답 인자 | 타입 | 설명 |
| --- | --- | --- |
| `data.id` | string | 서버 발급 기기 ID. 이후 요청의 `deviceId`로 사용 |
| `data.deviceType` | string | 기기 종류 |
| `data.createdAt` | string | 최초 등록 시각 |
| `data.lastActiveAt` | string | 마지막 등록·갱신 시각 |

#### 주요 오류

| HTTP 상태 | code | 조건 |
| --- | --- | --- |
| 404 | `RESOURCE_NOT_FOUND` | 명시한 기기 ID가 없거나 타인 소유 |
| 409 | `DEVICE_TOKEN_CONFLICT` | 토큰이 다른 기기 행에 이미 등록됨 |

---

### 9.2 기기 등록 해제

### `DELETE /api/v1/users/me/devices/{deviceId}`

#### Request

**Path**

| 인자 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `deviceId` | string | O | 서버에서 발급한 기기 ID |
- Query 인자: 없음
- Body: 없음

**요청 예시**

```
DELETE /api/v1/users/me/devices/501
```

#### 처리 규칙

- 본인 소유 기기만 삭제한다.
- 기기가 없거나 다른 사용자 소유이면 `404 RESOURCE_NOT_FOUND`를 반환한다.
- 기기 등록 해제는 푸시 수신 대상에서 제외하는 기능이다. 로그인 세션 종료는 Auth API에서 처리한다.

#### Response — `200 OK`

```
{
  "code": "SUCCESS",
  "data": null
}
```

---

## 10. 약관 동의 내역 조회

### `GET /api/v1/users/me/consents`

### Request

| 구분 | 인자 |
| --- | --- |
| Path | 없음 |
| Query | 없음. 초안에서는 페이지네이션 미적용 |
| Body | 없음 |

### 처리 규칙

- 본인의 동의 기록만 반환한다.
- `agreed_at` 내림차순, 동일 시각이면 ID 내림차순으로 정렬한다.
- 기록이 없으면 `data.consents`를 빈 배열로 반환한다.
- 현재 ERD는 동의 종류·버전·시각만 저장한다. 따라서 이 API는 **동의 기록 조회**이며, 현재 동의가 유효한지나 철회 여부를 보장하지 않는다.

### Response — `200 OK`

```
{
  "code": "SUCCESS",
  "data": {
    "consents": [
      {
        "id": "701",
        "consentType": "TERMS_OF_SERVICE",
        "version": "1.0",
        "agreedAt": "2026-09-15T03:00:00Z"
      },
      {
        "id": "702",
        "consentType": "PRIVACY_POLICY",
        "version": "1.0",
        "agreedAt": "2026-09-15T03:00:00Z"
      }
    ]
  }
}
```

| 응답 인자 | 타입 | 설명 |
| --- | --- | --- |
| `data.consents` | array<object> | 약관 동의 기록 목록 |
| `data.consents[].id` | string | 동의 기록 ID |
| `data.consents[].consentType` | string | 동의한 약관 종류 |
| `data.consents[].version` | string | 동의한 약관 버전 |
| `data.consents[].agreedAt` | string | 동의 시각 |

**빈 목록**

```
{
  "code": "SUCCESS",
  "data": {
    "consents": []
  }
}
```

---

## 11. 결정이 필요한 사항

아래 항목은 확정된 요구사항이 아니다. 선택에 따라 요청 인자·응답·데이터 구조가 달라질 수 있다.

| 번호 | 결정 항목 | 현재 초안 / 확인할 내용 |
| --- | --- | --- |
| 1 | 인증 API 범위 | 로그인·로그아웃·토큰 재발급·비밀번호 재설정은 Auth API로 분리. 이번 명세에 함께 포함할지 결정 필요 |
| 2 | 인증 방식 | Bearer 토큰 가정. 실제 토큰·세션 방식 확정 필요 |
| 3 | 성공 code | 모든 성공에 `SUCCESS` 사용 제안. API별 성공 코드를 사용할지 결정 필요 |
| 4 | 가입 방식 | 이메일·비밀번호 가입만 정의. 소셜 로그인 제공자와 계정 연결 지원 여부 필요 |
| 5 | 이메일 소유 인증 | 인증 후 가입할지, 가입 후 인증할지 결정 필요. 가입 상태와 추가 인자가 달라짐 |
| 6 | 가입 직후 로그인 | 현재는 별도 로그인. 자동 로그인 시 회원가입 응답에 토큰 정보 추가 필요 |
| 7 | 비밀번호 정책 | 최소·최대 길이, 허용 문자, 변경 시 세션 유지 여부 확정 필요 |
| 8 | 이름 정책 | 현재 1~50자이며 중복 허용을 가정. 실명인지 닉네임인지 확인 필요 |
| 9 | 사용자 ENUM | `role`, `status`, `login_provider`의 실제 허용값 확정 필요 |
| 10 | 이메일 변경 | 현재 수정 불가. 지원한다면 새 이메일 인증을 포함한 별도 흐름 필요 |
| 11 | 계좌 정보 | 현재 계좌번호만 있음. 은행 코드·예금주 필요 여부, 입력 규칙, 마스킹 규칙 확정 필요 |
| 12 | 탈퇴 처리 | 논리적 탈퇴 제안. 개인정보 제거 범위, 연결 데이터 처리, 재가입 허용 정책 필요 |
| 13 | 탈퇴 조건 | 여행장 권한 이전·미정산 금액 등이 탈퇴를 막는지 결정 필요 |
| 14 | 재인증 | 탈퇴 전 재인증을 요구할지, 어떤 방식으로 증명할지 결정 필요 |
| 15 | 설정 기본값 | 푸시·위치 공유 모두 false 제안. 여행별 알림과 전체 설정의 우선순위 확인 필요 |
| 16 | 기기 종류·계정 전환 | 지원 플랫폼, 로그아웃 시 기기 해제, 같은 기기에서 계정 전환 시 토큰 이전 정책 필요 |
| 17 | 약관 관리 | 약관 종류, 필수 여부, 유효 버전의 관리 방식 필요. 해당 정의 테이블은 ERD에서 확인되지 않음 |
| 18 | 재동의·동의 철회 | 현재 최초 동의 저장과 기록 조회만 포함. 지원하려면 추가 API와 철회 상태·이력 구조 검토 필요 |

### 실제 DDL 확인이 필요한 부분

이미지만으로 다음 항목은 확정할 수 없다.

- 잘려 보이는 `bank_account_number`, `device_type`, `consent_type` 등의 정확한 길이.
- 컬럼별 NULL 허용 여부와 기본값.
- 이메일 및 FCM 토큰의 고유 제약 여부.
- 로컬 회원의 `provider_id`, 소셜 회원의 `password` 처리 방식.
- 사용자 삭제 시 외래키의 삭제 규칙.

특히 **가입 방식·이메일 인증·비밀번호 정책·탈퇴 정책·약관 종류**를 먼저 결정하면 주요 API 계약을 확정할 수 있다.