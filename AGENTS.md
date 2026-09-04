# Toonify — AI 개발 문서

> 이 파일은 AI 작업 지침(원 AGENTS.md) + AI 거버넌스 실증 케이스 스터디(원 AI_GOVERNANCE.md) + OCR 기능 구현 기록(원 OCR_FEATURE.md) + 트러블슈팅 로그(원 TROUBLESHOOTING.md)를 하나로 통합한 문서입니다. `README.md`를 제외한 루트 md 파일을 여기에 모았습니다.
> CLAUDE.md가 "무엇을 할지" 정의한다면, 이 파일은 "어떻게 생각하고 어떤 순서로 접근할지 + 그동안 무엇을 배웠는지"를 정의합니다.
> 작업 시작 시에는 Part 1만 읽으면 충분합니다. Part 2~4는 각각 필요할 때(거버넌스 근거를 보여줘야 할 때 / OCR 로직을 건드릴 때 / 버그 원인을 과거 기록에서 찾을 때)만 펼쳐보세요.

## 목차

- Part 1 — AI Agent 행동 지침 (태스크 라우팅 · 리스크 게이트 · 역할분리 · 로그)
- Part 2 — AI 개발 거버넌스: 구축과 실증
- Part 3 — OCR 에피소드 감지 기능 구현 기록
- Part 4 — 트러블슈팅 로그

---

# Part 1 — AI Agent 행동 지침

## 태스크별 참조 파일 맵

`.claude/guides/`에 전부 모여있고, 파일명 접두사가 원래 성격을 나타낸다 — `doc-`(레퍼런스), `skill-`(사고 가이드), `recipe-`(체크리스트), `template-`(빈칸 채우기).

| 파일 | 언제 읽나 (태스크 시작 시) | 언제 갱신하나 (작업 완료 후) |
|---|---|---|
| `.claude/guides/skill-episode-detection.md` | 에피소드 감지 로직 수정 | 로직 변경 / 새 엣지케이스 발견 시 |
| `.claude/guides/skill-deploy-decision.md` | 배포 방식 결정 | 배포 규칙(OTA 조건, 버전 규칙 등) 변경 시 |
| `.claude/guides/template-feature.md` → `.claude/guides/recipe-new-feature.md` | 새 기능 구현 | 개발 워크플로우 변경 시 |
| `.claude/guides/template-bugfix.md` | 버그 수정 | – |
| `.claude/guides/recipe-ota-deploy.md` | OTA 배포 실행 | 배포 절차 변경 시 |
| `.claude/guides/recipe-new-build.md` | 새 빌드 실행 | 배포 절차 변경 시 |
| `.claude/guides/doc-architecture.md` | 코드 구조 파악 | 새 기능 추가 / 서비스 구조 변경 시 |
| `.claude/guides/doc-data-model.md` | 데이터 모델 관련 작업 | toon 필드 추가·변경 / Supabase 스키마 변경 시 |
| `.claude/guides/doc-code-standards.md` | 코드 리뷰 / 품질 판단 | 새 금지 패턴 또는 새 공통 함수 발견 시 |

정의서가 코드 현실과 어긋나면 다음 작업 시 잘못된 전제로 시작하게 됩니다 — 작업 완료 후 위 표의 "갱신 시점"에 해당하면 반드시 업데이트하세요. 표에 없는 새로운 반복 작업 패턴이 생기면 `.claude/guides/recipe-*.md` 형식으로 파일을 새로 추가하고 이 표에 행을 더하세요.

---

## 모든 태스크 공통 원칙

1. **기존 함수 먼저 탐색** — 구현 전 `matchingUtils.js` → `check-service.js` → `toon-store.js` 순서로 유사 로직 확인
2. **공유 로직은 `src/utils/`** — 앱(`src/`)과 서버(`scripts/`)가 함께 쓰는 로직은 반드시 공유 파일로
3. **배포 전 자가검증** — `.claude/guides/recipe-ota-deploy.md` 체크리스트 완료 후 배포
4. **트러블슈팅 기록 (Part 4)** — 해결한 버그/문제는 이 문서 Part 4에 반드시 기록
5. **작업 시작 전 리스크 등급 판단** — 아래 "리스크 기반 승인 게이트" 표를 먼저 확인

---

## 리스크 기반 승인 게이트

작업을 시작하기 전, 무엇을 건드리는지에 따라 승인 절차의 무게를 다르게 적용합니다.
모든 작업을 똑같이 무겁게 묶지 않고, 되돌리기 어렵거나 파급 범위가 큰 부분만 강하게 게이트합니다.

| 리스크 등급 | 해당 범위 | 절차 |
|---|---|---|
| **High** | `matchingUtils.js`, Supabase 스키마, `check-toons.js`(서버 배치), 배포 설정(`eas.json`, `app.config.js`) | 반드시 **Plan Mode**로 계획 작성 → 사용자 승인(ExitPlanMode) 후에만 구현 착수 |
| **Medium** | `check-service.js`, `toon-store.js`, `notifications.js` 등 서비스 레이어 | `.claude/guides/template-feature.md` 또는 `template-bugfix.md`를 채워 사용자에게 요약 확인을 받은 후 진행 (Plan Mode까지는 필수 아님) |
| **Low** | UI 컴포넌트 스타일, 텍스트 문구, 단순 리팩터링 | 바로 진행 가능, 완료 후 결과만 보고 |

- **배포(OTA/빌드)는 변경 크기와 무관하게 항상 High로 취급** — 되돌리기 어렵기 때문
- 등급 판단이 애매하면 상위 등급(더 신중한 쪽)으로 처리

---

## 역할 분리 (researcher / planner / reviewer)

작업은 탐색 → 계획 → 구현 → 검증의 흐름을 따르고, 각 단계는 서로 다른 역할이 담당합니다.

```
탐색(researcher)  →  계획(planner)  →  구현  →  검증(reviewer)
```

