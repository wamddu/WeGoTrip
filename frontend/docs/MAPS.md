# 일정 동선 지도

일정 탭의 **지도 동선**을 선택하면 현재 날짜·파티의 일정과 동일한 순서로 방문 번호를 표시한다. 지도 이동, 확대·축소, 전체 범위 복원, 번호/목록 선택과 일정 수정 연결을 지원한다. 배경 지도는 인터넷 연결이 필요하며, 로딩 실패 시 재시도 안내를 표시한다.

## 위치 데이터

- `Place.coordinates?: { latitude, longitude } | null`: 저장소와 HTTP 계약에 공통 사용한다. 주소만 있는 기존 장소는 위치 등록 안내를 표시한다.
- 장소 수정 화면에서 지도를 누르거나 좌표를 입력한다. 위치를 지우면 `null`로 저장하며 주소 변경 시에도 다시 지정해야 한다.
- 부산 샘플 좌표는 `src/data/fixtures/workspace.ts`에서 관리하는 예시 위치다. `migrations.ts`는 원래 이름/주소를 유지하는 샘플 장소에만 좌표를 보완한다. 사용자 입력을 임의로 지오코딩하지 않는다.

## 경로의 의미

점선은 시간순 방문 연결선이다. 도로 길찾기, 교통수단별 소요 시간, 거리나 도착 예측은 계산하지 않는다. 위치 누락이나 시간 중복이 있는 구간을 건너뛰어 이어 붙이지 않는다. 전체 파티 보기에서는 각 파티의 일정과 공통 일정을 따로 연결하며, 다른 파티의 일정 사이에 이동선을 만들지 않는다. 같은 위치를 재방문하면 지도 번호는 하나의 마커에 묶고 일정 목록은 각각 유지한다.

## 코드와 확장

| 파일                                 | 역할                                                     |
| ------------------------------------ | -------------------------------------------------------- |
| `src/domain/route.ts`                | 좌표 검증, 날짜/파티 필터, 방문 순서와 연결 구간         |
| `src/domain/map-projection.ts`       | Web Mercator 투영, 전체 범위 맞춤, 현재 화면의 타일 좌표 |
| `src/data/map-provider.ts`           | 타일 URL, 제공자 저작권, 네이티브 요청 식별              |
| `src/ui/geographic-map.tsx`          | Expo Image 타일, SVG 점선, 지도 이동/확대, 위치 선택     |
| `src/features/trip/schedule-map.tsx` | 일정별 번호, 파티 색상, 위치 누락 안내                   |

`TravelRepository`와 지도 배경 제공자는 별개다. 장소 검색 결과를 `Place.coordinates`에 저장하면 화면이 반영된다. 도로 경로 API를 연결할 때에는 방문 순서 계산과 실제 경로/시간 응답을 구분해 확장한다.

## 제공자와 캐시

기본 URL은 `https://tile.openstreetmap.org/{z}/{x}/{y}.png`이며 화면에 `© OpenStreetMap contributors`와 라이선스 링크를 표시한다. 네이티브는 `WeGoTrip/1.0 (com.jeongheaum.frontend)` User-Agent, 웹은 브라우저의 User-Agent/Referer를 사용한다. Expo Image의 memory-disk 캐시와 웹 HTTP 캐시를 사용하고 화면에 필요한 타일만 요청한다. 오프라인 다운로드나 배경 타일 수집 기능은 없다.

공개 타일은 서비스 보장이 없으므로 배포 규모에 맞는 제공자를 선택해야 한다. `.env.example`의 `EXPO_PUBLIC_MAP_TILE_URL`, `EXPO_PUBLIC_MAP_ATTRIBUTION`, `EXPO_PUBLIC_MAP_ATTRIBUTION_URL`을 변경한 뒤 앱을 다시 빌드한다. 공개 변수에는 비밀 키를 넣지 않는다. [OSM 타일 사용 정책](https://operations.osmfoundation.org/policies/tiles/)과 [투영/타일 좌표 공식](https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames), [Expo SDK 57 SVG 지원](https://docs.expo.dev/versions/v57.0.0/sdk/svg/)을 기준으로 구현했다.
