# Toonify — 인스타툰 알림 서비스

인스타그램에 연재 중인 웹툰(인스타툰)의 새 에피소드를 자동으로 감지하고 푸시 알림으로 알려주는 iOS/Android 앱.

---

## 만든 이유

### 문제

인스타그램을 둘러보다 재미있는 인스타툰을 우연히 발견하는 경우가 있다.
하지만 다음 편을 보려면 **직접 해당 계정을 찾아가서 새 게시물이 올라왔는지 확인해야 한다.**

- 인스타그램 알림은 팔로우한 모든 계정의 게시물이 섞여서 올라오기 때문에 툰 업데이트만 골라서 받기 어렵다
- 여러 작가를 팔로우하면 새 편이 언제 올라왔는지 놓치기 쉽다
- 매번 계정에 들어가서 확인하는 것이 번거롭고 결국 잊어버리게 된다

### 해결

이 앱은 관심 있는 인스타툰 작가 계정을 등록해두면 **새 에피소드가 올라오면 푸시 알림으로 알려준다.**

| 문제 | 해결 |
| ---- | ---- |
| 새 편을 놓치지 않으려면 직접 계정을 방문해야 함 | GitHub Actions가 1시간마다 자동으로 체크해 알림 전송 |
| 인스타그램 일반 알림에 섞여 툰 업데이트를 구분하기 어려움 | 시리즈 이름 키워드 매칭으로 인스타툰 게시물만 필터링 |
| 화수가 캡션에 없고 이미지에만 적혀있는 경우 감지 불가 | OCR로 이미지에서 화수 직접 인식 |
| 몇 화까지 읽었는지 기억하기 어려움 | 읽음 처리 기능으로 진도 관리 |

---

## 프로젝트 개요

| 항목        | 내용                       |
| ----------- | -------------------------- |
| 플랫폼      | React Native (Expo SDK 54) |
| 지원 기기   | Android (iOS는 EAS 빌드 필요) |
| 테스트 환경 | Expo Go                    |
| 버전        | 1.0.0                      |

---

## 서비스 구조

```
📱 앱 (Expo Go)
  │  앱 실행 시 Expo push token → Supabase 저장
  │  툰 추가/삭제/읽음 처리 → Supabase 동기화
  ▼
🗄️ Supabase (온라인 DB)
  │  toons 테이블: 등록된 툰 목록
  │  push_tokens 테이블: 디바이스 푸시 토큰
  ▼
⚙️ GitHub Actions (1시간마다 자동 실행)
  │  Supabase에서 툰 목록 읽기
  │  인스타 API로 새 편 확인
  │  새 편 발견 시 Expo Push API로 알림 전송
  ▼
📳 폰에 푸시 알림 도착
```

---

## 기능 요약

- 인스타툰 계정 등록 / 수정 / 삭제 (스와이프 삭제, 롱프레스 수정)
- 캡션 키워드 매칭으로 새 에피소드 자동 감지 — 12개 게시물 전부 스캔, 누락 없이 수집
- 이미지 OCR을 통한 화수 인식 (캡션에 화수가 없을 때, Engine 3)
- OCR 한도 초과(429) 2회 감지 시 해당 새로고침 플로우 자동 중단
- 앱 내 2시간마다 자동 체크 + 당겨서 수동 새로고침
- 새 에피소드 복수 발견 시 `3화, 4화가 추가되었어요` 형식 알림
- 카드 탭 → 에피소드 목록 아코디언 펼치기 (등록화 + 신규화 모두 표시)
- 에피소드 탭에서 화수 선택 → 해당 인스타 게시물로 바로 이동
- 읽음 처리 시 `readEpisode` 자동 진행
- 직접 확인 뱃지 — 최신 12개 안에 시리즈 게시물 없을 때 표시
- 툰 추가: 링크 붙여넣기 → 계정명/시리즈명/화수 자동 채움 (링크 먼저 필수)
- OCR 체크 중 스와이프 삭제 차단
- 라이트 / 다크 모드 (시스템 기본값 + 수동 전환)

---

## 사용 API / 서비스

### 1. hasdata — 인스타그램 스크래핑