| 역할 | 담당 | 언제 호출 |
|------|------|-----------|
| **researcher** | `toon-researcher` 서브에이전트 (읽기 전용) | 구현 전 기존 로직·중복 여부 확인이 필요할 때. 특히 Medium/High 등급 작업 |
| **planner** | Claude Code 기본 **Plan Mode** | High 등급 작업, 또는 사용자 승인이 필요한 변경 범위/리스크 분석 |
| **reviewer** | `toon-reviewer` 서브에이전트 | 구현 완료 후, 배포 전 자가검증 단계에서 (`.claude/guides/recipe-ota-deploy.md`, `recipe-new-feature.md`의 검증 단계를 대체) |

researcher와 reviewer 정의는 `.claude/agents/toon-researcher.md`, `.claude/agents/toon-reviewer.md` 참고.

---

## 로그 / 추적성

- **자동 로그** (`.claude/logs/agent-activity.jsonl`, gitignore 대상) — hooks로 자동 기록되는 raw 도구 사용 로그
  (어떤 파일에 어떤 도구가 언제 실행됐는지). 재연성 확인·디버깅용, 커밋하지 않음.
- **트러블슈팅 로그 (Part 4, 이 문서 하단)** — 사람이 정제해서 쓰는 지식 베이스. 증상/원인/해결 방법 위주로 기록, 커밋 대상.
- 자동 로그는 "무슨 일이 있었는지"의 원본 기록, Part 4는 "무엇을 배웠는지"의 요약. 둘은 서로 대체하지 않음.

---

## 금지 행동 (절대 하지 말 것)

- API 키, 환경변수를 코드에 직접 하드코딩
- 동일 로직을 두 파일에 따로 작성하거나 복붙
- 자가검증 없이 OTA 배포 실행
- `check-service.js` / `matchingUtils.js` 수정 후 테스트 케이스 추가 없이 배포

---

## 디렉토리 역할 요약

```
AGENTS.md          ← 이 파일: 태스크 라우팅 + 공통 원칙 + 거버넌스 실증 + OCR 구현기록 + 트러블슈팅 로그
CLAUDE.md          ← 핵심 업무 지시서 (기술 스택, 데이터 모델, 기능 명세)
README.md          ← 사람이 보는 프로젝트 소개

.claude/
├── agents/        ← 서브에이전트 정의 (toon-researcher, toon-reviewer)
├── guides/        ← 태스크 참조 문서 전체, 파일명 접두사로 성격 구분
│   ├── skill-*    ← 특정 도메인에서 어떻게 생각할지
│   ├── doc-*      ← 무엇을 좋은 코드/구조로 볼지 (레퍼런스)
│   ├── template-* ← 구현 전에 무엇을 정의할지 (빈칸 채우기)
│   └── recipe-*   ← 반복 작업을 어떤 순서로 할지 (체크리스트)
├── logs/          ← 자동 활동 로그 (gitignore)
└── settings.json  ← 훅 설정

scripts/
├── check-toons.js        ← 서버 배치 (GitHub Actions)
└── test-check-toons.js   ← 에피소드 감지 테스트
```

---

# Part 2 — AI 개발 거버넌스 체계 — 구축과 실증

### 배경

1인 개발로 진행하는 프로젝트에서 Claude Code를 개발 파트너로 쓰면서, "AI가 뭘 했는지 / 제대로 했는지"를 매번 사람이 확인하기 어렵다는 문제가 있었다. 특히 되돌리기 어려운 변경(핵심 매칭 로직, DB 스키마, 배포)을 AI가 혼자 판단해 진행하는 건 위험 부담이 크다. 이를 절차화하기 위해 세 가지 장치를 만들었다.

### 구조 — 3가지 장치

| 장치 | 내용 |
|---|---|
| **리스크 기반 승인 게이트** | High(`matchingUtils.js`, DB 스키마, 배포 설정)는 Plan Mode 승인 필수 · Medium(서비스 레이어)은 템플릿 요약 확인 · Low(UI 문구)는 바로 진행. 배포는 크기 무관 항상 High |
| **역할 분리 에이전트** | 탐색(`toon-researcher`, 읽기전용) → 계획(Plan Mode) → 구현 → 검증(`toon-reviewer`, 읽기전용). 구현자가 스스로를 검증하지 않도록 분리. 두 에이전트 모두 Edit/Write 도구 자체가 없어 코드 수정 불가 |
| **추적성 로그** | Edit/Write/Bash마다 훅이 `.claude/logs/agent-activity.jsonl`에 자동 기록. 사람이 정제하는 Part 4 트러블슈팅 로그(지식 축적)와는 역할이 다름 — 로그는 절차 준수 여부의 원본 증거 |

### 실증 — 실제 버그픽스 1건으로 전 구간 실행 (n=1)

세 장치를 만든 시점엔 실사용 데이터가 0건이었다. 검증을 위해 High 등급 파일 `matchingUtils.js`에서 실존하던 버그(영문 혼용 시리즈명 + 대소문자 불일치로 새 화수 미감지)를 골라 전체 흐름을 완주했다.

**측정된 결과**

- **게이트 준수**: 계획 승인(`12:54:48Z`) → 첫 Edit(`12:56:45Z`), 간격 117초, 승인 전 편집 0건
- **리뷰어가 실제로 잡음**: 1차 검증에서 `episode-detection.md` 문서 미동기화 지적 — 계획서엔 0회 언급된 항목(grep 확인), 계획 단계 빈틈을 검증 단계가 발견한 사례
- **버그 수정 대조 검증**: 수정 전 코드로 되돌려 테스트하면 5개 케이스 실패, 복구 후 27/27 통과 — 테스트가 실제로 버그를 잡는다는 것을 직접 확인
- **완주**: 리스크 판단 → 탐색 → 계획 승인 → 구현 → 테스트 27/27 → 리뷰 2회(1차 보완 필요 → 반영 → 2차 "배포 가능") → TROUBLESHOOTING #18 기록 → 문서 동기화 → `eas update` 실배포 → 커밋 2건 → push까지 전 구간 완료

**비용 (서브에이전트 4건, 실측)**

| 단계 | 소요시간 | 토큰 |
|---|---|---|
| 탐색(Explore) | 68.7초 | 미기록 |
| 계획(Plan) | 225.2초 | 미기록 |
| 검증 1차 | 98.3초 | 37,353 |
| 검증 2차 | 122.2초 | 40,304 |
| **합계** | **약 8분 34초** | **77,657 (측정된 2건 기준)** |

