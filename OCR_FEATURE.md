# 이미지 OCR 에피소드 감지 기능 구현 기록

## 1. 프로젝트 배경

**인스타툰 알림 앱**은 인스타그램에서 활동하는 웹툰 작가(@username)의 새 게시물을 주기적으로 확인해, 새 에피소드가 올라오면 푸시 알림을 보내주는 앱이다.

```
[앱 흐름]
사용자가 작가 계정 등록
    → 앱이 1시간마다 인스타그램 포스트 조회 (GitHub Actions 배치)
    → 새 에피소드 감지
    → 푸시 알림 발송
```

---

## 2. 문제 정의

### 기존 방식의 한계

기존 에피소드 감지는 **캡션(게시물 텍스트)** 에서만 화수를 추출한다.

```
캡션 예시 (잘 되는 경우):
  "하루툰 47화 🎉 오늘도 잘 부탁드려요!"
  → 정규식으로 "47" 추출 성공 ✅
```

하지만 일부 작가는 화수를 **이미지 안에 직접 그려넣는다.**

```
캡션 예시 (안 되는 경우):
  "하루툰 🎉 오늘도 잘 부탁드려요!"   ← 텍스트에 숫자 없음
  [이미지 안에 "47화" 라고 쓰여 있음]
  → 화수 추출 실패, 알림 미발송 ❌
```

---

## 3. 해결 방안 검토

| 방법                                  | 설명                             | 비용              | 난이도                  |
| ------------------------------------- | -------------------------------- | ----------------- | ----------------------- |
| **방법 1** OCR (ML Kit)               | 온디바이스 텍스트 인식           | 무료              | 중 (네이티브 빌드 필요) |
| **방법 2** OCR (OCR.space API)        | 클라우드 REST API                | 무료 플랜 있음    | 하                      |
| **방법 3** AI 이미지 분석             | Claude/GPT-4o에 이미지 전송      | API 호출마다 비용 | 하                      |
| **방법 4** 포스트 ID 비교             | 화수 포기, 새 포스트 여부만 감지 | 무료              | 하                      |
| **방법 5** 캡션 + OCR + ID 하이브리드 | 1→2→3 순서로 순차 시도           | 무료              | 중                      |

### 선택: 방법 5 (하이브리드) + OCR.space

- OCR 엔진은 **ML Kit 대신 OCR.space REST API** 채택
  - ML Kit은 네이티브 빌드(expo prebuild) 필요 → Expo Go 실행 불가
  - OCR.space는 HTTP 요청만으로 동작 → Expo Go에서 즉시 테스트 가능
- 기존 캡션 방식 유지 → 성능 손실 없음
- 캡션 실패 시에만 OCR 시도 → 불필요한 처리 최소화
- OCR도 실패하면 포스트 ID로 새 게시물 감지 → 놓치는 경우 없음

---

## 4. 구현 흐름

### 변경 전

```
checkToon()
├─ 포스트 조회
├─ 시리즈 키워드가 캡션에 있는지 확인
├─ 캡션에서 화수 추출 (regex)
│   └─ 실패하면 → skip (놓침 ❌)
└─ 새 화수면 알림 발송
```

### 변경 후

```
checkToon()
├─ 포스트 조회 (전체) → 최신 3개만 체크
├─ 각 포스트에 대해:
│   ├─ [1단계] 캡션 키워드 매칭 (시리즈명 단어 중 긴 것 2개)
│   │   └─ 매칭 실패 → OCR로 전체 단어 매칭 시도
│   ├─ [2단계] 캡션에서 화수 추출 (extractEpisodeNumber)
│   │   └─ 실패 또는 캡션 키워드만 있고 화수 없음 → OCR 폴백
│   │       └─ extractEpisodeNumberFromOCR (더 관대한 패턴)
│   ├─ [완결 감지] "완" / "완결" 텍스트 → lastEpisode+1 가상 화수 부여
│   ├─ [3단계] 새 화수 (ep > lastEpisode) → isNewEpisode: true
│   │          ep 없고 postId 바뀜 → isNewPost: true
│   └─ 감지 시 → unreadPosts 구성 + 알림 발송
```

---

## 5. 수정된 파일 목록

```
toon-notifier-app/
├─ src/
│   ├─ hooks/
│   │   └─ useKeywordDetector.js  ← extractEpisodeNumberFromOCR 추가
│   └─ services/
│       ├─ ocr-service.js         ← OCR.space API 호출
│       └─ toon-service.js        ← 하이브리드 감지 로직
└─ config.js                      ← OCR_SPACE_KEY 추가
```

---

## 6. 파일별 상세 설명

### 6-1. `src/services/ocr-service.js`

OCR.space REST API에 이미지 URL을 전달해 텍스트를 추출하는 함수.

