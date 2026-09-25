# 여행방·친구 기능 구현 결과

작성일: 2026-09-24

수정일: 2026-09-25 — 기존 프론트 화면 구조 복원

홈 바로가기와 여행의 개요·일정·장소·정산·준비물·공지·대화 탭, 기존 생성·편집·관리 화면을 다시 사용한다. 서버 전용 대체 화면 3개를 제거했다. 친구 요청과 초대 수락은 기존 친구·알림·멤버 관리 화면의 추가 섹션으로 제공하며, 기존 `execute(command)` 호출을 저장소에서 API로 연결한다.

## 구현 범위

- 회원 이메일 정확 검색, 친구 요청·수락·거절·취소, 친구 목록·삭제
- 여행 생성·목록·상세·멤버 조회, 여행장 정보 수정·보관·재개
- 친구 직접 초대, 받은/보낸 초대 상태별 조회, 수락·거절·취소
- 7일 유효한 초대 코드 발급·교체·폐기, 코드 미리보기와 참여
- JWT 및 회원 상태/tokenVersion 검사, 여행장·멤버·초대 수신자 권한 검사
- 여행 생성 Idempotency-Key, 낙관적 수정 버전, 정원 30명 동시 가입 방어
- 회원 탈퇴 시 관계 정리 및 다른 멤버가 있는 활성 여행장 탈퇴 제한

API의 요청·응답과 정책은 [명세서](TRIP-ROOM-FRIEND-JOIN-SPEC.md)를 참고한다.

## 프론트 이용 순서

1. 로그인 → **내 정보 → 친구 관리** → 친구의 가입 이메일 검색 → 친구 요청.
2. 상대 계정으로 로그인 → 친구 관리의 **받은 요청** → 수락.
3. **새로 만들기** → 여행 정보와 예산 입력 → 초대할 친구 선택 → 생성.
4. 상대 계정의 **알림 / 받은 여행 초대** → 수락하고 참여.
5. 여행 상세의 **멤버와 여행 설정**에서 멤버 확인. 여행장은 기존 편집 화면에서 기본 정보 수정·보관·재개가 가능하다. 친구 초대·코드 발급도 기존 관리 화면에 있다.
6. 코드를 통한 참여는 **새로 만들기 → 초대 코드로 참여 → 여행 참여하기 → 미리보기 확인** 순서다.

HTTP 모드의 여행·친구·멤버 데이터는 서버 DB가 기준이다. 기존 로컬 여행은 자동 업로드하지 않으며 저장소의 기존 데이터는 그대로 둔다. 일정·장소·파티·정산·준비물·공지·대화는 기존 화면에서 기기별로 저장할 수 있다. 이 내용은 다른 멤버에게 공유되지 않으며 화면과 편집 폼에 이를 안내한다. 저장 키는 API 주소·계정별로 분리하고 서버 역할·멤버십을 로컬 내용으로 덮어쓰지 않는다. 로컬 데모 모드는 기존 기능을 유지한다.

## DB 반영

[006-trip-rooms-friends.sql](../backend/db/migrations/006-trip-rooms-friends.sql)을 현재 MySQL에 반영했다. 기존 여행·멤버·친구·친구 요청 테이블이 비어 있음을 먼저 확인했다.

- 기존 `trip.name`을 API `title`로 매핑한다.
- 기존 `friend_request.receiver_id`를 API `recipient`로 매핑한다.
- 기존 `friendship.user1_id/user2_id`에는 작은 ID/큰 ID를 정렬해 저장한다.
- `trip.owner_id`로 역할을 판단한다. 기존 `trip_member.role`은 호환성을 위해 남기지만 권한 판단에 사용하지 않는다.
- 기존 `trip.invite_code`는 nullable로 보존하며 새 코드 원문을 기록하지 않는다. `trip_invite_code.digest`에 SHA-256을 저장한다.
- PENDING 친구 요청 중복 방지에는 정규화 ID 컬럼과 생성 컬럼 UNIQUE를 사용한다. 기존 CASCADE 외래키를 유지하기 위해 생성 컬럼은 정규화 ID를 참조한다.
- 새 `api_rate_limit` 테이블에서 서버 인스턴스가 공유하는 고정 시간창 요청 제한을 처리한다. IP는 직접 연결 주소 기준이며 전달 헤더를 신뢰하지 않는다. 프록시 배포 시 신뢰할 프록시 설정을 별도로 검토한다.

**현재 DB에는 이미 적용했으므로 006을 다시 실행하지 않는다.** 다른 DB에 적용할 때도 사전 조건을 확인해야 한다. 기존 여행 데이터가 있는 DB에는 여행장 및 관계 데이터 이관이 먼저 필요하다. MySQL DDL은 암묵적으로 커밋되므로 중간 실패 시 실제 적용 상태를 조사한 뒤 남은 문장부터 진행한다.