실제 코드 변경은 함수 3개 + 테스트 11개 + 문서 4곳 — 이 규모 대비 오버헤드가 작지 않다.

### 한계 (n=1)

- 표본 1건 — 재현성은 아직 증명되지 않음
- 게이트가 실제로 위험한 변경을 **막은** 사례는 아직 0건. 지금까지 확인된 건 "감사 가능성"과 "리뷰가 계획의 빈틈 1개를 잡음"이지 "사고 예방"이 아님
- 거버넌스 없이 같은 작업을 했을 때와 비교할 대조군이 없어 오버헤드 증가율(%)은 계산하지 않음 — 위 수치는 절대값
- 과거 트러블슈팅 18건 중 약 11건(61%)이 이런 리뷰로 배포 전에 잡혔을 개연성이 있다고 판단했으나, 이는 근사 분류이지 실증은 아님

---

# Part 3 — 이미지 OCR 에피소드 감지 기능 구현 기록

### 1. 프로젝트 배경

**인스타툰 알림 앱**은 인스타그램에서 활동하는 웹툰 작가(@username)의 새 게시물을 주기적으로 확인해, 새 에피소드가 올라오면 푸시 알림을 보내주는 앱이다.

```
[앱 흐름]
사용자가 작가 계정 등록
    → 앱이 1시간마다 인스타그램 포스트 조회 (GitHub Actions 배치)
    → 새 에피소드 감지
    → 푸시 알림 발송
```

---

### 2. 문제 정의

#### 기존 방식의 한계

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

### 3. 해결 방안 검토

| 방법                                  | 설명                             | 비용              | 난이도                  |
| ------------------------------------- | -------------------------------- | ----------------- | ----------------------- |
| **방법 1** OCR (ML Kit)               | 온디바이스 텍스트 인식           | 무료              | 중 (네이티브 빌드 필요) |
| **방법 2** OCR (OCR.space API)        | 클라우드 REST API                | 무료 플랜 있음    | 하                      |
| **방법 3** AI 이미지 분석             | Claude/GPT-4o에 이미지 전송      | API 호출마다 비용 | 하                      |
| **방법 4** 포스트 ID 비교             | 화수 포기, 새 포스트 여부만 감지 | 무료              | 하                      |
| **방법 5** 캡션 + OCR + ID 하이브리드 | 1→2→3 순서로 순차 시도           | 무료              | 중                      |

#### 선택: 방법 5 (하이브리드) + OCR.space

- OCR 엔진은 **ML Kit 대신 OCR.space REST API** 채택
  - ML Kit은 네이티브 빌드(expo prebuild) 필요 → Expo Go 실행 불가
  - OCR.space는 HTTP 요청만으로 동작 → Expo Go에서 즉시 테스트 가능
- 기존 캡션 방식 유지 → 성능 손실 없음
- 캡션 실패 시에만 OCR 시도 → 불필요한 처리 최소화
- OCR도 실패하면 포스트 ID로 새 게시물 감지 → 놓치는 경우 없음

---

### 4. 구현 흐름

#### 변경 전

```
checkToon()
├─ 포스트 조회
├─ 시리즈 키워드가 캡션에 있는지 확인
├─ 캡션에서 화수 추출 (regex)
│   └─ 실패하면 → skip (놓침 ❌)
└─ 새 화수면 알림 발송
```

#### 변경 후

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

### 5. 수정된 파일 목록

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

### 6. 파일별 상세 설명

#### 6-1. `src/services/ocr-service.js`

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

#### 6-2. `src/hooks/useKeywordDetector.js`

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

#### 6-3. `src/services/toon-service.js` — `checkToon()` 핵심 로직

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

### 7. 필요한 설정

#### `config.js`에 키 추가

```js
export const OCR_SPACE_KEY = "여기에_OCR_SPACE_API_키_입력";
```

OCR.space 무료 키 발급: https://ocr.space/ocrapi/freekey

---

### 8. 테스트 방법

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

### 9. 감지 시나리오별 동작 정리

| 시나리오             | 캡션           | 이미지      | 결과                          |
| -------------------- | -------------- | ----------- | ----------------------------- |
| 텍스트에 화수 있음   | "47화 업로드!" | -           | 1단계 캡션에서 바로 감지 ✅   |
| 이미지에만 화수 있음 | "업로드!"      | "47화" 그림 | 2단계 OCR로 감지 ✅           |
| 화수 표기 없음       | "안녕하세요"   | 그림만      | 3단계 포스트 ID로 감지 ✅     |
| 완결 표기            | "완결입니다"   | "완" 그림   | 완결 감지 → 가상 화수 부여 ✅ |
| 완전히 동일한 포스트 | (동일)         | (동일)      | 알림 없음 (정상) ✅           |

---

# Part 4 — 트러블슈팅 로그

> 발생한 문제와 해결 방법을 기록합니다.
> 새 문제가 해결될 때마다 여기에 추가합니다.

---

### #1 — GitHub Actions에서 Supabase WebSocket 오류

**날짜:** 2026-05-27

**에러 메시지:**
```
Error: Node.js 20 detected without native WebSocket support.
Suggested solution: For Node.js < 22, install "ws" package and provide it via the transport option
Node.js v20.20.2
```

**원인:**

Supabase 클라이언트 초기화 시 `getWebSocketConstructor()`가 `globalThis.WebSocket`을 확인하는데,
Node.js 20에는 네이티브 WebSocket이 없어서 초기화 단계에서 바로 에러를 던짐.

처음에 시도한 `realtime: { transport: ws }` 옵션은 실제 연결 단계에서 쓰이는 옵션이라,
초기화 단계에서 터지는 이 에러를 막지 못함.

**해결 방법:**

`createClient()` 호출 전에 `globalThis.WebSocket`을 직접 주입.

```js
// scripts/check-toons.js
if (!globalThis.WebSocket) globalThis.WebSocket = require('ws');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
```

