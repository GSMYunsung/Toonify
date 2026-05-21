# 인스타툰 알림 서비스

인스타그램에 연재 중인 웹툰(인스타툰)의 새 에피소드를 자동으로 감지하고 푸시 알림으로 알려주는 iOS/Android 앱.

---

## 프로젝트 개요

| 항목        | 내용                       |
| ----------- | -------------------------- |
| 플랫폼      | React Native (Expo SDK 54) |
| 지원 기기   | iOS / Android              |
| 테스트 환경 | Expo Go                    |
| 버전        | 1.0.0                      |

---

## 기능 요약

- 인스타툰 계정 등록 및 관리
- 캡션 키워드 매칭으로 새 에피소드 자동 감지
- 이미지 OCR을 통한 화수 인식 (캡션에 화수가 없을 때)
- 새 에피소드 발견 시 로컬 푸시 알림 전송
- 백그라운드 자동 체크 (1분 인터벌)
- 읽음 처리 / NEW 배지 표시

---

## 기술 스택

| 분류                | 라이브러리 / 서비스                                   |
| ------------------- | ----------------------------------------------------- |
| 프레임워크          | React Native + Expo SDK 54                            |
| 로컬 저장소         | `@react-native-async-storage/async-storage`           |
| 푸시 알림           | `expo-notifications`                                  |
| 백그라운드          | `expo-background-fetch` + `expo-task-manager`         |
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

```config.js
export const HASDATA_KEY = "YOUR_HASDATA_KEY";
export const OCR_SPACE_KEY = "YOUR_OCR_SPACE_KEY";
```

> `config.js`는 `.gitignore`에 포함되어 있습니다. 절대 커밋하지 마세요.

---

## 파일 구조

```
toon-notifier-app/
├── App.js                        ← 루트: 알림 핸들러 + 백그라운드 태스크 등록
├── app.json                      ← Expo 앱 설정
├── config.js                     ← API 키 (gitignore)
└── src/
    ├── screens/
    │   └── HomeScreen.js         ← 메인 화면 (섹션 리스트 + 새로고침)
    ├── components/
    │   ├── ToonCard.js           ← 카드 UI (스와이프 삭제, NEW 배지, 수동 체크)
    │   ├── AddToonModal.js       ← 툰 추가 바텀시트 (드래그 투 디스미스)
    │   └── EmptyState.js         ← 빈 상태 화면
    ├── services/
    │   ├── toon-service.js       ← AsyncStorage CRUD + 에피소드 감지 로직
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
인스타그램 게시물 (최신 3개)
        │
        ▼
캡션에 시리즈 키워드 있음?
  ├─ YES → 캡션에서 화수 추출
  │         └─ 화수 없음 → OCR 폴백
  └─ NO  → OCR로 이미지에서 키워드 확인
              └─ 키워드 없음 → 건너뜀

화수 > lastEpisode?
  ├─ YES (새 에피소드) → hasNewEpisode: true + 알림 전송
  └─ NO  → 건너뜀
```

### 키워드 매칭 전략

| 경로      | 사용 단어                     | 이유                      |
| --------- | ----------------------------- | ------------------------- |
| 캡션 매칭 | 시리즈명에서 가장 긴 단어 2개 | 흔한 짧은 단어 오탐 방지  |
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

## 작업 분담 보고서