| 항목       | 내용                                                                     |
| ---------- | ------------------------------------------------------------------------ |
| 용도       | 인스타그램 계정의 최신 게시물 목록 가져오기                              |
| 엔드포인트 | `GET https://api.hasdata.com/scrape/instagram/profile?handle={username}` |
| 인증       | `x-api-key` 헤더                                                         |
| 응답 필드  | `id`, `caption`, `displayUrl`, `timestamp`, `url`                        |
| 크레딧     | 호출당 10 크레딧 소모                                                    |
| 사용 파일  | `src/services/instagram-api.js`, `scripts/check-toons.js`                |

**응답 예시:**

```json
{
  "latestPosts": [
    {
      "id": "...",
      "caption": "인스타툰 47화",
      "displayUrl": "https://...",
      "timestamp": "2026-05-16T07:34:58.000Z",
      "url": "https://www.instagram.com/p/.../"
    }
  ]
}
```

---

### 2. OCR.space — 이미지 텍스트 인식

| 항목       | 내용                                                     |
| ---------- | -------------------------------------------------------- |
| 용도       | 캡션에 화수가 없을 때 게시물 이미지에서 텍스트 추출      |
| 엔드포인트 | `GET https://api.ocr.space/parse/imageurl`               |
| 인증       | `apikey` 쿼리 파라미터                                   |
| 설정       | `language=kor`, `OCREngine=3`, `isOverlayRequired=false` |
| 무료 한도  | 25,000회 / 월                                            |
| 사용 파일  | `src/services/ocr-service.js`                            |

> **Engine 3** 선택 이유: 한국어 웹툰 이미지 내 숫자·스타일 폰트 인식률 최적
>
> 429 또는 quota 초과 응답이 2회 이상 발생하면 해당 새로고침 사이클 전체를 중단해 불필요한 API 소모를 방지함

---

### 3. Supabase — 온라인 데이터베이스

| 항목      | 내용                                          |
| --------- | --------------------------------------------- |
| 용도      | 툰 목록 및 디바이스 push token 저장           |
| 테이블    | `toons`, `push_tokens`                        |
| 사용 파일 | `src/services/supabase.js`, `scripts/check-toons.js` |

### 4. Expo Push API — 푸시 알림 전송

| 항목      | 내용                                       |
| --------- | ------------------------------------------ |
| 용도      | GitHub Actions에서 디바이스로 알림 전송    |
| 엔드포인트 | `POST https://exp.host/--/api/v2/push/send` |
| 인증      | 불필요 (Expo 토큰 기반)                    |
| 비용      | 무료                                       |

---

## 기술 스택