워크플로우에서 `ws` 패키지 설치도 필요:
```yaml
run: npm install --no-save @supabase/supabase-js ws node-fetch
```

---

### #2 — 툰 등록 직후 새로고침 시 새 에피소드 미감지

**날짜:** 2026-05-27

**증상:**

툰을 등록하고 바로 당겨서 새로고침하면, 실제로 `lastEpisode`보다 높은 화수가 올라와 있어도 "새 에피소드 없음"으로 표시됨.

**원인:**

`checkToon()`에 첫 체크 조기 종료 블록이 있었음.

```js
// 문제 코드
if (!toon.lastPostId && posts.length > 0) {
  await updateToon(toon.id, { lastPostId: posts[0].id });
  return { found: false };  // 화수 비교도 안 하고 바로 종료
}
```

툰 등록 직후엔 `lastPostId`가 `null`이므로 이 블록이 실행되어 화수 비교 로직 전체를 건너뜀.
원래 의도는 "첫 체크에서 알림을 보내지 않기"였으나, 결과적으로 이미 나와 있는 새 화수도 감지 못하는 문제가 생김.

**해결 방법:**

1. 첫 체크 조기 종료 블록 제거 → 화수 비교 로직 항상 실행
2. `isNewPost`(포스트 ID 비교) 조건에 `toon.lastPostId &&` 추가 → 첫 체크에서 화수 없는 포스트 오탐 방지
3. 루프 종료 후 새 화수가 없을 때만 `lastPostId` 기준점 저장

```js
// toon-service.js — isNewPost 조건
const isNewPost = ep === null && post.id && toon.lastPostId && post.id !== toon.lastPostId;

// 루프 종료 후
if (posts.length > 0 && !toon.lastPostId) {
  await updateToon(toon.id, { lastPostId: posts[0].id });
}
return { found: false };
```

---

### #3 — EAS 빌드 시 config.js 파일 없음 + Supabase 미연결 오류

**날짜:** 2026-05-27

**에러 메시지 (1단계):**
```
None of these files exist:
  * config(.android.ts|.native.ts|.ts|.android.js|.native.js|.js)
```

`src/services/supabase.js` 3번 줄: `import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../config';`

**원인:**

`config.js`가 `.gitignore`에 포함되어 있었음. EAS 빌드 서버는 로컬 파일시스템을 아카이브해서 올리지만, gitignore된 파일은 Metro가 찾지 못해 빌드 실패.

---

**에러 메시지 (2단계) — 빌드는 되는데 Supabase에 데이터가 안 들어감**

빌드 성공 후 앱 실행 시 Supabase에 아무 데이터도 저장되지 않음. 로컬(`npx expo start`)에서는 정상 동작.

**원인:**

`app.json`과 `app.config.js`가 동시에 존재할 때 EAS가 `app.json`을 우선 읽는 경우가 있음.
`app.json`에는 env var 주입 로직이 없어서 `extra`의 API 키가 `undefined`로 빌드됨.

또한 `app.config.js → extra → Constants.expoConfig.extra` 체인 자체가 EAS 빌드 환경에서 불안정함.

---

**최종 해결 방법:**

`EXPO_PUBLIC_` 접두사 변수를 사용. Metro가 빌드 시 해당 변수를 번들에 직접 인라인 치환하므로 중간 체인 없이 확실하게 동작함.

**1. `app.json` 삭제 — `app.config.js`로 단일화**

두 파일 공존 시 충돌 방지.

**2. EAS env vars 등록** (`EXPO_PUBLIC_` 접두사, `sensitive` visibility)
```bash
npx eas env:create --environment preview --name EXPO_PUBLIC_HASDATA_KEY --value "..." --visibility sensitive
npx eas env:create --environment preview --name EXPO_PUBLIC_OCR_SPACE_KEY --value "..." --visibility sensitive
npx eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value "..." --visibility sensitive
npx eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "..." --visibility sensitive
```

**3. `config.js` 수정 — `process.env.EXPO_PUBLIC_*`로 직접 읽기**

```js
// config.js (git에 커밋 가능, 실제 키 없음)
export const HASDATA_KEY = process.env.EXPO_PUBLIC_HASDATA_KEY;
export const OCR_SPACE_KEY = process.env.EXPO_PUBLIC_OCR_SPACE_KEY;
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
```

**4. `.env.local` 생성 — 로컬 개발용 실제 키 (gitignored)**

```
# .env.local (.env*.local 패턴으로 gitignore됨)
EXPO_PUBLIC_HASDATA_KEY=...
EXPO_PUBLIC_OCR_SPACE_KEY=...
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

**키 흐름 요약:**
- 로컬 개발: `.env.local` → Metro 인라인 치환 → `process.env.EXPO_PUBLIC_*`
- EAS 빌드: EAS Secrets → Metro 인라인 치환 → `process.env.EXPO_PUBLIC_*`

---

**에러 메시지 (3단계) — push_tokens에 데이터가 안 들어감**

`toons` 테이블에는 데이터가 들어가지만 `push_tokens`에는 아무것도 저장되지 않음.

**원인:**

Android 릴리즈 APK(Hermes 엔진)에서 `getExpoPushTokenAsync()`가 실패함.
Expo 푸시 토큰 발급 과정에서 기기가 먼저 FCM(Firebase Cloud Messaging)에 등록되어야 하는데,
`google-services.json` 없이 빌드된 APK는 FCM 등록을 못 함.

Expo Go에서 동작하는 이유: Expo Go 앱 자체에 Firebase 설정이 내장되어 있어서 공유 사용.

```
Expo 푸시 토큰 발급 흐름:
기기 → FCM 등록 (google-services.json 필요) → Expo 서버 → ExponentPushToken[...]
```

**해결 방법:**

1. Firebase 콘솔에서 프로젝트 생성 → Android 앱 추가 (패키지명: `com.anonymous.toonnotifierapp`)
2. `google-services.json` 다운로드 → 프로젝트 루트에 배치
3. `app.config.js`에 경로 등록:

```js
android: {
  // ...
  googleServicesFile: "./google-services.json",
},
```

4. `google-services.json`은 앱 식별자만 포함하므로 git 커밋 가능 (보안은 Firebase Security Rules 담당)

---

### #4 — 알림 탭 후 앱 진입 시 툰 체크가 다시 돌아가는 문제

**날짜:** 2026-07-08

**증상:**

푸시 알림을 탭해서 앱에 들어오면, 방금 GitHub Actions가 체크를 돌린 직후인데도 앱이 또 다시 Instagram API를 호출함. 서버 부하 + 데이터 충돌 우려.

**원인 추적 과정 (3단계):**

처음엔 `AppState` 리스너가 포그라운드 복귀 시 `syncAndFill()`을 호출해서라고 생각했음. 제거했지만 여전히 발생.

그 다음엔 `init()` 자체에서 `syncFromSupabase()` → `fillMissingUnreadPosts()` → Instagram API 호출 체인이 있었음. `init()`에서 네트워크 호출 전부 제거.

그래도 계속 발생. `checkToon`에 `console.trace()`를 심어서 콜 스택을 직접 출력함:

```
[checkToon] 호출 스택
  at checkToon (toon-service.js)
  at AddToonModal.handleSave (AddToonModal.js)   ← 범인
