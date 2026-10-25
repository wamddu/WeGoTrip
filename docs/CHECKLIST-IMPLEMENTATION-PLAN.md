# 준비물 기능 구현 계획

작성 기준: 2026-10-02 실제 MySQL 스키마와 현재 프론트엔드·백엔드 코드.

**현재 상태: 이 계획을 기준으로 API와 프론트엔드를 구현했다. 실제 DB 스키마와 데이터는 변경하지 않았으며, 최종 변경과 검증은 [구현 문서](CHECKLIST-IMPLEMENTATION.md)에 정리했다.**

## 1. 권장 방향

기존 `packing_item` 테이블로 현재 준비물 기능을 서버에 연결한다. **1차 구현에는 DB 변경이 필요 없다.** 기존 목록과 편집 화면을 재사용하고 담당자 선택과 저장 상태 안내를 개선한다.

1차 범위:

- 여행별 준비물 추가·조회·이름/담당자 수정·삭제
- 공용 준비물과 특정 멤버가 맡은 준비물
- 준비 완료 체크 및 완료 취소
- 전체·내 준비물·공용·미완료 필터
- 준비물 화면·여행 개요·홈의 완료율과 미완료 개수 공유
- 재시도 시 중복 생성 방지, 동시 변경 충돌 안내, 기존 기기 데이터 보존

`내 준비물`은 **본인이 담당하는 공유 항목**이다. 공용과 담당자별 항목 모두 여행 멤버가 볼 수 있으며 개인 비공개 목록을 뜻하지 않는다. 담당자는 등록자와도 구분한다.

## 2. 실제 DB 확인 결과

`packing_item`의 실제 컬럼은 다음과 같다. 조사 시점의 저장 행 수는 0개였다. 이는 기기에 저장된 준비물이 없다는 뜻은 아니다.

| 컬럼 | 타입·조건 | 사용 방법 |
| --- | --- | --- |
| `id` | BIGINT, PK, AUTO_INCREMENT | 서버에서 발급하는 준비물 ID |
| `trip_id` | BIGINT, NOT NULL | 소속 여행 |
| `owner_trip_member_id` | BIGINT, NULL 허용 | 담당 멤버. NULL이면 공용 |
| `title` | VARCHAR(150), NOT NULL | 준비물 이름 |
| `done` | TINYINT(1), NOT NULL, 기본값 0 | 준비 완료 여부 |

외래키와 인덱스:

- `trip_id → trip.id`, `ON DELETE CASCADE`. 여행 삭제 시 준비물도 삭제된다.
- `owner_trip_member_id → trip_member.id`, `ON DELETE SET NULL`.
- 여행·담당자 FK 인덱스가 이미 있다.
- `trip_member`는 `(trip_id, user_id)`가 유일하다. 담당자 변환에 사용할 수 있다.

완료 여부·제목·담당자 저장에 추가 컬럼은 필요 없다. 다만 수량·메모·분류·소그룹 연결·변경 이력 전용 필드는 없으므로 이번 범위에 포함하지 않는다. 후속 기능으로 필요해지면 DB 변경안을 따로 제시하고 사용자 승인 후 결정한다.

## 3. 현재 구현과 연결 지점

| 파일 | 현재 상태 | 계획 |
| --- | --- | --- |
| [collaboration-sections.tsx](../frontend/src/features/trip/collaboration-sections.tsx) | 준비물 목록·필터·완료율·체크 구현 | 서버 목록 연결, 완료 전용 명령, 진입 시 갱신 |
| [edit-screen.tsx](../frontend/src/features/trip/edit-screen.tsx) | 이름·담당자 입력, 추가·수정·삭제 | 담당자 콤보박스, 편집에서 완료 상태 분리, 초안 보존 |
| [models.ts](../frontend/src/domain/models.ts) | `CheckItem { id, title, ownerId, done }` | 서버 항목 상태 토큰 추가. Mock과 호환 |
| [commands.ts](../frontend/src/domain/commands.ts) | 준비물 로컬 검증·저장 | 이름 한도를 150자로 통일, 완료 전용 명령 추가 |
| [trip-api.ts](../frontend/src/data/trip-api.ts) | 여행·파티·일정·장소·지출 API | 준비물 조회·등록·수정·완료·삭제 계약 추가 |
| [user-travel-repository.ts](../frontend/src/data/user-travel-repository.ts) | 준비물은 HTTP 모드에서도 기기 저장 | 서버 조회·저장, 기기 배열 덮어쓰기 제거, 원본 백업 |
| [travel-provider.tsx](../frontend/src/state/travel-provider.tsx) | 저장 직렬화·공유 상태·충돌 시 최신 목록 적용 | 기존 처리 재사용 |
| [planning-sections.tsx](../frontend/src/features/trip/planning-sections.tsx), [home-screen.tsx](../frontend/src/features/home/home-screen.tsx) | `trip.checklist`로 진행률·미완료 개수 계산 | 같은 서버 배열로 집계. 0개와 모두 완료 상태 구분 |
| [trip-screen.tsx](../frontend/src/features/trip/trip-screen.tsx) | 준비물을 기기 저장 항목으로 안내 | 준비물은 공유 항목으로 안내 |

