# 여행방 생성·친구 기능 정리

기준일: 2026-09-25. 현재 코드에 구현된 동작을 기준으로 작성했다.

## 1. 구현 범위

| 기능 | 현재 동작 |
| --- | --- |
| 친구 찾기 | 가입 이메일 정확 검색, 본인·비활성 계정 제외 |
| 친구 관계 | 요청 → 상대방 수락 후 친구 등록. 거절·취소·친구 삭제 지원 |
| 여행방 | 생성·목록·상세·멤버 조회, 여행장 정보 수정·보관·재개 |
| 친구 초대 | 여행장이 친구에게 초대 발송 → 상대방 수락 후 참여 |
| 코드 참여 | 여행장이 코드 발급 → 로그인한 사용자가 미리보기 확인 후 참여 |
| 데이터 저장 | 여행 기본 정보·멤버·친구·요청·초대는 서버 MySQL에 저장 |

**친구 요청 수락과 여행 초대 수락은 별개다.** 친구가 되어도 여행에 자동 참여하지 않고, 초대 발송만으로 멤버가 추가되지 않는다.

## 2. 앱에서 사용하는 순서

### 친구 등록

1. **내 정보 → 친구 관리**에서 상대방의 가입 이메일을 검색한다.
2. 검색된 회원에게 친구 요청을 보낸다.
3. 상대방이 친구 관리의 **받은 요청**에서 수락한다.
4. 양쪽 친구 목록에 상대방이 나타난다.

받은 요청은 수락·거절, 보낸 요청은 취소할 수 있다. 친구 삭제는 양쪽의 친구 관계를 해제하며 기존 여행 멤버십을 삭제하지 않는다.

### 여행 생성과 친구 초대

1. **새로 만들기**에서 여행명·목적지·시작일·종료일·예산을 입력한다.
2. 초대할 친구를 선택하고 생성한다. 친구 없이 혼자 생성할 수도 있다.
3. 생성자는 여행장으로 즉시 참여한다. 선택한 친구에게는 대기 중 초대가 생성된다.
4. 상대방은 **알림 → 받은 여행 초대**에서 수락한다.
5. 수락 후 여행 목록과 멤버 목록에 반영된다.

생성 후에도 여행 상세의 **멤버와 여행 설정**에서 친구를 추가 초대할 수 있다. 기본 정보 수정·보관·재개는 기존 여행 편집 화면을 사용한다.

### 초대 코드로 참여

1. 여행장이 관리 화면에서 코드를 발급해 공유한다.
2. 참여자는 로그인 후 **새로 만들기 → 초대 코드로 참여**에서 코드를 입력한다.
3. 여행 미리보기를 확인하고 참여를 확정한다.

코드 참여에는 친구 관계가 필요하지 않다. 미리보기 요청만으로는 가입되지 않는다.

## 3. 주요 정책

| 항목 | 규칙 |
| --- | --- |
| 여행 역할 | 생성자 OWNER, 나머지 MEMBER. 권한은 `trip.owner_id`로 판단 |
| 정원 | 여행장 포함 최대 30명. 실제 참여 시 정원 검사 |
| 제목·목적지 | 앞뒤 공백 제거 후 각각 1~100자 |
| 여행 기간 | 시작일·종료일 포함 1~90일 |
| 예산 | 정수 0~1,000,000,000 |
| 생성 시 초대 대상 | 수락된 친구 최대 29명, 본인·중복 ID 불가 |
| 직접 초대 | 여행장만 발송, 수락된 친구만 대상 |
| 여행 초대 만료 | 발송 시점부터 7일 |
| 초대 코드 | 26자리 영문 대문자·숫자 2~7, 7일 유효 |
| 코드 재발급 | 이전 코드를 폐기하고 새 코드 발급 |
| 코드 저장 | 원문 대신 SHA-256 digest 저장. 원문은 발급 응답에서 전달 |
| 친구 요청 중복 | 두 회원 사이 PENDING 요청은 방향과 무관하게 하나만 유지 |
| 친구 요청 만료 | 자동 만료 없음 |