```

**실제 원인:**

`AddToonModal.handleSave`에서 툰 저장 후 백그라운드로 `checkToon`을 실행하는 코드가 있었음.

```js
// 문제 코드 (AddToonModal.js)
const newToon = await addToon({ ... });
checkToon(newToon).then(() => onUpdate?.()).catch(() => {});  // ← 이게 범인
onAdded();
```

알림을 탭해서 앱에 들어왔을 때 마지막으로 등록된 툰의 `checkToon`이 타이밍상 겹쳐서 실행되던 것.

**해결 방법:**

`AddToonModal.handleSave`에서 `checkToon` 호출 제거. 툰 추가 직후 자동 체크 없앰. 체크는 수동 새로고침(당겨서 갱신)에서만.

```js
// 수정 후
await addToon({ ... });
onAdded();
```

**교훈:**

"어디서 호출하는지 모르겠다" 싶으면 `console.trace()` 먼저. 추측보다 스택 트레이스가 빠름.

---

### #5 — 카드 탭 시 카드가 사라지는 버그 (Swipeable + 중첩 TouchableOpacity 충돌)

**날짜:** 2026-07-08

**증상:**

리스트에서 툰 카드를 탭하면 카드가 사라짐. 특히 에피소드 행을 탭했을 때 카드 자체가 접히면서 섹션까지 이동해버려 "삭제된 것처럼" 보임.

**원인:**

카드 전체가 `TouchableOpacity` (onPress = toggleExpand) 안에 있었고, 에피소드 행도 `TouchableOpacity` (onPress = handleEpisodeTap)로 그 안에 중첩되어 있었음.

```jsx
// 문제 구조
<TouchableOpacity onPress={toggleExpand}>        {/* 카드 전체 */}
  <View style={st.header}> ... </View>
  {expanded && (
    <View>
      <TouchableOpacity onPress={handleEpisodeTap}>  {/* 에피소드 행 */}
      ...
    </View>
  )}
</TouchableOpacity>
```

React Native에서 일반적으로는 내부 TouchableOpacity가 이벤트를 흡수해야 하지만, `react-native-gesture-handler`의 `Swipeable` 안에서는 제스처 시스템이 달라서 두 핸들러가 모두 발동됨.

결과: 에피소드 탭 → `handleEpisodeTap` (에피소드 열기 + 읽음 처리) + `toggleExpand` (카드 접힘) 동시 발동 → 카드가 접히고 + 섹션 이동 → 사라진 것처럼 보임.

**해결 방법:**

카드 전체를 감싸는 `TouchableOpacity`를 `View`로 교체하고, `TouchableOpacity`는 헤더 행에만 적용.

```jsx
// 수정 후
<View style={st.cardContainer}>                  {/* 카드 전체는 View */}
  <TouchableOpacity onPress={toggleExpand}>      {/* 헤더만 TouchableOpacity */}
    <View style={st.header}> ... </View>
  </TouchableOpacity>
  {expanded && (
    <View>
      <TouchableOpacity onPress={handleEpisodeTap}>  {/* 에피소드 행 — 이제 충돌 없음 */}
      ...
    </View>
  )}
</View>
```

에피소드 목록이 toggleExpand의 터치 영역 바깥에 있으므로 두 핸들러가 동시에 발동할 일이 없음.

---

### #6 — 에피소드 탭 시 해당 화수가 목록에서 사라지는 버그

**날짜:** 2026-07-08

**증상:**

에피소드 목록에서 3화를 탭하면 3화가 사라짐. 4화를 탭하면 4화도 사라짐. 단, 툰 등록 시 입력한 기준 화수는 사라지지 않음.

**원인:**

`allEpisodes()`는 `episodeHistory`와 `unreadPosts`를 합산해서 보여줌.

```
episodeHistory: [5화]          ← 등록 시 입력한 기준 화수
unreadPosts:    [6화, 7화, 8화] ← 서버가 감지한 새 에피소드
```

에피소드를 탭하면 `handleEpisodeTap` → `advanceEpisode`가 호출됨.

```js
// advanceEpisode 내부 (수정 전)
t.readEpisode = episode;
t.unreadPosts = remainingPosts;  // 탭한 화수보다 큰 것만 남김 → 탭한 화수는 삭제
```

7화를 탭하면:
- `remainingPosts = unreadPosts.filter(p => p.episode > 7)` = [8화]
- `unreadPosts`가 [8화]로 교체됨 → 6화·7화 소멸
- `episodeHistory`는 여전히 [5화]만
- `allEpisodes()` 결과: [5화, 8화] → **6화·7화가 증발**

기준 화수(5화)만 안 사라지는 이유: `episodeHistory`에 저장되어 있어서.

**해결 방법:**

`advanceEpisode`에서 읽은 화수들을 `unreadPosts`에서 제거하는 게 아니라 `episodeHistory`로 이동.

```js
// 수정 후
const nowRead = (t.unreadPosts || []).filter((p) => p.episode !== null && p.episode <= episode);
const historyMap = {};
for (const h of (t.episodeHistory || [])) historyMap[h.episode] = h;
for (const ep of nowRead) {
  if (!(ep.episode in historyMap)) historyMap[ep.episode] = { episode: ep.episode, url: ep.url };
}
t.episodeHistory = Object.values(historyMap).sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0));