```js
import { OCR_SPACE_KEY } from "../../config";

export async function extractTextFromImage(imageUrl) {
  const params = new URLSearchParams({
    apikey: OCR_SPACE_KEY,
    url: imageUrl,
    language: "kor",
    isOverlayRequired: "false",
    OCREngine: "3",
  });

  const res = await fetch(`https://api.ocr.space/parse/imageurl?${params}`);
  const data = await res.json();
  return data.ParsedResults?.[0]?.ParsedText || "";
}
```

**ML Kit 대비 장점:**

- 네이티브 빌드 불필요 → Expo Go에서 즉시 테스트 가능
- 별도 패키지 설치 없음

**주의:**

- 클라우드 API이므로 인터넷 연결 필요
- 무료 플랜: 월 25,000회 (개인 사용 수준에서는 충분)
- `config.js`에 `OCR_SPACE_KEY` 설정 필요

---

### 6-2. `src/hooks/useKeywordDetector.js`

캡션용과 OCR용 화수 추출 함수를 분리해서 제공.

```js
// 캡션 전용 — 엄격한 패턴 (오탐 방지)
export function extractEpisodeNumber(text) {
  // n화, n편, ep.n, #n, 줄 끝 숫자
}

// OCR 전용 — 더 관대한 패턴 (노이즈 많은 OCR 텍스트 대응)
export function extractEpisodeNumberFromOCR(text) {
  // 위 패턴 먼저 시도, 실패하면 (n), 줄 단위 독립 숫자로 폴백
}

// 완결 감지
export function isCompleteEpisode(text) {
  return /완결?/.test(text);
}
```

**왜 함수를 분리했나?**
OCR 결과는 노이즈가 많아 관대한 패턴이 필요하지만, 캡션에 같은 패턴을 쓰면 오탐이 발생할 수 있다.
예: 캡션에 `(2명 태그됨)` → OCR용 패턴은 2를 화수로 오인할 수 있음.

---

### 6-3. `src/services/toon-service.js` — `checkToon()` 핵심 로직

```js
// 최신 3개 포스트만 체크
const posts = [...allPosts]
  .sort((a, b) => b.timestamp - a.timestamp)
  .slice(0, 3);

for (const post of posts) {
  // 캡션 키워드 매칭: 긴 단어 2개만 사용 (흔한 단어 오탐 방지)
  const keyWords = [...allWords]
    .sort((a, b) => b.length - a.length)
    .slice(0, 2);
  const captionMatched = keyWords.some((w) => caption.includes(w));

  // 캡션 미매칭 → OCR로 전체 단어 매칭 (더 관대)
  if (!captionMatched) {
    const ocrText = await extractTextFromImage(post.thumbnailUrl);
    const ocrMatched = allWords.some((w) => ocrText.includes(w));
    if (!ocrMatched) continue;
    analysisText = ocrText;
  }

  // 화수 추출 (캡션이면 엄격, OCR이면 관대)
  let ep = isOCR
    ? extractEpisodeNumberFromOCR(analysisText)
    : extractEpisodeNumber(analysisText);

  // 캡션에 키워드는 있는데 화수 없을 때 → OCR 폴백
  if (captionMatched && ep === null) {
    const ocrText = await extractTextFromImage(post.thumbnailUrl);
    ep = extractEpisodeNumberFromOCR(ocrText) ?? ep;
  }

  // 완결 처리: 화수 없어도 lastEpisode+1 가상 화수 부여
  if (isCompleteEpisode(analysisText) && ep === null) {
    ep = (toon.lastEpisode || 0) + 1;
  }

  const isNewEpisode = ep !== null && ep > (toon.lastEpisode || 0);
  const isNewPost = ep === null && post.id !== toon.lastPostId;

  if (isNewEpisode || isNewPost) {
    // unreadPosts 구성 + 저장 + 알림
  }
}
```

---

## 7. 필요한 설정

### `config.js`에 키 추가

```js
export const OCR_SPACE_KEY = "여기에_OCR_SPACE_API_키_입력";
```

OCR.space 무료 키 발급: https://ocr.space/ocrapi/freekey

---

## 8. 테스트 방법

OCR.space는 클라우드 API이므로 **Expo Go에서 바로 테스트 가능** (네이티브 빌드 불필요).

```bash
# 1. 앱 실행
npx expo start

# 2. 화수를 이미지에 그려넣는 작가 계정 추가

# 3. 당겨서 새로고침 후 로그 확인
#    캡션에서 감지:   [checkToon] ep=47 isComplete=false isNewEpisode=true
#    OCR에서 감지:    [checkToon] OCR에서 키워드 확인됨
#    포스트 ID 감지:  [checkToon] ep=null isNewPost=true
```

---

## 9. 감지 시나리오별 동작 정리

| 시나리오             | 캡션           | 이미지      | 결과                          |
| -------------------- | -------------- | ----------- | ----------------------------- |
| 텍스트에 화수 있음   | "47화 업로드!" | -           | 1단계 캡션에서 바로 감지 ✅   |
| 이미지에만 화수 있음 | "업로드!"      | "47화" 그림 | 2단계 OCR로 감지 ✅           |
| 화수 표기 없음       | "안녕하세요"   | 그림만      | 3단계 포스트 ID로 감지 ✅     |
| 완결 표기            | "완결입니다"   | "완" 그림   | 완결 감지 → 가상 화수 부여 ✅ |
| 완전히 동일한 포스트 | (동일)         | (동일)      | 알림 없음 (정상) ✅           |