서로 동시에 친구 요청을 보내도 자동 수락되지 않는다. 기존 대기 요청이 반환되며 수신자의 수락이 필요하다. 여행 초대는 자리를 예약하지 않으므로 수락 시점에 정원이 찼다면 참여할 수 없다.

### 보관과 재개

- ACTIVE 여행은 여행장이 수정·초대·코드 발급할 수 있다.
- 보관하면 PENDING 초대를 취소하고 기존 코드를 폐기한다.
- ARCHIVED 여행은 기존 멤버가 조회할 수 있다.
- 재개 요청은 `version`과 `status: "ACTIVE"`만 보낸다. 기본 정보 변경은 재개 후 별도로 처리한다.
- 재개해도 취소된 초대와 폐기된 코드가 복원되지는 않는다.

### 회원 탈퇴

- 다른 멤버가 있는 ACTIVE 여행의 여행장은 먼저 보관해야 한다 (`409 ACTIVE_TRIP_OWNER`).
- 탈퇴 시 회원 행을 실제 DELETE하고 친구 관계·요청·본인 관련 초대·멤버십 등도 삭제한다.
- 소유 여행은 보관하고 `owner_id`를 NULL로 해제해 다른 멤버의 조회를 유지한다.
- 탈퇴한 여행장의 API 표시는 `owner: { "id": "", "name": "탈퇴한 사용자" }`이다. 남은 일반 멤버는 여행을 재개할 수 없다.

## 4. API 목록

공통 prefix는 `/api/v1`, 인증은 `Authorization: Bearer <accessToken>`이다. 아래 API에 refresh token을 Bearer로 넣지 않는다. ID는 JSON에서 문자열로 전달한다.

성공 응답은 `{ "code": "SUCCESS", "data": ... }` 형식이다. 목록은 `data.items`, `data.nextCursor`를 반환하며 `cursor`, `limit`으로 페이지를 조회한다. 기본 limit은 20, 최대 100이다.

### 친구

| Method | 경로 | 요청·설명 |
| --- | --- | --- |
| POST | `/users/lookup` | `{ "email": "friend@example.com" }`, 공개 프로필 또는 `user: null` |
| GET | `/friends` | 내 친구 목록 |
| POST | `/friend-requests` | `{ "recipientId": "2" }`, 신규 201 / 대기 요청 재사용 200 |
| GET | `/friend-requests` | `direction=received\|sent`, `status=PENDING\|ACCEPTED\|DECLINED\|CANCELLED` |
| POST | `/friend-requests/{id}/accept` | 수신자가 수락 |
| POST | `/friend-requests/{id}/decline` | 수신자가 거절 |
| POST | `/friend-requests/{id}/cancel` | 발신자가 취소 |
| DELETE | `/friends/{userId}` | 상대 회원 ID로 친구 관계 삭제 |

요청 목록 기본값은 `direction=received`, `status=PENDING`이다. 검색과 친구 목록의 공개 프로필은 회원 ID·이름이며 계좌번호 등 개인정보를 포함하지 않는다.

### 여행방

| Method | 경로 | 요청·설명 |
| --- | --- | --- |
| POST | `/trips` | 여행 생성. UUID 형식 `Idempotency-Key` 헤더 필수, 성공 201 |
| GET | `/trips` | 참여 중인 여행 목록. `status=ACTIVE\|ARCHIVED\|ALL`, 기본 ACTIVE |
| GET | `/trips/{id}` | 멤버만 상세 조회 |
| PATCH | `/trips/{id}` | 여행장만 수정. 현재 `version` 필수 |
| GET | `/trips/{id}/members` | 멤버 목록 |

여행 생성 본문 예시:

```json
{
  "title": "부산 여행",
  "destination": "부산",
  "startDate": "2026-10-10",
  "endDate": "2026-10-12",
  "budget": 500000,
  "inviteeIds": ["2", "3"]
}
```

생성 응답의 `data.trip`에 여행 정보, `data.invitations`에 생성된 초대가 반환된다. 초대한 친구가 수락하기 전 `memberCount`는 1이다. `inviteeIds`는 생략하거나 빈 배열로 보낼 수 있다.