## 검증 결과 (2026-09-24 최초 구현)

| 검증 | 결과 |
| --- | --- |
| `backend: .\gradlew.bat test` | 34개 통과, 신규 여행/친구 통합 테스트 12개 포함 |
| `frontend: npm run typecheck` | 통과 |
| `frontend: npm test` | 44개 통과 |
| `frontend: npm run build:web` | 웹 export 통과 |
| `frontend: npm run build:native` | Android/iOS JS 번들 export 통과 |
| 실제 MySQL API 검증 | 양방향 동시 친구 요청, 같은 키 동시 생성, 초대 수락 권한, 중복 수락, 코드 교체·만료·보관, 여행장 탈퇴 제한, 마지막 자리 동시 가입 통과 |
| 웹 UI 검증 | 두 계정 로그인 전환, 이메일 검색, 친구 요청·수락, 친구 포함 여행 생성, 받은 초대 수락, 멤버 2명 반영 및 일반 멤버 권한 확인 |

실제 MySQL 검증용 계정 3개와 생성한 여행·관계·토큰·설정 데이터는 검증 후 정리했다. 기존 사용자 데이터는 유지했다.

네이티브 검증은 번들 생성까지이며 실제 Android/iOS 기기 실행 검증은 포함하지 않는다. 푸시 발송과 실시간 갱신은 후속 범위다. 화면 진입과 새로고침으로 최신 데이터를 조회한다. 별도 리뷰 에이전트는 사용량 제한으로 실행되지 않아 독립 리뷰 결과는 없다.

## 주요 코드

2026-09-25 UI 복원 후 검증: 프론트 타입 검사, 테스트 47개, 웹 export 통과. 추가 테스트는 기존 명령의 API 연결, 생성 응답 유실 시 동일 키 재시도, 일정 부가 데이터의 새로고침 후 유지·계정별 격리·멤버십 보호를 확인한다. 이번 UI 복원 이후 브라우저·실기기 동작은 별도로 재검증하지 않았다.

- [TripController](../backend/src/main/java/com/travel/travelbackend/controller/TripController.java): 여행·친구 API 라우팅
- [TripService](../backend/src/main/java/com/travel/travelbackend/tripapi/TripService.java): 여행·초대·코드·회원 탈퇴 연동
- [FriendService](../backend/src/main/java/com/travel/travelbackend/tripapi/FriendService.java): 친구 관계와 요청 상태
- [TripStore](../backend/src/main/java/com/travel/travelbackend/tripapi/TripStore.java): 파라미터 SQL·회원 잠금·페이지 처리
- [TripApiTests](../backend/src/test/java/com/travel/travelbackend/TripApiTests.java): 서버 통합·동시성 테스트
- [trip-api.ts](../frontend/src/data/trip-api.ts): 인증 재발급을 공유하는 API 어댑터
- [user-travel-repository.ts](../frontend/src/data/user-travel-repository.ts): 서버 여행·친구·멤버 데이터 조회
- [account-screens.tsx](../frontend/src/features/home/account-screens.tsx): 기존 친구 관리·알림 화면
- [invitation-panels.tsx](../frontend/src/features/home/invitation-panels.tsx): 기존 화면에 삽입하는 요청·초대 섹션
- [create-trip-screen.tsx](../frontend/src/features/home/create-trip-screen.tsx): 기존 여행 생성·코드 참여 화면
- [manage-screen.tsx](../frontend/src/features/trip/manage-screen.tsx): 기존 멤버·여행·파티 관리 화면

## 회원 물리 삭제 반영 (2026-09-25)

회원 탈퇴는 user 행 및 설정·기기·동의·refresh credential·친구/요청·본인 관련 여행 초대·idempotency 기록을 같은 트랜잭션에서 삭제한다. 기존 ACTIVE 여행장 탈퇴 제한은 유지한다. 여행장 탈퇴 후 보관된 여행은 owner_id=NULL로 남겨 다른 멤버가 조회할 수 있으며, API owner는 id가 빈 문자열이고 이름은 `탈퇴한 사용자`이다.

`007-user-hard-delete.sql`을 현재 MySQL DB에 적용했다. 백엔드 34개 테스트가 통과했다. 별도 테스트 계정 2개로 실제 MySQL API에서 탈퇴 제한, 보관 후 탈퇴, 기존 access/refresh 거절, 남은 멤버의 여행/멤버 조회를 확인했다. SQL 조회로 9개 관련 테이블에 테스트 회원 데이터가 남지 않았고 공유 여행은 보존됨을 확인한 뒤 테스트 여행을 정리했다. 기존 WITHDRAWN 회원은 일괄 삭제하지 않았다.
