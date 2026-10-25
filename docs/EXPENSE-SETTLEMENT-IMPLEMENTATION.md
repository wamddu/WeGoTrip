# 지출 기록 및 정산 기능 구현 정리

작성일: 2026-10-02. 지출·정산 API와 기존 프론트엔드를 연결했으며, 사용자 승인 범위의 DB 변경을 실제로 적용했다.

권한 변경일: 2026-10-09. 송금 완료 기록과 취소는 해당 송금을 받는 사람만 할 수 있도록 변경했다. 이 권한 변경에는 DB 수정이 없다.

이 문서는 구현된 동작과 검증 결과를 정리한 것이다. 사전 검토 과정은 [구현 계획](EXPENSE-SETTLEMENT-IMPLEMENTATION-PLAN.md)과 [DB 변경 검토안](EXPENSE-SETTLEMENT-DB-PROPOSAL.md)에 별도로 보존했다.

## 1. 구현 결과

| 기능 | 구현 내용 |
| --- | --- |
| 지출 기록 | 등록·조회·수정·삭제를 서버에서 공유 |
| 분담금 | 균등·직접 지정 결과 저장. 0원 분담자도 유지 |
| 결제자 | 사용자 ID를 여행 멤버 ID로 변환해 저장 |
| 소그룹·메모 | 같은 여행의 소그룹 연결, 메모 공유 |
| 정산 결과 | 여행 전체의 결제액·부담액·잔액과 송금 경로를 서버에서 계산 |
| 송금 완료·취소 | 송금을 받는 사람만 기록·취소하고, 모든 여행 멤버가 상태 조회 |
| 보관한 여행 | 지출 변경은 제한, 정산 조회·완료·취소는 허용 |

현재 화면 구성을 재사용했다. 정산 탭 진입 시 서버 데이터를 갱신하며, 서버 저장 화면에 기기 저장 안내가 나타나지 않게 했다. 준비물·공지·대화의 기존 기기 저장 방식은 유지한다.

## 2. 실제 DB 변경

마이그레이션: [009-expense-settlement.sql](../backend/db/migrations/009-expense-settlement.sql).

| 대상 | 적용한 변경 |
| --- | --- |
| `expense` | `party_id BIGINT NULL`, `note TEXT NULL`, 소그룹 인덱스·FK |
| `trip` | `settlement_revision BIGINT NOT NULL DEFAULT 0` |
| `settlement_confirmation` | 정산 버전별 송금 완료 상태, 행 버전, 기록자·시각 저장 |

소그룹 FK는 SET NULL, 완료 기록의 여행 FK는 CASCADE, 멤버 FK는 RESTRICT다. 완료 금액은 여러 지출의 합을 담기 위해 DECIMAL(18,2)를 사용한다. 기존 지출·분담 금액은 DECIMAL(15,2)를 유지한다.

적용 전 원본 DB 전체 백업과 스키마 내보내기를 수행했다. 실제 데이터 없이 스키마만 복제한 별도 MySQL 8.0.44 환경에서 009를 먼저 적용한 뒤 원본 DB에 적용했다. 적용 전 대상 컬럼·테이블이 없음을 확인했고, 적용 후 타입·NULL·기본값·외래키·행 수를 다시 확인했다.

DB 적용 당시 조회 기준으로 원본 DB의 지출·분담 테이블은 적용 전후 0행이었으며, 새 완료 테이블도 0행이었다. 테스트용 지출은 원본 DB에 넣지 않았다. 기존 여행의 정산 버전은 0으로 시작한다.

백업 위치: `C:/Users/user/AppData/Local/Temp/wegotrip-expense-009-20261002-6d1f8d19/before-009-backup.sql`. 개인정보가 포함될 수 있어 저장소에는 추가하지 않았다.