새 백엔드 파일은 `PackingController`, `PackingService`, `PackingApiTests`로 구성한다. 기존 [PlanningSupport](../backend/src/main/java/com/travel/travelbackend/tripapi/PlanningSupport.java)·[TripStore](../backend/src/main/java/com/travel/travelbackend/tripapi/TripStore.java)·[TripService](../backend/src/main/java/com/travel/travelbackend/tripapi/TripService.java)의 인증·여행 접근·보관 검사·멱등 처리 구조를 재사용한다. 새 컨트롤러를 [UserApiErrors](../backend/src/main/java/com/travel/travelbackend/userapi/UserApiErrors.java)의 적용 대상에 추가한다.

## 4. API 계약

Bearer JWT와 기존 성공/실패 JSON 형식을 사용한다. ID는 문자열로 전달하고 BIGINT를 JavaScript Number로 변환하지 않는다. 응답은 `Cache-Control: no-store`를 적용한다.

| 메서드 | 경로 | 기능 |
| --- | --- | --- |
| GET | `/api/v1/trips/{tripId}/packing-items` | 목록 조회 |
| GET | `/api/v1/trips/{tripId}/packing-items/{itemId}` | 단건 조회 |
| POST | `/api/v1/trips/{tripId}/packing-items` | 등록. 201 응답 |
| PUT | `/api/v1/trips/{tripId}/packing-items/{itemId}` | 이름·담당자 수정 |
| PUT | `/api/v1/trips/{tripId}/packing-items/{itemId}/completion` | 완료 또는 완료 취소 |
| DELETE | `/api/v1/trips/{tripId}/packing-items/{itemId}` | 삭제 |

등록 요청은 `{ title, ownerId }`, 초기 완료 상태는 `false`다. `ownerId`는 사용자 ID 또는 NULL이다. 서버는 같은 여행의 현재 멤버인지 확인한 뒤 `trip_member.id`로 변환하여 저장한다. 외래키만으로는 다른 여행의 담당자 지정을 막을 수 없어 서버 검증이 필수다.

이름·담당자 수정은 `{ title, ownerId, expectedStateToken }`만 받는다. 완료 요청은 `{ done: true/false, expectedStateToken }`만 받는다. 삭제의 `expectedStateToken`은 query parameter로 전달한다. 성공한 삭제는 `{ deletedId }`를 반환한다.

공통 검증과 권한:

- 이름은 앞뒤 공백을 제거하고 1~150자로 검증한다. 화면·Mock·API 한도를 맞춘다.
- 완료 값은 실제 boolean만 허용한다. 문자열·숫자를 자동 변환하지 않는다.
- 여행 멤버 모두 추가·수정·체크·삭제할 수 있다. 기존 화면의 협업 방식과 맞춘다.
- 비멤버의 여행 접근은 `404 TRIP_NOT_FOUND`, 다른 여행의 항목 접근은 `404 PACKING_ITEM_NOT_FOUND`로 처리한다.
- 보관된 여행은 읽기만 가능하고 신규 변경은 `409 TRIP_ARCHIVED`로 막는다.
- 담당자 지정은 해당 여행의 현재 활성 멤버만 허용한다.
- 성공한 회원 탈퇴로 멤버 행이 삭제되면 FK에 따라 해당 준비물이 공용으로 바뀌며 완료 상태는 유지된다. 기존 지출·정산 참조에 따른 탈퇴 제한은 유지한다.

등록자 정보가 없는 DB에 등록자 전용 수정·삭제 정책을 임의로 도입하지 않는다.