t.readEpisode = episode;
t.unreadPosts = remainingPosts;
```

이제 7화를 탭하면:
- 6화·7화 → `episodeHistory`로 이동 (회색 "읽음" 표시)
- 8화 → `unreadPosts`에 남음 (오렌지 "안읽음" 표시)
- `allEpisodes()` 결과: [5화, 6화, 7화, 8화] 전부 표시됨

---

### #7 — 완결 알림은 오는데 카드에는 완결 배지가 안 뜨는 문제

**날짜:** 2026-07-08

**증상:**

GitHub Actions가 완결 화수를 감지해서 "OO이 완결됐어요!" 알림은 정상 수신. 그런데 앱 카드에는 "완결" 배지가 뜨지 않고 "새 에피소드"로만 표시됨.

**원인:**

서버(`check-toons.js`)가 푸시 알림 payload를 만들 때 `isComplete`를 포함하지 않았음.

```js
// 문제 코드 (check-toons.js)
const updates = results.map((r) => ({
  toonId: r.toonId,
  unreadPosts: r.unreadPosts,
  // isComplete 없음!
}));
```

그리고 클라이언트(`applyNotificationUpdates`)도 `isComplete`를 읽지 않았음.

```js
// 문제 코드 (toon-service.js)
for (const { toonId, unreadPosts } of updates) {  // isComplete 구조분해 없음
  t.hasNewEpisode = true;
  t.unreadPosts = unreadPosts;
  // isComplete 반영 안 됨
}
```

추가로 `syncFromSupabase`도 `is_complete` 컬럼을 SELECT하지 않아서 수동 새로고침해도 반영 안 됨.

**해결 방법:**

세 곳 수정:

```js
// 1. check-toons.js — payload에 isComplete 추가
const updates = results.map((r) => ({
  toonId: r.toonId,
  unreadPosts: r.unreadPosts,
  isComplete: r.isComplete ?? false,  // ← 추가
}));

// 2. toon-service.js applyNotificationUpdates — isComplete 반영
for (const { toonId, unreadPosts, isComplete } of updates) {
  t.hasNewEpisode = true;
  t.unreadPosts = unreadPosts;
  if (isComplete) t.isComplete = true;  // ← 추가
}

// 3. toon-service.js syncFromSupabase — is_complete 컬럼 SELECT 추가
.select('id, has_new_episode, last_episode, last_post_url, unread_posts, is_complete, updated_at')
// + 루프 내에서 적용
if (remote.is_complete && !local.isComplete) {
  local.isComplete = true;
  changed = true;
}
```

---

### #8 — captionIsComplete 오탐: 다른 시리즈 완결 포스트 감지

**날짜:** 2026-07-21

**증상:**

전혀 다른 시리즈의 완결 포스트가 현재 시리즈의 새 에피소드로 감지됨. 관계없는 툰에 새 화수 알림이 오는 오탐.

**원인:**

`captionMatched` 조건에서 `captionIsComplete`가 시리즈 키워드 확인을 완전히 우회했음.

```js
// 문제 코드
const captionMatched = captionIsComplete || keyWords.some((w) => caption.includes(w));
// captionIsComplete=true이면 시리즈명 확인 없이 바로 통과
```

**해결 방법:**

`captionIsComplete`도 반드시 시리즈 키워드(`hasAnySeriesWord`)가 함께 있어야 통과하도록 수정.

```js
const hasAnySeriesWord = allWords.some((w) => caption.includes(w));
const captionMatched =
  (captionIsComplete && hasAnySeriesWord) || matchCount >= minMatch;
```

---

### #9 — ATS 오류: 온디바이스 OCR 이미지 다운로드 실패

**날짜:** 2026-07-21

**에러 메시지:**
```
URLSessionTask failed with error: The resource could not be loaded because 
the App Transport Security policy requires the use of a secure connection.
```

**원인:**

`NSAllowsArbitraryLoads`가 `false`로 설정되어 있어 Instagram CDN 이미지 URL에서 HTTP 요청이 차단됨. ML Kit 온디바이스 OCR은 이미지를 로컬에 다운로드한 후 처리하는데, 이 다운로드 단계에서 ATS 정책에 걸림.

**해결 방법:**

`ios/Toonify/Info.plist`에서 `NSAllowsArbitraryLoads`를 `true`로 변경.

```xml
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsArbitraryLoads</key>
  <true/>
  <key>NSAllowsLocalNetworking</key>
  <true/>
</dict>
```

네이티브 파일 변경이므로 새 빌드 필요.

---

### #10 — 앱 OCR 엔진 교체: ML Kit 온디바이스 → ocr.space API

**날짜:** 2026-08-03

**배경:**

ML Kit 온디바이스 OCR을 도입했으나 인스타툰 썸네일의 아트체/손글씨 폰트에서 인식률이 낮아 실용성 부족. 이미지 전처리(1080px 리사이즈), 신뢰도 필터링 등 개선을 시도했으나 근본적 한계 확인.

**해결 방법:**

서버(GitHub Actions)에서 이미 사용 중인 ocr.space API를 앱에도 적용.

- 무료 티어: 월 25,000회 (등록 후)
- OTA 배포 가능 (네이티브 모듈 불필요)
- 기존 ML Kit 패키지는 바이너리에 잔류 → 다음 빌드 시 `npm uninstall` 후 제거 예정

```js
// src/services/ocr-service.js
const params = new URLSearchParams({
  url: imageUrl,
  language: 'kor',
  isOverlayRequired: 'false',
  detectOrientation: 'true',
  scale: 'true',
  OCREngine: '2',
});
const res = await fetch(`https://api.ocr.space/parse/imageurl?${params}`, {
  headers: { apikey: OCR_SPACE_KEY },
});
```

---

### #11 — ocrMatched 완결 단독 통과 오탐

**날짜:** 2026-08-03

**증상:**

`[checkToon] ep=6 isComplete=true isNewEpisode=true` — 새 화가 아닌데 새로운 화로 인식됨.

**원인:**

`ocrMatched` 조건에서 `isCompleteEpisode(ocrText)` 단독으로 통과 가능했음. 이미지 어딘가에 "완결" 글자만 있어도 OCR 매칭을 통과하고, `ep=null`이면 `runningMaxEp+1`로 가상 화수가 배정됨.

```js
// 문제 코드
const ocrMatched =
  allWords.some((w) => ocrText.includes(w)) || isCompleteEpisode(ocrText);
