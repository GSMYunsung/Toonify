# OCR API 크레딧 93% 절감기 — 같은 이미지를 왜 8번씩 분석하고 있었나

> **날짜:** 2026-07-27  
> **분류:** 성능 최적화 / 외부 API 비용 절감  
> **파일:** `scripts/check-toons.js`

---

## 배경

인스타툰 알림 서비스 **Toonify**는 GitHub Actions를 이용해 3시간마다 구독 중인 인스타그램 계정의 새 포스트를 감지한다. 문제는 인스타툰 작가들이 항상 캡션에 시리즈명과 화수를 친절하게 써주지 않는다는 점이다.

```
캡션 예시 (좋은 경우):  "남미새 12화 업로드!"  → 텍스트만으로 화수 감지 가능
캡션 예시 (나쁜 경우):  "🌸"                   → 이미지를 직접 OCR해야 함
```

이 경우 포스트 썸네일 이미지에서 직접 텍스트를 읽어야 하기 때문에 **OCR.space API**를 호출한다. 이 API는 무료 플랜 기준 월 25,000건 제한이 있고, 한도를 초과하면 키를 교체해야 한다. 실제로 이 프로젝트에서 이미 키를 3개 소진했다.

---

## 문제 발견

OCR API 크레딧을 확인하던 중 의문이 생겼다.

> "GitHub Actions가 하루 8번 도는데, 크레딧이 왜 이렇게 빨리 닳지?"

코드를 다시 들여다봤다.

```js
// check-toons.js (수정 전)
async function checkToon(toon) {
  const allPosts = await fetchLatestPosts(toon.username);
  const posts = [...allPosts]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 6)                                  // ← 항상 최신 6개
    .sort((a, b) => a.timestamp - b.timestamp);

  for (const post of posts) {                     // ← 6개 전부 순회
    const captionMatched = keyWords.some(w => caption.includes(w));
    
    if (!captionMatched) {
      const ocrText = await extractTextFromImage(post.thumbnailUrl);  // ← OCR 호출
      ...
    }
  }
}
```

**여기서 문제가 보인다.** 스크립트가 실행될 때마다 최신 6개 포스트를 가져오고, 그 중 캡션에 키워드가 없는 포스트는 **매번 OCR을 다시 호출**하고 있었다.

새 포스트가 올라왔는지 여부와 상관없이 동일한 포스트를 반복해서 OCR하고 있었던 것이다.

---

## 원인 분석

### 실제 호출 흐름

어떤 툰 작가가 일주일에 2번만 업로드한다고 가정하자 (연재툰 평균).

```
[월요일 업로드] 포스트A (캡션 없음 → OCR 필요)
[수요일 업로드] 포스트B (캡션 없음 → OCR 필요)

GitHub Actions 실행 횟수 (3시간마다, 하루 8번):
  월 8회 × 포스트A OCR = 8회
  화 8회 × 포스트A OCR = 8회  ← 화요일에도 월요일 포스트를 또 OCR
  수 8회 × 포스트A, B OCR = 16회
  ...
```

**같은 이미지를 하루에 최대 8번씩 분석하고 있었다.**

### 수치로 보면

| 항목 | 값 |
|---|---|
| GitHub Actions 실행 주기 | 3시간마다 |
| 하루 실행 횟수 | 8회 |
| 가져오는 포스트 수 | 최신 6개 |
| 캡션 미매칭 비율 (평균) | 약 70% |
| OCR 호출 / 실행 | 약 4회 |
| **하루 OCR 호출 (툰 5개 기준)** | **160회** |
| **월 OCR 호출** | **약 4,800회** |

무료 플랜 25,000건 기준으로 월 5.2개 툰만 구독해도 한도 초과가 된다.

### 왜 중복 방지가 안 돼있었나?

코드에는 `last_post_id`라는 필드가 이미 존재했다. 그런데 이 필드가 업데이트되는 시점이 두 가지뿐이었다:

1. **첫 체크 시**: 가장 오래된 포스트 ID를 기준점으로 저장
2. **새 에피소드 발견 시**: 대표 포스트 ID로 업데이트

즉, **새 에피소드가 없으면 `last_post_id`는 전혀 갱신되지 않는다.** 다음 실행 때 같은 6개 포스트를 또 가져와서 또 OCR한다.

```
실행 1 (월 09:00): posts=[A,B,C,D,E,F] → OCR(A,B,D,E,F) → 에피소드 없음 → last_post_id 그대로
실행 2 (월 12:00): posts=[A,B,C,D,E,F] → OCR(A,B,D,E,F) → 에피소드 없음 → last_post_id 그대로
실행 3 (월 15:00): posts=[A,B,C,D,E,F] → OCR(A,B,D,E,F) → ...
```

**포스트 F가 올라온 게 일주일 전이어도 매 실행마다 OCR이 돌았다.**

---

## 해결 방법

### 핵심 아이디어

`last_post_id`를 "마지막으로 새 에피소드를 찾은 포스트"가 아니라 **"마지막으로 확인한 포스트"** 로 활용한다.

매 실행 후 `last_post_id`를 가장 최신 포스트로 전진시키면, 다음 실행 때는 그 이후에 올라온 포스트만 처리하면 된다.

### 구현

```js
// filterNewPosts: last_post_id 이후 포스트만 추출
function filterNewPosts(posts, lastPostId) {
  if (!lastPostId) return posts;
  const lastSeenIdx = posts.findIndex(p => p.id === lastPostId);
  // lastSeenIdx === -1: 기준 포스트가 최신 6개 밖으로 밀린 경우 → 안전하게 전부 반환
  return lastSeenIdx === -1 ? posts : posts.slice(lastSeenIdx + 1);
}
```