정보 수정 예시:

```json
{ "version": 0, "title": "부산 주말 여행", "budget": 600000 }
```

보관 예시:

```json
{ "version": 1, "status": "ARCHIVED" }
```

`version`은 수정 성공 시 증가한다. 최신 값과 다르면 `409 VERSION_CONFLICT`이므로 재조회 후 수정한다.

### 초대·코드

| Method | 경로 | 요청·설명 |
| --- | --- | --- |
| POST | `/trips/{id}/invitations` | `{ "inviteeId": "2" }`, 신규 201 / 대기 초대 재사용 200 |
| GET | `/trips/{id}/invitations` | 여행장이 보낸 초대 조회 |
| GET | `/users/me/trip-invitations` | 내가 받은 초대 조회 |
| POST | `/trip-invitations/{id}/accept` | 수신자가 수락하고 참여 |
| POST | `/trip-invitations/{id}/decline` | 수신자가 거절 |
| POST | `/trip-invitations/{id}/cancel` | 발신 여행장이 취소 |
| POST | `/trips/{id}/invite-code` | 코드 발급·교체, 201 및 `code`, `expiresAt` 반환 |
| DELETE | `/trips/{id}/invite-code` | 현재 코드 폐기 |
| POST | `/trip-join/preview` | `{ "code": "발급받은 코드" }`, 여행 요약·정원·참여 여부 |
| POST | `/trip-join` | 같은 코드 본문으로 참여. 신규 참여 201 / 이미 멤버이면 200 |

초대 목록의 `status`는 PENDING(기본), ACCEPTED, DECLINED, CANCELLED, EXPIRED 중 하나다. 친구 요청의 상태와 달리 여행 초대에는 EXPIRED가 있다.

## 5. 중복 요청·권한·오류 처리

- 여행 생성은 회원·작업·Idempotency-Key별 성공 응답을 24시간 보관한다. 응답 유실로 재시도할 때 같은 입력과 같은 키를 사용한다. 같은 유효 키로 다른 입력을 보내면 `409 IDEMPOTENCY_KEY_REUSED`이다.
- 회원·여행·관계 행 잠금과 DB 제약으로 동시 요청의 중복 관계·정원 초과를 방지한다.
- API는 JWT뿐 아니라 회원 상태와 `tokenVersion`도 검사한다.
- 여행 멤버가 아닌 사용자의 상세 조회는 404로 처리한다.
- 친구 요청·여행 생성·직접 초대는 사용자별 합산 시간당 30회로 제한한다.
- 이메일 검색·코드 미리보기·코드 참여는 사용자별 및 직접 연결 IP별 합산 분당 10회로 제한한다. 초과 시 429이다.

| 대표 오류 | 의미 |
| --- | --- |
| `ALREADY_FRIENDS` | 이미 친구 관계 |
| `REQUEST_NOT_PENDING` | 이미 다른 상태로 처리된 친구 요청 |
| `INVITEE_NOT_FRIEND` | 직접 초대 대상이 수락된 친구가 아님 |
| `TRIP_OWNER_REQUIRED` | 여행장 권한 필요 |
| `TRIP_ARCHIVED` | 보관된 여행에서 허용되지 않는 작업 |
| `TRIP_FULL` | 참여 시 정원 초과 |
| `INVITATION_EXPIRED` | 여행 초대 만료, HTTP 410 |
| `INVALID_INVITE_CODE` | 유효하지 않거나 만료·폐기된 코드, HTTP 404 |
| `VERSION_CONFLICT` | 다른 수정으로 버전 불일치 |
| `TOO_MANY_REQUESTS` | 요청 횟수 초과 |

## 6. DB와 코드 구조