//                                           ↑ 시리즈 키워드 없어도 통과
```

**해결 방법:**

`isCompleteEpisode` 단독 조건 제거. 시리즈 키워드 매칭만으로 판단.

```js
const ocrMatched = allWords.some((w) => ocrText.includes(w));
```

---

### #12 — minMatch=0 오탐: keyWords 비어있을 때 모든 캡션 매칭

**날짜:** 2026-08-03

**증상:**

`⚠️ minMatch=0 오탐가능(keyWords 비었음)` 로그 출력 후 captionMatched=true. 관계없는 포스트가 시리즈 포스트로 인식됨.

**원인:**

`seriesName`의 모든 단어가 2글자 미만이면 `keyWords=[]`, `minMatch=Math.min(2,0)=0`. 결과적으로 `matchCount(0) >= minMatch(0)` → 모든 캡션이 매칭됨.

```js
// 문제 코드
const captionMatched =
  (captionIsComplete && hasAnySeriesWord) || matchCount >= minMatch;
// keyWords=[], minMatch=0 → 0 >= 0 → 항상 true
```

**해결 방법:**

`keyWords.length > 0` 가드 추가.

```js
const captionMatched =
  keyWords.length > 0 && matchCount >= minMatch;
```

---

### #13 — 완결+시리즈단어 1개 오탐

**날짜:** 2026-08-03

**증상:**

시리즈명에 "완"이 포함된 경우, 다른 시리즈 완결 포스트가 `완결+시리즈단어` 조건으로 통과됨.

**원인:**

완결 감지 시 `hasAnySeriesWord`(1개)만 있으면 `captionMatched=true`가 되어 일반 키워드 매칭보다 훨씬 느슨하게 동작.

```js
// 문제 코드
const captionMatched =
  keyWords.length > 0 &&
  ((captionIsComplete && hasAnySeriesWord) || matchCount >= minMatch);
// 완결이면 1개만 매칭돼도 통과
```

**해결 방법:**

완결이든 아니든 `minMatch` 기준 동일 적용. `hasAnySeriesWord` 분기 제거.

```js
const captionMatched = keyWords.length > 0 && matchCount >= minMatch;
// isCompleteEpisode는 캡션 매칭과 별개로 완결 여부 판단에만 활용
```

---

### #14 — OCR/캡션 매칭 기준 불균형으로 OCR이 우회 경로가 되는 문제

**날짜:** 2026-08-03

**증상:**

캡션에서 키워드 2개 필요로 막힌 포스트가 OCR에서는 1개만 있어도 통과됨. 같은 화로 반복 인식되는 오탐 발생.

**원인:**

캡션과 OCR의 매칭 기준이 달랐음.
- 캡션: `keyWords` 중 `minMatch`(2)개 필요
- OCR: `allWords` 중 1개만 있으면 통과 — 더 넓은 단어 목록 + 더 낮은 임계값

```js
// 문제 코드 — OCR이 더 느슨
const ocrMatched = allWords.some((w) => ocrText.includes(w));
```

**해결 방법:**

OCR도 캡션과 동일한 `keyWords` + `minMatch` 기준 적용. 단, OCR 결과는 토큰 분리 없이 `includes`로 검사 (조사 붙은 한국어 대응).

```js
const ocrMatchedWords = keyWords.filter((w) => ocrText.includes(w));
const ocrMatched = ocrMatchedWords.length >= minMatch;
```

---

### #15 — buildUnreadPosts가 checkToon보다 느슨한 기준으로 에피소드 추가

**날짜:** 2026-08-03

**증상:**

"3편까지 나옴" 알림이 왔는데 앱 에피소드 목록에는 5편까지 추가되어 있음. 감지된 화수와 목록에 표시되는 화수가 불일치.

**원인:**

`checkToon`은 엄격한 `keyWords + minMatch` 기준으로 3편만 감지했지만, 에피소드 목록을 만드는 `buildUnreadPosts`는 수정되지 않은 느슨한 조건(`captionIsComplete || allWords.some(...)`)을 그대로 사용해서 더 많은 포스트를 매칭함.

```js
// buildUnreadPosts 문제 코드
const matched = captionIsComplete || allWords.some((w) => cap.includes(w));
// 완결 단독 통과 + 1개 단어 substring 매칭
```

**해결 방법:**

`buildUnreadPosts`도 `checkToon`과 동일한 `keyWords + minMatch` 토큰 매칭 기준 적용.

---

### #17 — ToonCard 불필요한 리렌더링

**날짜:** 2026-07-30

**증상:**

툰 목록을 당겨서 새로고침하면, 데이터가 바뀌지 않은 카드도 전부 리렌더링됨. 툰이 많아질수록 새로고침이 느려질 수 있음.

**원인:**

`HomeScreen`이 새로고침 완료 후 `setToons(sorted)`로 상태를 갱신하면 React는 자식 컴포넌트를 전부 재렌더링함. `ToonCard`는 메모이제이션 없이 `export default function`으로 선언되어 있어, props로 받은 `toon` 객체 참조가 바뀌면 항상 리렌더됨.

또한 `ToonCard` 내부의 `allEpisodes()` 함수가 매 렌더마다 `episodeHistory`와 `unreadPosts`를 합산·정렬해 새 배열을 생성함 — 카드를 펼치거나 접을 때마다 재계산.

**측정 결과 (perf.js 도구로 직접 측정):**

```
개선 전: 새로고침 1회 → ToonCard 3회 렌더 (초기 + 상태 갱신 2회)
개선 후: 새로고침 n회 → ToonCard 총 1회 렌더 (초기 마운트만)
```

**해결 방법:**

1. **React.memo + updatedAt 비교자** — `toon.updatedAt`이 바뀌지 않으면 리렌더 건너뜀

```js
export default memo(ToonCard, (prev, next) => {
  return prev.toon.updatedAt === next.toon.updatedAt;
});
```

2. **useMemo로 에피소드 목록 메모이제이션** — `episodeHistory` / `unreadPosts`가 바뀔 때만 재계산

```js
const episodes = useMemo(() => {
  const map = {};
  for (const h of toon.episodeHistory || []) map[h.episode] = h;
  for (const p of toon.unreadPosts || []) {
    if (!map[p.episode]) map[p.episode] = p;
  }
  return Object.values(map).sort((a, b) => a.episode - b.episode);
}, [toon.episodeHistory, toon.unreadPosts]);
```

3. **perf.js 측정 코드 `__DEV__` 가드** — 프로덕션에서는 완전 비활성, 개발 모드에서만 동작. 코드는 남겨두고 나중에 재사용 가능.

```js
export function markStart(label) {
  if (!__DEV__) return;  // 프로덕션에서는 no-op
  marks[label] = performance.now();
}
```

---

### #16 — 앱·서버 매칭 로직 분리로 인한 버그 누적

**날짜:** 2026-08-03

**증상:**

앱(`check-service.js`)에서 수정한 매칭 버그들(#11~#14)이 서버(`check-toons.js`)에는 그대로 남아있음. 서버는 구버전 로직으로 계속 동작하여 앱과 다른 결과를 냄.

**원인:**

앱과 서버가 동일한 매칭 로직을 각각 따로 작성하고 있었음. 한 쪽을 수정해도 다른 쪽이 자동으로 반영되지 않아 지속적으로 불일치 발생.

**해결 방법:**

공통 매칭 로직을 `src/utils/matchingUtils.js`로 추출 (CommonJS). 앱과 서버 모두 이 파일을 참조.

```
src/utils/matchingUtils.js  ← 단일 진실 공급원
    ↓ import              ↓ require
