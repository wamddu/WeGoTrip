# Google 장소 검색과 일정 지도

장소 추가/수정에서 호텔·카페 이름을 검색하고 결과를 선택하면 이름, 주소, 분류와 위치가 자동 입력된다. Google 지도에서 확인한 뒤 저장 버튼으로 여행 장소에 추가한다. 주소를 바꾸거나 위치를 지우면 선택한 위치와 Google 장소 ID를 해제한다. 검색 실패, 결과 없음, 시간 초과는 폼 안에서 표시하며 직접 입력한 장소도 저장할 수 있다.

## 실행

1. Google Cloud에서 **Places API (New)**와 **Maps Static API**를 활성화한다. 서버용 API 키에 두 API 제한을 적용한다. 웹사이트 리퍼러 제한 키는 서버 호출에 적합하지 않으며, 운영 서버에서는 고정 IP 제한을 적용한다.
2. `backend/.env`에 `GOOGLE_MAPS_API_KEY=발급받은키`를 설정한다. 이 파일은 Git에서 제외된다. 프론트엔드의 `EXPO_PUBLIC_*`에는 키를 넣지 않는다.
3. `backend`에서 `./gradlew.bat mapsRun`을 실행한다. 기본 포트는 8080이며 MySQL 없이 지도 API만 실행한다. 기존 전체 백엔드의 `bootRun`에도 같은 엔드포인트가 포함된다. 두 서버는 같은 포트에서 동시에 실행하지 않는다.
4. `frontend/.env.local`에 `EXPO_PUBLIC_MAPS_API_URL=http://localhost:8080/api`를 설정한다. 생략하면 `EXPO_PUBLIC_API_URL`, 그 값도 없으면 위 주소를 사용한다. 실제 휴대전화에서는 localhost 대신 개발 PC의 LAN 주소를 사용하고 Metro를 재시작한다.
5. `frontend`에서 `npm run web` 또는 `npm start`를 실행한다. 여행 데이터가 mock 모드여도 장소 검색은 실제 Google API를 사용한다.

웹 CORS 기본 허용 주소는 `http://localhost:8081,http://localhost:8082`다. 다른 포트/도메인은 `backend/.env`의 `maps.allowed-origins`에 쉼표로 구분해 등록하고 서버를 재시작한다.

## API와 화면

- `GET /api/maps/places/search?query=...`: 최대 150자 검색어로 Text Search (New)를 호출하고 최대 8개의 이름·주소·좌표·분류·장소 ID를 반환한다. 검색 버튼/Enter에서만 호출한다.
- `GET /api/maps/image?latitude=...&longitude=...&zoom=...&width=...`: 서버에서 Maps Static API의 2배 해상도 PNG를 받아 전달한다. 키가 포함된 Google URL은 클라이언트에 반환하지 않는다.
- 지도는 웹과 네이티브 모두 Google 이미지 위에 방문 번호와 SVG 점선을 표시한다. 확대/축소 및 드래그를 마칠 때 새 이미지를 요청한다. 전체 일정 화면은 공통 일정만, 각 팀 화면은 해당 팀과 공통 일정을 표시한다. 보이지 않는 팀 페이지는 지도 이미지를 요청하지 않는다.
- `Place.googlePlaceId`는 검색 결과의 식별자이고 `Place.coordinates`는 기존 지도/저장 계약과 호환된다. 부산 샘플 위치 보완은 기존 마이그레이션을 유지한다.
- 점선은 방문 순서이며 실제 도로 경로, 거리, 이동 시간은 계산하지 않는다.

Google 이미지와 검색 응답은 `Cache-Control: no-store`, 앱 이미지는 `cachePolicy="none"`으로 처리한다. 지도 자체의 Google 로고/저작권과 검색 결과의 Google Maps 출처를 표시한다. 장기 서비스 운영 시에는 Google 장소 ID 중심 저장 및 Places 콘텐츠의 허용 보관 기간에 맞는 갱신/삭제 정책을 별도로 적용해야 한다.

현재 프록시는 로컬 개발용으로 인증이 없으며 프로세스당 분당 검색 30회, 지도 120회로 제한한다. 공개 배포 전에는 앱 인증과 사용자별 한도를 연결해야 한다. 검색과 지도 로드는 별도 과금 항목이다.

## 검증

- `frontend`: `npm run typecheck`, `npm test`, `npm run build:web`
- `backend`: `./gradlew.bat test --tests '*MapsControllerTests'`
- 전체 백엔드의 기존 `contextLoads` 테스트 및 `bootRun`은 별도의 MySQL 설정/연결이 필요하다.

[Places Text Search](https://developers.google.com/maps/documentation/places/web-service/text-search), [Maps Static API](https://developers.google.com/maps/documentation/maps-static/start), [Google Places 정책](https://developers.google.com/maps/documentation/places/web-service/policies)