| 분류                | 라이브러리 / 서비스                                   |
| ------------------- | ----------------------------------------------------- |
| 프레임워크          | React Native + Expo SDK 54                            |
| 로컬 저장소         | `@react-native-async-storage/async-storage`           |
| 온라인 DB           | Supabase (`@supabase/supabase-js`)                    |
| 푸시 알림           | `expo-notifications` + Expo Push API                  |
| 배치 실행           | GitHub Actions (1시간 인터벌)                         |
| 제스처              | `react-native-gesture-handler`                        |
| 인스타그램 스크래핑 | [hasdata API](https://hasdata.com)                    |
| 이미지 OCR          | [OCR.space API](https://ocr.space) (Engine 2, 한국어) |

---

## 실행 방법

```bash
cd /Users/choeyunseong/프로젝트/toon-notifier-app
npx expo start
```

Expo Go 앱으로 QR 코드 스캔 → 즉시 폰에서 실행

### API 키 설정 (`config.js`)

```js
export const HASDATA_KEY = "YOUR_HASDATA_KEY";
export const OCR_SPACE_KEY = "YOUR_OCR_SPACE_KEY";
export const SUPABASE_URL = "YOUR_SUPABASE_URL";
export const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
```

> `config.js`는 `.gitignore`에 포함되어 있습니다. 절대 커밋하지 마세요.

### GitHub Actions Secrets 설정

배치 스크립트 실행에 필요한 환경 변수를 GitHub 저장소 Settings → Secrets에 등록:

| Secret 이름          | 내용                        |
| -------------------- | --------------------------- |
| `SUPABASE_URL`       | Supabase 프로젝트 URL       |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `HASDATA_KEY`        | hasdata API 키              |
| `OCR_SPACE_KEY`      | OCR.space API 키            |

---

## 파일 구조

```
toon-notifier-app/
├── App.js                        ← 루트: 알림 핸들러 + push token 등록
├── app.json                      ← Expo 앱 설정 (EAS projectId 포함)
├── eas.json                      ← EAS 빌드 설정
├── config.js                     ← API 키 (gitignore)
├── scripts/
│   └── check-toons.js            ← GitHub Actions 배치 스크립트
├── .github/workflows/
│   └── check-toons.yml           ← 1시간마다 배치 실행
└── src/
    ├── screens/
    │   └── HomeScreen.js         ← 메인 화면 (섹션 리스트 + 새로고침)
    ├── components/
    │   ├── ToonCard.js           ← 카드 UI (스와이프 삭제, NEW 배지)
    │   ├── AddToonModal.js       ← 툰 추가 바텀시트 (드래그 투 디스미스)
    │   └── EmptyState.js         ← 빈 상태 화면
    ├── services/
    │   ├── toon-service.js       ← AsyncStorage CRUD + Supabase 동기화
    │   ├── supabase.js           ← Supabase 클라이언트
    │   ├── instagram-api.js      ← hasdata API 호출 및 응답 파싱
    │   └── ocr-service.js        ← OCR.space API (이미지 → 텍스트)
    ├── hooks/
    │   └── useKeywordDetector.js ← 화/편/ep 숫자 추출 정규식
    └── utils/
        └── emoji-icon.js         ← 시리즈 이름 → 이모지 매핑
```

---

## 에피소드 감지 흐름

```
인스타그램 게시물 (최신 12개, 오래된 순으로 처리)
        │
        ▼  ← 각 게시물마다 반복 (루프 끝까지)
캡션에 시리즈 키워드 있음?
  ├─ YES → 캡션에서 화수 추출
  │         └─ 화수 없음 → OCR 폴백
  └─ NO  → OCR로 이미지에서 키워드 확인
              └─ 키워드 없음 → 건너뜀

화수 > 현재까지 발견한 최고화수?
  ├─ YES → collected 배열에 추가, 계속 루프 진행 (중단 안 함)
  └─ NO  → 건너뜀

── 루프 종료 후 ──

collected 비어있음?
  ├─ YES → 변경 없음
  │         └─ 캡션에 시리즈 게시물 전혀 없음? → undetectable 뱃지 표시
  └─ NO  → episodeHistory + unreadPosts 병합 저장
             알림 전송: "3화, 4화가 추가되었어요" (복수화 합산)
```

### 직접 확인(undetectable) 뱃지

최신 12개 게시물 캡션 어디에도 시리즈 키워드가 없을 때 표시.
감지 루프가 완료된 뒤에 판단하므로, OCR 기회를 먼저 보장한다.
당겨서 수동 새로고침 시 undetectable 툰도 재시도한다.

### 키워드 매칭 전략

| 경로      | 사용 단어                     | 이유                      |
| --------- | ----------------------------- | ------------------------- |
| 캡션 매칭 | 시리즈명에서 3자 이상 단어 우선, 없으면 가장 긴 2개 | 흔한 짧은 단어 오탐 방지  |
| OCR 매칭  | 시리즈명 모든 단어(2자 이상)  | OCR 노이즈 허용, 관대하게 |

### 화수 추출 패턴 (캡션)

| 형식            | 예시    |
| --------------- | ------- |
| `n화`           | `47화`  |
| `n편`           | `3편`   |
| `ep.n` / `EP n` | `ep.12` |
| `#n`            | `#47`   |

### 화수 추출 패턴 (OCR 추가)

| 형식              | 예시            |
| ----------------- | --------------- |
| 괄호 안 숫자      | `(2,` → `2`     |
| 줄 단위 독립 숫자 | `\n47\n` → `47` |

---

## 데이터 모델

### toons (Supabase + AsyncStorage)

```js
{
  id: string,              // UUID
  username: string,        // 인스타 계정명 (@ 제외)
  seriesName: string,      // 시리즈 이름 (키워드 매칭 기준)
  lastEpisode: number,     // 마지막 감지된 화수
  readEpisode: number,     // 사용자가 읽음 처리한 화수
  hasNewEpisode: boolean,  // 새 에피소드 여부
  episodeHistory: Array<{ episode: number, url: string }>, // 누적 에피소드 기록 (등록화 포함)
  unreadPosts: Array<{ episode: number, url: string }>,    // 아직 안 읽은 에피소드 목록
  undetectable: boolean,   // 최신 12개에 시리즈 게시물 없음 → 직접 확인 필요
  lastPostId: string,      // 마지막 확인한 게시물 ID
  lastPostUrl: string,     // 게시물 링크
  lastThumbnailUrl: string,
  lastEpisodeTitle: string,
  isComplete: boolean,     // 완결 여부
  pendingComplete: boolean, // 미읽은 화 있는 동안 완결 알림 유예
  deviceId: string,        // 디바이스 식별자 (push token 매칭용)
  addedAt: string,         // ISO 날짜
  updatedAt: string,
}
```

### push_tokens (Supabase)

```js
{
  token: string,    // Expo push token (ExponentPushToken[...])
  platform: string, // 'ios' | 'android'
  device_id: string // 디바이스 식별자
}
```

---

## 에피소드 상태 표시 규칙

| 상태             | 카드 배지                  |
| ---------------- | -------------------------- |
| 새 에피소드 있음 | `새 에피소드` (강조색)     |
| 읽음 처리 후     | `읽음` (회색)              |
| 완결             | `완결` / `완결됨!`         |
| 직접 확인 필요   | `직접 확인` (회색)         |

### 카드 탭 동작

| 동작       | 결과                                                             |
| ---------- | ---------------------------------------------------------------- |
| 탭         | 에피소드 목록 아코디언 펼치기 / 닫기 (애니메이션)                |
| 에피소드 탭 | 해당 화 인스타 게시물 열기; 안 읽은 화면 readEpisode 자동 진행  |
| 롱프레스   | 시리즈 이름 / 읽은 화수 수정 모달 열기                          |
| 새로고침 ↺ | 해당 툰 단건 체크 (OCR 포함)                                    |
| IG 아이콘  | 해당 계정 인스타그램 프로필 열기 (새로고침 없음)                |

### 툰 추가 모달

1. 마지막으로 읽은 화의 인스타그램 링크 붙여넣기 (필수)
2. 링크 가져오기 성공 후 계정명 / 시리즈명 / 화수 자동 채움
3. 자동 채운 값 직접 수정 가능 (링크 가져오기 전 필드 잠김)

---

## 기능구현서

### 핵심 기능

| 기능 | 설명 |
| ---- | ---- |
| 툰 등록 | 인스타 게시물 링크 붙여넣기 → 계정명 / 시리즈명 / 화수 자동 파싱 |
| 에피소드 감지 | 캡션 키워드 매칭 + 정규식 화수 추출 (`n화` / `n편` / `ep.n` / `#n`) |
| OCR 폴백 (앱) | 캡션에서 화수 추출 실패 시 썸네일 이미지를 ML Kit(`@react-native-ml-kit/text-recognition`)로 온디바이스 OCR — API 키 불필요, 네트워크 없이 동작 |
| OCR 폴백 (서버) | GitHub Actions 배치에서는 ML Kit 사용 불가 → ocr.space API로 대체 (서버 전용) |
| 완결 처리 | `완` / `완결` 패턴 감지 → 가상 화수 부여, 완결 배지 표시 |
| 푸시 알림 | GitHub Actions 배치(3시간)가 새 화수 감지 시 Expo Push로 기기 알림 전송 |
| 에피소드 목록 | 카드 탭 시 읽은 화 / 안 읽은 화 목록 펼치기, 화수 탭 → 인스타 이동 + 읽음 처리 |
| 스와이프 삭제 | 카드 좌스와이프로 툰 삭제 |
| 수정 | 카드 롱프레스 → 시리즈명 / 읽은 화수 수정 |
| 다크 모드 | 시스템 기본값 연동, 헤더 버튼으로 수동 전환 |
| 백그라운드 복귀 | AppState 감지 → 포그라운드 복귀 시 목록 자동 갱신 |

### 아키텍처

| 레이어 | 파일 | 역할 |
| ------ | ---- | ---- |
| 앱 로직 | `toon-store.js` | AsyncStorage CRUD + Supabase 동기화 |
| 앱 로직 | `check-service.js` | 에피소드 감지 (`checkToon`, `checkAllToons`) |
| 앱 로직 | `notifications.js` | 로컬 알림 전송 |
| 서버 배치 | `scripts/check-toons.js` | GitHub Actions: 감지 + 푸시 알림 |
| 데이터 | Supabase | 서버↔앱 상태 동기화, 푸시 토큰 저장 |
| OTA | EAS Update | JS 변경 시 새 빌드 없이 즉시 배포 |