`checkToon` 내부에서의 변경:

```js
// 수정 전
for (const post of posts) { ... }                          // 항상 6개 전부

// 수정 후
const newPosts = filterNewPosts(posts, toon.last_post_id); // 새 것만

if (newPosts.length === 0) {
  console.log(`[${toon.username}] 새 포스트 없음 — 스킵`);
  return { found: false };                                 // OCR 0회
}

for (const post of newPosts) { ... }                       // 새 포스트만 순회
```

에피소드를 못 찾아도 `last_post_id`를 전진:

```js
// 수정 전
if (collected.length === 0) return { found: false };

// 수정 후
if (collected.length === 0) {
  const newestSeen = newPosts[newPosts.length - 1];
  await supabase.from("toons")
    .update({ last_post_id: newestSeen.id })  // ← 다음 실행 때 스킵되도록 전진
    .eq("id", toon.id);
  return { found: false };
}
```

### 엣지케이스 처리

| 상황 | 처리 방식 |
|---|---|
| 첫 체크 (last_post_id 없음) | 전체 포스트 반환 후 최신 포스트 ID 저장 |
| 새 포스트 없음 | 즉시 스킵, OCR 0회 |
| last_post_id가 6개 밖으로 밀림 (대량 업로드) | 안전하게 전체 반환 (재처리 허용) |
| 에피소드 발견 못 해도 | last_post_id 전진 → 다음 실행 때 스킵 |

---

## 테스트

로직 무결성을 코드로 검증했다. (`scripts/test-check-toons.js`)

### 테스트 케이스 (12개)

```
[케이스 1] 첫 체크 — last_post_id 없음
  ✅ lastPostId가 null이면 포스트 전체 반환
  ✅ lastPostId가 빈 문자열이면 포스트 전체 반환

[케이스 2] 가장 최신 포스트가 last_post_id — 새 포스트 0개
  ✅ last_post_id가 마지막 포스트면 빈 배열 반환 → OCR 0회

[케이스 3] last_post_id가 중간 — 이후 포스트만 반환
  ✅ p3이 last_post_id면 p4·p5·p6 반환
  ✅ p1이 last_post_id면 p2~p6 5개 반환

[케이스 4] last_post_id가 현재 6개 밖으로 밀린 경우
  ✅ 알 수 없는 ID면 안전하게 전체 반환 (재처리 허용)

[케이스 5] 포스트 1개 엣지케이스
  ✅ 포스트 1개이고 그게 last_post_id면 빈 배열
  ✅ 포스트 1개이고 last_post_id 없으면 1개 반환

[케이스 6] OCR 절감 효과 시뮬레이션
  ✅ 기존 방식: last_post_id 무시하고 전체 6개 처리 → OCR 4회
  ✅ 개선 방식: m4가 last_post_id → m5·m6만 처리 → OCR 1회
  ✅ 개선 방식: m6이 last_post_id → 새 포스트 없음 → OCR 0회

[케이스 7] 반환 순서 보장 (오래된 것부터)
  ✅ p2가 last_post_id면 반환 순서는 p3 → p4 → p5 → p6

결과: 12개 테스트 중 12개 통과, 0개 실패
```

---

## 결과

### 수치 비교 (툰 5개 구독, 하루 8회 실행 기준)

| 항목 | 수정 전 | 수정 후 |
|---|---|---|
| 포스트당 OCR 호출 | 매 실행마다 | 포스트 최초 등장 시 1회만 |
| 하루 OCR 호출 | ~160회 | ~12회 |
| 월 OCR 호출 | ~4,800회 | ~360회 |
| **절감률** | — | **약 93%** |

### 비용 관점

OCR.space 무료 플랜 기준 월 25,000건. 수정 전에는 툰 5개만 구독해도 소진 가능했지만, 수정 후에는 **약 69개 툰**을 구독해야 동일한 크레딧을 소모한다.

### 동작 흐름 비교

**수정 전:**
```
실행 1 (09:00): posts=[A,B,C,D,E,F] → OCR(A,B,D,F) = 4회
실행 2 (12:00): posts=[A,B,C,D,E,F] → OCR(A,B,D,F) = 4회  ← 동일 이미지 재분석
실행 3 (15:00): posts=[A,B,C,D,E,F] → OCR(A,B,D,F) = 4회
...하루 32회 OCR (툰 1개 기준)
```

**수정 후:**
```
실행 1 (09:00): posts=[A,B,C,D,E,F] → OCR(A,B,D,F) = 4회, last_post_id=F로 저장
실행 2 (12:00): posts=[A,B,C,D,E,F] → 새 포스트 없음 → OCR 0회
실행 3 (15:00): posts=[A,B,C,D,E,F] → 새 포스트 없음 → OCR 0회
...새 포스트 올라올 때만 OCR
```

---

## 교훈

**비용이 드는 외부 API 호출은 항상 "이미 한 번 했는가?"를 체크해야 한다.**

이 케이스에서 `last_post_id`라는 상태값이 이미 존재했지만, 새 에피소드가 없을 때 갱신하지 않는 설계 결함이 있었다. 상태를 "마지막으로 처리한 포스트"가 아닌 "마지막으로 찾은 에피소드의 포스트"로만 관리했기 때문이다.

해결의 핵심은 **새 포스트 유무와 무관하게 "이미 본 포스트는 다시 보지 않겠다"는 기준을 확립**하는 것이었다.

---

*관련 파일: `scripts/check-toons.js`, `scripts/test-check-toons.js`*  
*커밋: `355be09` — perf: OCR 재호출 방지 — last_post_id 기준 새 포스트만 처리*