| 구분 | 항목 | 내용 |
| :---: | ---- | ---- |
| 👤 **나** | 서비스 기획 | 인스타툰 알림 앱 아이디어 및 전체 방향 설정 |
| 👤 **나** | 요구사항 정의 | 기능 목록, 에피소드 감지 방식, UI 흐름 결정 |
| 👤 **나** | API 키 발급 | hasdata, OCR.space 계정 생성 및 키 제공 |
| 👤 **나** | 기술 결정 | OCR 엔진 선택 (OCR.space Engine 2 지정) |
| 👤 **나** | QA 테스트 | 실기기(Expo Go)에서 기능 테스트 및 버그 리포트 |
| 👤 **나** | 예외 케이스 발굴 | 완결화 표기, 해시태그 형식, 중복 알림, 화수 null 등 발견 및 수정 요청 |
| 👤 **나** | 키워드 전략 개선 | 긴 시리즈 제목 오탐 가능성 발견 및 개선 방향 제시 |
| 👤 **나** | 사용성 개선 | 드래그 투 디스미스, `@` 입력 처리 등 UX 불편 직접 발견 |
| 🤖 **Claude** | 전체 아키텍처 | 서비스 레이어 분리, AsyncStorage 데이터 모델 (`toon_notifier_v2`) 설계 |
| 🤖 **Claude** | 에피소드 감지 | 캡션 키워드 매칭 + `n화` / `n편` / `ep.n` / `#n` 화수 추출 정규식 구현 |
| 🤖 **Claude** | OCR 연동 | OCR.space API 통합 (`ocr-service.js`), 이미지 → 텍스트 변환 흐름 구현 |
| 🤖 **Claude** | 하이브리드 감지 | 캡션 키워드 없음 → OCR / 캡션 화수 없음 → OCR 폴백 2단계 구조 설계 |
| 🤖 **Claude** | OCR 화수 추출 | 괄호 숫자 `(2,`, 줄 단위 독립 숫자 패턴 추가 (`extractEpisodeNumberFromOCR`) |
| 🤖 **Claude** | 완결 처리 | `완`/`완결` 패턴 감지 → 화수 없을 시 `lastEpisode + 1` 가상 화수 부여 |
| 🤖 **Claude** | 키워드 강화 | 긴 제목 오탐 방지 — 가장 긴 단어 2개만 캡션 매칭에 사용 |
| 🤖 **Claude** | 중복 알림 방지 | `hasNewEpisode`가 이미 `true`이면 알림 재발송 차단 |
| 🤖 **Claude** | 백그라운드 실행 | `expo-background-fetch` + `expo-task-manager` 1분 인터벌 태스크 등록 |
| 🤖 **Claude** | 로컬 푸시 알림 | `expo-notifications`로 새 에피소드 / 완결 알림 메시지 구분 전송 |
| 🤖 **Claude** | UI 구현 | 카드 리스트, NEW/구독중 섹션 분리, NEW 배지, 이모지 아이콘 자동 매핑 |
| 🤖 **Claude** | 바텀시트 모달 | `PanResponder` 드래그 투 디스미스, TextInput 충돌 없이 전체 영역 적용 |
| 🤖 **Claude** | 스와이프 삭제 | `react-native-gesture-handler` Swipeable 좌스와이프 삭제 구현 |
| 🤖 **Claude** | 버그 수정 | stale props 방지, firstCheck 기준점, `@` 입력 처리, 고정 게시물 대응 |

---

## 데이터 모델

```js
{
  id: string,              // UUID
  username: string,        // 인스타 계정명 (@ 제외)
  seriesName: string,      // 시리즈 이름 (키워드 매칭 기준)
  lastEpisode: number,     // 마지막 감지된 화수
  readEpisode: number,     // 사용자가 읽음 처리한 화수
  hasNewEpisode: boolean,  // 새 에피소드 여부
  lastPostId: string,      // 마지막 확인한 게시물 ID
  lastPostUrl: string,     // 게시물 링크
  lastThumbnailUrl: string,
  lastEpisodeTitle: string,
  addedAt: string,         // ISO 날짜
  updatedAt: string,
}
```

---

## 에피소드 상태 표시 규칙

| 상태             | 카드 표시                                |
| ---------------- | ---------------------------------------- |
| 새 에피소드 있음 | `47화까지 나옴 / 45화까지 봄` + NEW 배지 |
| 읽음 처리 후     | `47화까지 봄`                            |
| 등록만 한 경우   | `아직 읽은 편 없음`                      |