MySQL DDL은 전체 트랜잭션 롤백을 보장하지 않는다. 마이그레이션은 무조건 재실행하지 말고, 실제 정의를 확인해 완료된 단계를 건너뛴다. 새 공유 기록이 생긴 뒤 컬럼·테이블을 삭제하면 그 정보가 사라지므로 복구 전에 데이터를 보존한다.

## 3. API

기존 인증과 `{ code, data }` 응답 구조를 사용한다. 모든 응답에 `Cache-Control: no-store`를 적용한다.

| 메서드 | 경로 | 용도 |
| --- | --- | --- |
| GET | `/api/v1/trips/{tripId}/expenses` | 지출 목록·정산 버전·다음 cursor |
| GET | `/api/v1/trips/{tripId}/expenses/{expenseId}` | 지출 단건·정산 버전 |
| POST | `/api/v1/trips/{tripId}/expenses` | 지출과 분담금 등록 |
| PUT | `/api/v1/trips/{tripId}/expenses/{expenseId}` | 지출과 분담금 수정 |
| DELETE | `/api/v1/trips/{tripId}/expenses/{expenseId}?settlementRevision=...` | 기대 버전으로 지출 삭제 |
| GET | `/api/v1/trips/{tripId}/settlement` | 전체 정산 결과와 완료 상태 |
| PUT | `/api/v1/trips/{tripId}/settlement/confirmations` | 완료·취소 목표 상태 저장 |

등록·수정 응답은 `{ expense, settlementRevision }`, 삭제 응답은 `{ settlementRevision }`다. 정산 응답은 `{ settlementRevision, total, balances, transfers }`다. 완료 응답에는 정산 버전·당사자·금액·key·완료 상태·완료 행 버전이 포함된다.

- 지출 입력: `title`, `amount`, `date`, `payerId`, `shares`, `partyId`, `note`.
- 수정 입력에는 `settlementRevision` 추가. 삭제는 query로 전달.
- 완료 입력: `settlementRevision`, `fromUserId`, `toUserId`, `amount`, `completed`, `confirmationVersion`.
- ID와 버전은 문자열. 금액은 안전한 정수 범위의 숫자.
- 모든 쓰기는 UUID `Idempotency-Key` 필수. 새 등록에는 기대 정산 버전이 필요하지 않다.
- 지출 제목 150자, 메모 1,000자, 금액 1~10억 원 정수. 분담 합계는 지출 금액과 정확히 일치해야 한다.
- 지출 날짜는 여행 기간 밖도 허용한다. 결제자가 분담자에 포함될 필요는 없다.

### 지출 등록 예시

`POST /api/v1/trips/{tripId}/expenses`에 아래 입력을 전송한다. `payerId`와 `shares`의 키는 여행 멤버 ID가 아닌 **사용자 ID**다. 예시 ID는 실제 데이터와 무관하다.

```json
{
  "title": "저녁 식사",
  "amount": 30000,
  "date": "2026-10-02",
  "payerId": "101",
  "shares": {
    "101": 10000,
    "102": 10000,
    "103": 10000
  },
  "partyId": null,
  "note": "식사와 음료 포함"
}
```

균등 분담 결과는 프론트엔드에서 계산해 `shares`로 전달하고 서버에서 합계를 검증한다. 2원을 3명에게 나누면 1원·1원·0원이며, 0원인 멤버도 분담 기록에 남는다. 소그룹 연결은 `partyId`에 같은 여행의 소그룹 ID를 지정한다.

### 송금 완료 기록 예시

위 지출의 정산 버전이 `"1"`이고 완료 기록이 없다면, 사용자 102가 사용자 101에게 보내는 10,000원을 다음과 같이 기록한다. **받는 사람인 사용자 101로 인증한 뒤** 서버가 반환한 현재 송금 제안의 금액과 버전을 사용한다. 보내는 사람인 사용자 102는 완료 기록·취소 요청을 할 수 없다.

```json
{
  "settlementRevision": "1",
  "fromUserId": "102",
  "toUserId": "101",
  "amount": 10000,
  "completed": true,
  "confirmationVersion": "0"
}
```