check-service.js        check-toons.js
(앱)                    (서버)
```

```js
// src/utils/matchingUtils.js
function buildSeriesKeys(seriesName) { ... }  // keyWords, minMatch 추출
function captionMatches(keyWords, minMatch, caption) { ... }  // 토큰 매칭
function ocrMatches(keyWords, minMatch, text) { ... }  // 서브스트링 매칭
module.exports = { buildSeriesKeys, captionMatches, ocrMatches };
```

**교훈:**

같은 로직을 두 곳에 따로 작성하면 반드시 한 쪽이 뒤처진다. CLAUDE.md 규칙 8번으로 추가됨.

---

### #18 — 영문 혼용 시리즈명 대소문자 불일치로 새 화수 미감지

**날짜:** 2026-09-01

**증상:**

시리즈명에 영문/영숫자 단어가 섞인 툰(예: `ReLIFE`, `SSS급`)에서, 인스타 캡션이나 OCR 텍스트의 대소문자가 등록된 시리즈명과 다르면 화수가 실제로 올라와 있어도 감지되지 않음. 조용히 알림이 누락되는 버그 — 에러가 나지 않아서 로그 확인 전까지는 드러나지 않음.

**원인:**

`matchingUtils.js`의 핵심 매칭 3종 함수가 대소문자를 정규화하지 않고 있었음.

```js
// 문제 코드 (buildSeriesKeys) — keyWords가 원본 대소문자 그대로
const keyWords = words3up.length >= 1 ? words3up : [...];

// 문제 코드 (captionMatches) — 정확 일치, 대소문자 구분
const matched = keyWords.filter((w) => tokens.has(w));

// 문제 코드 (ocrMatches) — substring 포함, 대소문자 구분
const matched = keyWords.filter((w) => text.includes(w));
```

`extractEpisodeNumber`/`extractSeriesName`은 이미 정규식에 `/i` 플래그를 쓰고 있었는데, 정작 시리즈 키워드 자체를 비교하는 핵심 3개 함수만 이 처리가 빠져 있었음 — 파일 내부에서도 일관성이 깨져 있던 상태.

**해결 방법:**

세 함수 모두 비교 경계(comparison boundary)에서 `.toLowerCase()`로 정규화. `buildSeriesKeys`에서 `keyWords` 생성 시점에 소문자로 통일하고, `captionMatches`/`ocrMatches`에서도 비교 직전에 캡션/OCR 텍스트와 `keyWords` 양쪽 모두 소문자화(양쪽 다 정규화해야 한쪽만 정규화했을 때 매칭이 오히려 깨지는 것을 방지).

```js
// matchingUtils.js — buildSeriesKeys
const keyWords = (...).map((w) => w.toLowerCase());

// matchingUtils.js — captionMatches
const tokens = new Set(caption.toLowerCase().split(/\s+/).map(...));
const matched = keyWords.filter((w) => tokens.has(w.toLowerCase()));

// matchingUtils.js — ocrMatches
const lowerText = text.toLowerCase();
const matched = keyWords.filter((w) => lowerText.includes(w.toLowerCase()));
```

`buildSeriesKeys`가 반환하는 `allWords`(원본 대소문자 유지, `check-service.js`의 undetectable 배지 판정에서 사용)는 이번 수정 범위에서 의도적으로 제외 — 별도 이슈로 분리.

한글은 `toLowerCase()`에 영향받지 않으므로(대소문자 개념 없음) 기존 순수 한글 시리즈명은 동작 변화 없음 — `scripts/test-check-toons.js` 회귀 테스트(케이스 9~11, 27/27 통과)로 확인.

**알려진 후속 이슈 (이번 수정 범위 밖):**

`check-service.js`의 `anySeriesPost`(undetectable 배지 판정) 로직도 `allWords.some((w) => caption.includes(w))`로 같은 대소문자 문제를 가지고 있음. Medium 리스크 파일이라 별도 승인 절차로 처리 예정.

---