## 5. 동시 변경과 재시도

### 완료 체크와 항목 편집 분리

현재 체크는 `{ ...item, done: !item.done }` 전체를 저장하고, 편집 폼도 처음 열었을 때의 완료 상태를 저장한다. 그대로 서버에 연결하면 다음 문제가 생긴다.

| 상황 | 분리 후 동작 |
| --- | --- |
| A가 이름을 수정하고 B가 완료 체크 | B의 요청은 `done`만 변경하므로 이름을 되돌리지 않는다. 오래된 상태면 충돌을 안내한다. |
| A가 완료 체크하고 B가 이름을 수정 | B의 요청은 이름·담당자만 변경하므로 완료 상태를 되돌리지 않는다. 오래된 상태면 충돌을 안내한다. |
| 같은 완료 요청의 응답이 유실되어 재시도 | 목표 상태 `true/false`를 다시 사용하므로 반대로 토글되지 않는다. |

### DB 컬럼 추가 없는 충돌 검사

테이블에 `version`이 없으므로 서버 응답에 항목별 `stateToken`을 포함한다. 토큰은 항목 ID·여행 ID·이름·DB 담당 멤버 ID·완료 값을 일정한 순서로 정규화해 계산한 SHA-256 해시다. DB에 저장하는 컬럼은 아니다.

수정·완료·삭제 시 클라이언트가 읽었던 `expectedStateToken`을 보낸다. 서버는 기존 사용자 → 여행 → 준비물 잠금 순서를 지키고, 변경 직전에 현재 값으로 계산한 토큰과 비교한다. 다르면 `409 PACKING_ITEM_CONFLICT`로 거절한다.

충돌 시 최신 목록을 불러오고 입력 중인 이름·담당자 초안은 유지한다. 새 토큰으로 자동 저장하지 않는다. 사용자가 최신 상태를 확인하고 다시 저장하도록 한다.

이 방식은 현재 값이 달라진 경우를 감지한다. 값이 바뀌었다가 완전히 원복된 이력까지 감지하는 증가형 버전은 아니다. 변경 이력 자체를 보존하는 기능은 이번 범위에 포함하지 않는다.

### 중복 요청 처리

- 모든 변경 요청에 UUID `Idempotency-Key`를 사용하고 기존 `api_idempotency` 테이블의 24시간 저장을 재사용한다.
- 인증·현재 여행 접근 확인 → 같은 요청의 저장 응답 조회 → 신규 요청의 보관/충돌 검사 → 변경 → 응답 기록 순서로 처리한다. 삭제 또는 보관 이후의 동일 요청 재시도도 이미 성공한 응답을 확인할 수 있다.
- digest에는 여행 ID·항목 ID·작업 종류·예상 토큰·정규화 입력을 포함한다.
- 같은 키에 다른 입력을 보내면 `409 IDEMPOTENCY_KEY_REUSED`로 처리한다.
- 응답 유실 후 재시도할 때 같은 키·입력·예상 토큰을 유지한다. 확인되지 않은 생성 요청은 24시간 이후 자동 재전송하지 않는다.
- 저장 응답의 오래된 항목을 목록에 그대로 덮어넣지 않고, 성공 또는 재시도 확인 후 최신 목록을 조회한다.

## 6. 목록 조회와 프론트엔드 전환

목록은 ID 오름차순 커서, limit 1~100으로 조회한다. 프론트엔드는 모든 페이지를 받은 뒤 미완료 우선·ID 오름차순으로 표시한다. 필터와 진행률은 동일한 서버 배열에서 계산한다.

여러 페이지를 읽는 사이에 목록이 변경되는 경우를 위해 항목별 `stateToken`과 별도로 목록 전체 값의 해시인 `checklistStateToken`을 응답과 커서에 포함한다. 다음 페이지에서 해시가 달라지면 `409 PACKING_LIST_CHANGED`로 처리한다. 프론트엔드는 최대 3번 처음부터 다시 읽고, 계속 변경되거나 조회가 실패하면 기존 목록을 유지하고 갱신 안내를 표시한다. 일부 페이지로 기존 목록을 대체하지 않는다.

이 목록 토큰도 DB 컬럼 추가 없이 계산한다. 폴링이나 WebSocket 실시간 전달을 의미하지 않는다.

기존 기기 데이터 전환:

1. API 주소·계정별 기존 저장 원본에 준비물이 있으면 별도 `:checklist-backup-v1` 키에 원본을 보존한다.
2. HTTP 모드의 여행 조회에 준비물 API를 연결하고 `trip.checklist`를 서버 결과로 채운다.
3. `localCollections`에서 `checklist`를 제거하여 기기 목록이 서버 목록을 덮어쓰지 않게 한다.
4. 준비물 저장·삭제·완료 명령을 서버로 라우팅한다. 기존 로컬 항목을 자동 업로드하지 않는다.
5. 서버 목록이 비어 있더라도 보존된 기기 항목을 서버 항목처럼 섞어 표시하지 않는다. 백업 보존 안내를 제공한다.
6. Mock 모드의 기존 로컬 준비물 기능은 유지한다.

갱신은 준비물 탭 진입·앱 복귀·당겨 새로고침·저장/완료/삭제 성공 시 수행한다. 홈과 개요의 집계도 같은 갱신 결과를 사용한다. 1차 구현의 기기 간 반영은 갱신 시점 기준이다.

## 7. UI 계획

- 상단에 `완료 N / 전체 M`과 진행률을 유지한다.
- 전체·내 준비물·공용·미완료 필터로 원하는 항목을 찾는다.
- 미완료를 우선 표시하고 완료 항목은 체크 표시·취소선으로 구분한다.
- 담당자는 `공용 준비물` 또는 여행 멤버를 선택하는 기존 `SelectField` 콤보박스로 바꾼다.
- 추가/수정 화면은 준비물 이름과 담당자에 집중한다. 완료 체크는 목록에서 별도로 처리한다.
- 저장 중 해당 입력과 체크를 비활성화하고, 실패 시 변경 전 표시와 입력 초안을 유지한다.
- 보관 여행에서는 추가·수정·체크·삭제를 비활성화한다.
- 홈에서 준비물 0개는 “준비물을 추가해 보세요”, 모두 완료는 “준비물 확인을 모두 마쳤어요”로 구분한다.
- 여행/편집 화면의 안내에서 준비물을 서버 공유 항목으로 옮긴다. 공지·대화의 현재 기기 저장 안내는 유지한다.

## 8. 구현 순서와 검증

구현 순서:

1. API DTO·공용/담당자·권한·상태 토큰 계약 확정
2. `PackingController`·`PackingService`와 격리된 테스트 DB의 스키마/테스트 구현
3. `trip-api.ts`·저장소의 조회/쓰기/백업 연결
4. 완료 전용 명령 및 편집 폼 연결, 충돌 시 초안 보존
5. 담당자 콤보박스·필터·공유 안내·홈/개요 갱신
6. API·프론트엔드 회귀 검사와 웹·Android 화면 확인

필수 검증:

- 다른 여행·비멤버 접근, 담당자 위조·탈퇴한 멤버 지정, 보관 여행 변경 차단
- 이름 1~150자·공백·boolean 검증과 공용 NULL 저장
- 두 계정의 목록 공유, 내 준비물/공용/미완료 필터와 진행률 일치
- 이름 편집과 완료 요청이 서로의 필드를 덮어쓰지 않음
- 오래된 수정·완료·삭제 요청의 충돌, 충돌 후 편집 초안 보존
- 중복 생성·응답 유실·삭제 후 재시도·멱등 키 재사용·24시간 이후 재시도 처리
- 페이지 사이 추가·수정·삭제 감지와 제한된 전체 재조회
- 성공한 멤버 탈퇴 후 공용 전환 및 완료 상태 유지
- 기존 기기 원본 백업, 서버 배열 대체, 남아 있는 기기 저장 기능과 Mock 회귀
- 홈의 0개/미완료/전부 완료 상태와 화면 갱신, 좁은 화면·Android 입력 동작

현재 일부 HTTP 저장소 테스트는 준비물을 기기 전용 항목으로 가정한다. 서버 공유 계약으로 수정하고, 다른 기능의 기기 저장 회귀 테스트는 공지 등 남아 있는 로컬 항목으로 이동한다.

이 계획의 완료 기준은 **두 여행 멤버가 같은 준비물을 조회하고 변경 결과를 갱신해 확인하며, 공용·담당자·완료율이 일치하는 것**이다. DB 변경 승인 요청은 현재 필요하지 않다.