첫 완료 저장이 성공하면 `confirmationVersion`은 `"1"`이 된다. 취소할 때는 최신 버전과 `completed: false`를 전달한다. 모든 쓰기 요청은 Bearer 인증과 유효한 UUID `Idempotency-Key` 헤더를 포함한다.

## 4. 정산 계산과 완료 기록

멤버별 잔액은 `결제액 - 부담액`이다. 여행 멤버의 고정 순서를 사용해 보낼 사람과 받을 사람을 연결한다. 전체 잔액은 0인지 확인하며, 금액을 반올림하거나 임의로 분담금을 보정하지 않는다. 모든 경우에 송금 횟수가 최소라고 보장하는 알고리즘은 아니다.

예를 들어 A가 30,000원을 결제하고 A·B·C가 각 10,000원을 부담하면 B→A 10,000원, C→A 10,000원으로 계산한다. 합산 금액도 JavaScript 안전한 정수 범위인 9,007,199,254,740,991원을 넘으면 409 `SETTLEMENT_AMOUNT_TOO_LARGE`로 거절한다.

완료 표시는 실제 송금 후 직접 남기는 **수동 확인 기록**이다. 은행 송금·부분 송금 원장·과거 실제 송금액 자동 차감은 포함하지 않는다.

성공한 지출 등록·수정·삭제마다 정산 버전을 증가시키고 새 버전의 완료 표시는 대기로 시작한다. 메모·소그룹만 수정하거나 같은 내용으로 저장한 경우도 현재 UI 규칙대로 초기화한다. 이전 버전의 마지막 완료 상태는 DB에 보존하되 현재 화면에 적용하지 않는다. 지출을 A→B→A로 수정해도 옛 완료 표시가 살아나지 않는다.

소그룹 자체의 이름·멤버 변경은 이미 저장한 분담금을 바꾸거나 완료 표시를 초기화하지 않는다. 소그룹 필터도 지출 목록에만 적용하고 정산은 여행 전체로 계산한다.

## 5. 재시도·동시 수정·권한

- 지출·분담금·정산 버전·중복 요청 결과를 같은 트랜잭션에 저장한다. 중간 쓰기 실패는 전부 롤백한다.
- 사용자 → 여행 → 하위 행 순서로 잠근다. 동일 여행의 쓰기를 직렬화한다.
- 같은 논리 요청을 재시도하면 같은 UUID와 입력을 사용해 중복 생성과 추가 버전 증가를 막는다.
- 성공했던 UUID 요청의 재시도는 현재 접근 권한을 확인한 뒤 원래 성공 응답을 반환한다. 지출을 다시 저장하거나 과거 완료 상태를 다시 적용하지 않는다.
- 새로운 지출 수정·삭제 요청의 정산 버전이 다르면 409 `SETTLEMENT_CHANGED`를 반환한다. 이미 성공한 동일 UUID의 응답 재전송은 이 검사로 다시 실패시키지 않는다.
- 같은 정산 버전에서 완료 행 버전이 다르면 409 `CONFIRMATION_CHANGED`를 반환한다.
- 완료 상태가 이미 같아도 기대 버전을 먼저 검사한다. 버전이 맞는 동일 상태 요청은 행 버전과 수정 시각을 그대로 유지한다.
- 프론트엔드는 충돌 시 최신 데이터를 반영하고 작성 내용은 유지한다. 자동으로 오래된 선택을 재적용하지 않는다.
- 완료·취소는 토글 대신 명시적 boolean을 전송한다. 오래된 성공 응답을 재전송하더라도 이후 취소를 되돌리지 않는다.
- 완료 표시를 바꾸는 사람은 해당 송금을 받는 사람(`toUserId`)이어야 한다. 보내는 사람이나 받는 사람이 아닌 여행장의 요청은 403 `SETTLEMENT_RECEIVER_REQUIRED`로 거절한다. 중복 요청 응답을 재전송하기 전에도 이 권한을 확인한다.
- 화면의 완료·취소 버튼도 받는 사람에게만 표시한다. 보내는 사람과 다른 멤버는 완료 상태를 조회할 수 있다. HTTP 저장소와 mock 도메인에도 같은 권한 검증을 적용한다.
- 기존 정책에서 보내는 사람이 남긴 완료 기록은 그대로 조회할 수 있다. 이후 상태 변경은 받는 사람만 할 수 있으며, 테이블·컬럼 변경이나 기존 데이터 수정은 필요하지 않다.
- 현재 여행 멤버는 공동으로 지출을 조회·등록·수정·삭제할 수 있다. 작성자만 편집하는 권한 모델은 추가하지 않았다.
- 같은 여행의 결제자·분담자·소그룹만 참조할 수 있다. 연결된 소그룹 삭제는 거절한다.
- 지출 결제자·분담자·과거 완료 기록에 참조된 멤버의 물리 삭제와 현재 방식의 회원 탈퇴를 막아 기록을 보존한다. 0원 분담자·보관 여행·잔액 0도 참조 검사 대상이다.