| 테이블 | 역할 |
| --- | --- |
| `trip` | 여행 기본 정보·여행장·상태·정원·수정 버전 |
| `trip_member` | 실제 참여 멤버, 여행과 회원 조합 중복 방지 |
| `friend_request` | 요청 발신자·수신자·처리 상태 |
| `friendship` | 수락된 친구 관계. 작은 회원 ID / 큰 회원 ID 순으로 저장 |
| `trip_invitation` | 여행 직접 초대·수신자·상태·만료 시각 |
| `trip_invite_code` | 코드 digest·만료·폐기 시각 |
| `api_idempotency` | 여행 생성 재시도용 요청 digest·응답·유효 기간 |
| `api_rate_limit` | 요청 제한 카운터 |

요청 처리 흐름:

```text
기존 프론트 화면
  → TravelProvider / UserTravelRepository 또는 TripApi
  → UserApi (인증 및 토큰 갱신 공유)
  → TripController
  → TripService / FriendService
  → TripStore (JdbcTemplate)
  → MySQL
```

| 코드 | 책임 |
| --- | --- |
| [TripController.java](../backend/src/main/java/com/travel/travelbackend/controller/TripController.java) | 라우팅·요청 제한·응답 |
| [TripService.java](../backend/src/main/java/com/travel/travelbackend/tripapi/TripService.java) | 여행·초대·코드·탈퇴 관계 처리 |
| [FriendService.java](../backend/src/main/java/com/travel/travelbackend/tripapi/FriendService.java) | 회원 검색·친구 요청·관계 처리 |
| [TripStore.java](../backend/src/main/java/com/travel/travelbackend/tripapi/TripStore.java) | SQL·회원 검사·잠금·페이지 처리 |
| [trip-api.ts](../frontend/src/data/trip-api.ts) | 프론트 API 호출·페이지 순회 |
| [user-travel-repository.ts](../frontend/src/data/user-travel-repository.ts) | 기존 명령과 서버 API 연결, 서버·기기 데이터 결합 |
| [invitation-panels.tsx](../frontend/src/features/home/invitation-panels.tsx) | 친구 요청·여행 초대 UI |

DB 변경 파일은 [006 여행·친구](../backend/db/migrations/006-trip-rooms-friends.sql), [007 회원 물리 삭제](../backend/db/migrations/007-user-hard-delete.sql)이다. 현재 연결 DB에는 적용되어 있다. 006은 이미 적용된 DB에 재실행하지 않는다.

## 7. 현재 구현의 경계

기존 프론트 화면·탭 구조를 유지하고 API를 연결했다. HTTP 모드에서 여행 기본 정보·친구·멤버·초대는 서버 데이터를 사용한다.

**일정·장소·파티·정산·준비물·공지·대화 내용은 아직 기기별 저장이며 멤버 간 공유되지 않는다.** API 주소와 계정별로 저장을 분리하며, 로컬 부가 데이터가 서버 여행장·멤버 권한을 덮어쓰지 않는다. 기존 로컬 여행을 서버에 자동 업로드하지 않는다.

현재 여행방·친구 기능에는 푸시 발송과 실시간 동기화가 연결되어 있지 않다. 화면 진입·새로고침으로 최신 상태를 조회한다. 멤버 추방, 여행에서 자진 나가기, 여행장 위임, 여행방 영구 삭제 API도 아직 없다.

## 8. 검증 기록

- 2026-09-25 백엔드 테스트 34개 통과(여행·친구 테스트 12개 포함).
- 기존 검증에서 MySQL 동시 친구 요청·중복 생성·초대 권한·코드 만료/교체·정원 마지막 자리 동시 가입을 확인했다.
- 회원 물리 삭제 변경 후 실제 MySQL에서 탈퇴 제한·개인 관계 삭제·토큰 거절·공유 여행 조회 유지도 확인했다.
- 기존 화면 복원 후 프론트 타입 검사·테스트 47개·웹 export 통과 기록이 있다. 복원 후 브라우저 및 실제 모바일 기기 검증은 별도로 수행하지 않았다.
- 이번 문서 작성에서는 코드를 대조했으며 테스트를 새로 실행하지 않았다.

상세 설계는 [여행방·친구 명세서](TRIP-ROOM-FRIEND-JOIN-SPEC.md), 구현 및 검증 이력은 [구현 결과](TRIP-ROOM-IMPLEMENTATION.md)를 참고한다.