기존 중복 요청 보존 기간은 24시간이다. 그 이후의 보류 요청은 자동 재전송하지 않고 최신 기록 확인을 안내한다. 계정 변경·로그아웃 시 보류 요청을 제거한다.

## 6. 프론트엔드 데이터 전환

실제 HTTP 모드의 지출과 정산 결과는 서버에서 읽는다. 지출 전체 페이지와 정산 버전이 일치할 때만 화면에 반영하고, 조회 중 변경되면 최대 3번 다시 읽는다. 조회 실패를 빈 지출 목록으로 표시하지 않는다.

기존 기기 지출·완료 체크는 원본과 별도 `expense-backup-v1` 저장 키로 보존한다. 서버 결과를 기기 배열로 덮어쓰지 않고 자동 업로드·병합도 하지 않는다. 이전 기록이 있는 여행에는 전환 안내를 표시한다. 기존 자료의 명시적 가져오기 기능은 이번 범위에 포함하지 않았다.

mock 모드는 기존처럼 사용할 수 있다. HTTP 모드는 서버 정산 결과를 직접 표시하고, mock에서는 기존 계산 함수를 사용한다.

## 7. 검증 결과

### 2026-10-09: 송금 수신자 권한 변경

| 검증 | 결과 |
| --- | --- |
| 지출·정산 API 테스트, 격리된 H2 | 23개 통과 |
| 프론트엔드 테스트 | 132개 통과 |
| 프론트엔드 타입 검사·변경 파일 포맷 검사 | 통과 |

받는 사람의 완료·취소, 보내는 사람과 다른 여행 멤버의 403 차단, 잘못된 송금 경로 거절, 기존 발신자 완료 기록 조회와 수신자 취소를 검증했다. 프론트엔드에서는 보내는 사람의 요청이 API 호출 전에 거절되는지, 보관한 여행에서도 같은 권한이 적용되는지 확인했다. 이번 검증은 원본 DB에 접속하거나 데이터를 변경하지 않았다.

### 2026-10-02: 최초 구현

| 검증 | 결과 |
| --- | --- |
| 백엔드 전체 테스트, H2 | 80개 통과 |
| 지출·정산 동일 API 테스트, 분리 MySQL 8.0.44 | 22개 통과 |
| 프론트엔드 테스트 | 112개 통과 |
| 프론트엔드 타입 검사 | 통과 |
| 웹 export | 통과 |
| 코드 변경 검사 | 통과 |
| 브라우저, mock 모드 | 지출 목록·입력 폼·정산 결과·당사자 완료 버튼 표시 확인 |

API 테스트는 CRUD, 합계·0원·기간 밖 날짜, 권한, 재시도, 버전 충돌, 동일 내용 저장과 A→B→A 초기화, 보관, 소그룹·탈퇴 보호, 페이지 일관성, 정확한 정수, 저장 중 실패 롤백과 동시 쓰기를 검증한다. MySQL 테스트는 원본 DB와 다른 로컬 포트·테스트 DB에서 실행했다. 테스트 접속은 로컬 호스트·명시적 포트·전용 테스트 DB 이름을 검사해 다른 DB를 실수로 초기화하지 않게 보호한다.

인공 CHECK 제약으로 중간 실패를 만드는 테스트에서는 H2의 409와 MySQL의 500 오류 분류 차이를 반영했다. 지출·분담·버전·중복 요청 결과·기존 완료 상태의 롤백 검증은 두 DB에서 동일하게 수행했다. 실제 사용자 입력 오류는 별도의 400 검증으로 확인했다.

브라우저 확인은 테스트용 mock 데이터로 수행했다. 실제 HTTP 계약과 저장 동작은 백엔드 통합 테스트 및 프론트엔드 저장소 테스트로 확인했다. 이 소절의 결과는 최초 구현 당시의 검증 기록이며, 이후 권한 변경의 결과는 위 소절에 별도로 기록했다.

## 8. 주요 변경 파일

| 영역 | 파일 | 역할 |
| --- | --- | --- |
| DB | [009-expense-settlement.sql](../backend/db/migrations/009-expense-settlement.sql) | 승인된 컬럼·테이블·인덱스·외래키 추가 |
| API | [ExpenseController.java](../backend/src/main/java/com/travel/travelbackend/controller/ExpenseController.java), [SettlementController.java](../backend/src/main/java/com/travel/travelbackend/controller/SettlementController.java) | 지출 CRUD·정산·완료 기록 경로 |
| 저장·권한 | [ExpenseService.java](../backend/src/main/java/com/travel/travelbackend/tripapi/ExpenseService.java), [SettlementService.java](../backend/src/main/java/com/travel/travelbackend/tripapi/SettlementService.java) | 검증·트랜잭션·버전·재시도 처리 |
| 계산 | [ExpenseSettlementCalculator.java](../backend/src/main/java/com/travel/travelbackend/tripapi/ExpenseSettlementCalculator.java) | 정확한 원 단위 잔액과 송금 경로 계산 |
| 참조 보호 | [PartyService.java](../backend/src/main/java/com/travel/travelbackend/tripapi/PartyService.java), [TripService.java](../backend/src/main/java/com/travel/travelbackend/tripapi/TripService.java) | 연결된 소그룹 삭제·참조 멤버 탈퇴 보호 |
| API 공통 처리 | [PlanningSupport.java](../backend/src/main/java/com/travel/travelbackend/tripapi/PlanningSupport.java), [UserApiErrors.java](../backend/src/main/java/com/travel/travelbackend/userapi/UserApiErrors.java) | 중복 요청 응답·오류 처리 |
| 프론트 통신 | [trip-api.ts](../frontend/src/data/trip-api.ts), [user-travel-repository.ts](../frontend/src/data/user-travel-repository.ts) | 서버 조회·저장·기기 원본 보존 |
| 도메인 | [models.ts](../frontend/src/domain/models.ts), [commands.ts](../frontend/src/domain/commands.ts) | 정산 결과·버전·목표 완료 상태·입력 검증 |
| 화면 | [edit-screen.tsx](../frontend/src/features/trip/edit-screen.tsx), [expense-section.tsx](../frontend/src/features/trip/expense-section.tsx), [trip-screen.tsx](../frontend/src/features/trip/trip-screen.tsx) | 지출 폼·정산 표시·공유 안내 |
| 충돌 반영 | [travel-provider.tsx](../frontend/src/state/travel-provider.tsx) | 충돌 후 최신 데이터 반영 |
| 테스트 | [ExpenseApiTests.java](../backend/src/test/java/com/travel/travelbackend/ExpenseApiTests.java), [test-app.cjs](../frontend/scripts/test-app.cjs) | 서버·프론트엔드 동작 검증 |
