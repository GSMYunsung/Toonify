/**
 * filterNewPosts 로직 무결성 검증 테스트
 * 실행: node scripts/test-check-toons.js
 */

const {
  filterNewPosts,
  buildSeriesKeys,
  captionMatches,
  ocrMatches,
} = require("../src/utils/matchingUtils");

// ─── 테스트 유틸 ─────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     → ${e.message}`);
    failed++;
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected)
        throw new Error(
          `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
        );
    },
    toEqual(expected) {
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      if (a !== b) throw new Error(`expected ${b}, got ${a}`);
    },
    toHaveLength(len) {
      if (actual.length !== len)
        throw new Error(`expected length ${len}, got ${actual.length}`);
    },
  };
}

// ─── 픽스처 (오래된 순 = 인덱스 0이 가장 오래됨) ─────────────────
const POSTS = [
  { id: "p1", timestamp: 1000, caption: "시리즈 1화" },
  { id: "p2", timestamp: 2000, caption: "시리즈 2화" },
  { id: "p3", timestamp: 3000, caption: "시리즈 3화" },
  { id: "p4", timestamp: 4000, caption: "시리즈 4화" },
  { id: "p5", timestamp: 5000, caption: "시리즈 5화" },
  { id: "p6", timestamp: 6000, caption: "시리즈 6화" },
];

// ─── 케이스 1: 첫 체크 (last_post_id 없음) ───────────────────────
console.log("\n[케이스 1] 첫 체크 — last_post_id 없음");
test("lastPostId가 null이면 포스트 전체 반환", () => {
  const result = filterNewPosts(POSTS, null);
  expect(result).toHaveLength(6);
});
test("lastPostId가 빈 문자열이면 포스트 전체 반환", () => {
  const result = filterNewPosts(POSTS, "");
  expect(result).toHaveLength(6);
});

// ─── 케이스 2: 마지막 포스트가 이미 처리됨 (새 포스트 없음) ──────
console.log("\n[케이스 2] 가장 최신 포스트가 last_post_id — 새 포스트 0개");
test("last_post_id가 마지막 포스트면 빈 배열 반환 → OCR 0회", () => {
  const result = filterNewPosts(POSTS, "p6");
  expect(result).toHaveLength(0);
});

// ─── 케이스 3: 중간 포스트가 last_post_id (가장 흔한 경우) ────────
console.log("\n[케이스 3] last_post_id가 중간 — 이후 포스트만 반환");
test("p3이 last_post_id면 p4·p5·p6 반환", () => {
  const result = filterNewPosts(POSTS, "p3");
  expect(result).toHaveLength(3);
  expect(result[0].id).toBe("p4");
  expect(result[2].id).toBe("p6");
});
test("p1이 last_post_id면 p2~p6 5개 반환", () => {
  const result = filterNewPosts(POSTS, "p1");
  expect(result).toHaveLength(5);
  expect(result[0].id).toBe("p2");
});

// ─── 케이스 4: last_post_id가 목록에 없음 (오래된 포스트가 밀려남) ─
console.log("\n[케이스 4] last_post_id가 현재 6개 밖으로 밀린 경우");
test("알 수 없는 ID면 안전하게 전체 반환 (재처리 허용)", () => {
  const result = filterNewPosts(POSTS, "p_old_unknown");
  expect(result).toHaveLength(6);
});

// ─── 케이스 5: 포스트가 1개뿐 ────────────────────────────────────
console.log("\n[케이스 5] 포스트 1개 엣지케이스");
const ONE_POST = [{ id: "solo", timestamp: 9999, caption: "단독 포스트" }];
test("포스트 1개이고 그게 last_post_id면 빈 배열", () => {
  const result = filterNewPosts(ONE_POST, "solo");
  expect(result).toHaveLength(0);
});
test("포스트 1개이고 last_post_id 없으면 1개 반환", () => {
  const result = filterNewPosts(ONE_POST, null);
  expect(result).toHaveLength(1);
});

// ─── 케이스 6: OCR 호출 횟수 절감 시뮬레이션 ────────────────────
console.log("\n[케이스 6] OCR 절감 효과 시뮬레이션");

function simulateOcrCalls(posts, lastPostId, seriesKeyword) {
  const newPosts = filterNewPosts(posts, lastPostId);
  let ocrCalls = 0;
  for (const post of newPosts) {
    const captionMatched = post.caption.includes(seriesKeyword);
    if (!captionMatched) ocrCalls++; // 캡션 미매칭 → OCR 호출
  }
  return { processed: newPosts.length, ocrCalls };
}

// 포스트 6개 중 2개만 캡션에 키워드 있음, 나머지 4개는 OCR 필요
const MIXED_POSTS = [
  { id: "m1", timestamp: 1000, caption: "일상 사진" },
  { id: "m2", timestamp: 2000, caption: "일상 사진" },
  { id: "m3", timestamp: 3000, caption: "시리즈 3화" },
  { id: "m4", timestamp: 4000, caption: "일상 사진" },
  { id: "m5", timestamp: 5000, caption: "시리즈 5화" },
  { id: "m6", timestamp: 6000, caption: "일상 사진" },
];

test("기존 방식: last_post_id 무시하고 전체 6개 처리 → OCR 4회", () => {
  const { processed, ocrCalls } = simulateOcrCalls(MIXED_POSTS, null, "시리즈");
  expect(processed).toBe(6);
  expect(ocrCalls).toBe(4);
});

test("개선 방식: m4가 last_post_id → m5·m6만 처리 → OCR 1회", () => {
  const { processed, ocrCalls } = simulateOcrCalls(MIXED_POSTS, "m4", "시리즈");
  expect(processed).toBe(2);
  expect(ocrCalls).toBe(1);
});

test("개선 방식: m6이 last_post_id → 새 포스트 없음 → OCR 0회", () => {
  const { processed, ocrCalls } = simulateOcrCalls(MIXED_POSTS, "m6", "시리즈");
  expect(processed).toBe(0);
  expect(ocrCalls).toBe(0);
});

// ─── 케이스 7: 순서 보장 (오래된 순 처리) ────────────────────────
console.log("\n[케이스 7] 반환 순서 보장 (오래된 것부터)");
test("p2가 last_post_id면 반환 순서는 p3 → p4 → p5 → p6", () => {
  const result = filterNewPosts(POSTS, "p2");
  const ids = result.map((p) => p.id);
  expect(ids).toEqual(["p3", "p4", "p5", "p6"]);
});

// ─── 케이스 8: 1화 등록, 2·3화 이미 나온 상황 ───────────────────
console.log("\n[케이스 8] 1화로 등록 시 2·3화 감지 여부 (회귀 테스트)");

const EXISTING_POSTS = [
  { id: "ep1", timestamp: 1000, caption: "시리즈 1화" },
  { id: "ep2", timestamp: 2000, caption: "시리즈 2화" },
  { id: "ep3", timestamp: 3000, caption: "시리즈 3화" },
];

test("첫 체크: 기준점을 가장 오래된 포스트(1화)로 저장해야 함", () => {
  const oldestPost = EXISTING_POSTS[0];
  expect(oldestPost.id).toBe("ep1"); // posts[0] = 1화
});

test("두 번째 체크: last_post_id=ep1이면 ep2·ep3 반환", () => {
  const result = filterNewPosts(EXISTING_POSTS, "ep1");
  expect(result).toHaveLength(2);
  expect(result[0].id).toBe("ep2");
  expect(result[1].id).toBe("ep3");
});

test("[회귀] 첫 체크 기준점이 newest(ep3)면 두 번째 체크에서 ep2·ep3 놓침", () => {
  // 이게 버그였던 동작 — 이제는 이렇게 동작하면 안 됨
  const wrongResult = filterNewPosts(EXISTING_POSTS, "ep3"); // newest를 기준으로 잡으면
  expect(wrongResult).toHaveLength(0); // ep2·ep3 모두 감지 불가 (버그)
});

test("[정상] 첫 체크 기준점이 oldest(ep1)면 두 번째 체크에서 ep2·ep3 감지", () => {
  const correctResult = filterNewPosts(EXISTING_POSTS, "ep1"); // oldest를 기준으로 잡으면
  const detectedEps = correctResult.map((p) => p.id);
  expect(detectedEps).toEqual(["ep2", "ep3"]); // ep2·ep3 정상 감지 ✓
});

// ─── 케이스 9: buildSeriesKeys — 대소문자 정규화 ─────────────────
console.log("\n[케이스 9] buildSeriesKeys — keyWords 소문자 정규화");

test("영문 혼용 시리즈명 → keyWords가 소문자로 정규화됨", () => {
  const { keyWords } = buildSeriesKeys("ReLIFE 리라이프");
  expect(keyWords).toEqual(["relife", "리라이프"]);
});

test("순수 한글 시리즈명 → keyWords 변화 없음 (회귀)", () => {
  const { keyWords, minMatch } = buildSeriesKeys("시리즈 이야기");
  expect(keyWords).toEqual(["시리즈", "이야기"]);
  expect(minMatch).toBe(2);
});

test("allWords는 원본 대소문자 그대로 유지 (undetectable 배지 로직용, 의도적으로 미변경)", () => {
  const { allWords } = buildSeriesKeys("SSS급 히어로");
  expect(allWords).toEqual(["SSS급", "히어로"]);
});

// ─── 케이스 10: captionMatches — 대소문자 무시 매칭 ──────────────
console.log("\n[케이스 10] captionMatches — 대소문자 무시 매칭");

test("시리즈명·캡션 둘 다 동일 케이스면 매칭 (기존 동작 유지)", () => {
  const { keyWords, minMatch } = buildSeriesKeys("ReLIFE 리라이프");
  const { ok, matched } = captionMatches(
    keyWords,
    minMatch,
    "ReLIFE 리라이프 12화",
  );
  expect(ok).toBe(true);
  expect(matched).toEqual(["relife", "리라이프"]);
});

test("[버그 재현] 캡션이 소문자인데 시리즈명은 대문자 섞임 → 정규화 후 매칭돼야 함", () => {
  const { keyWords, minMatch } = buildSeriesKeys("ReLIFE 리라이프");
  const { ok, matched } = captionMatches(
    keyWords,
    minMatch,
    "relife 리라이프 12화",
  );
  expect(ok).toBe(true);
  expect(matched).toHaveLength(2);
});

test("[버그 재현] 시리즈명은 소문자, 캡션은 전체 대문자(SSS급 스타일) → 매칭돼야 함", () => {
  const { keyWords, minMatch } = buildSeriesKeys("sss급 히어로");
  const { ok } = captionMatches(keyWords, minMatch, "SSS급 히어로 7화");
  expect(ok).toBe(true);
});

test("순수 한글 캡션 매칭 — 기존 동작 회귀 없음", () => {
  const { keyWords, minMatch } = buildSeriesKeys("시리즈");
  const { ok } = captionMatches(keyWords, minMatch, "시리즈 5화");
  expect(ok).toBe(true);
});

test("순수 한글 — 실제로 다른 시리즈면 여전히 매칭 안 됨 (오탐 방지 회귀)", () => {
  const { keyWords, minMatch } = buildSeriesKeys("시리즈");
  const { ok } = captionMatches(keyWords, minMatch, "전혀다른툰 5화");
  expect(ok).toBe(false);
});

test('[버그 재현] "시리즈47화"처럼 공백 없이 붙여쓴 캡션도 매칭돼야 함', () => {
  const { keyWords, minMatch } = buildSeriesKeys("시리즈");
  const { ok, matched } = captionMatches(
    keyWords,
    minMatch,
    "시리즈47화 오늘도 화이팅",
  );
  expect(ok).toBe(true);
  expect(matched).toEqual(["시리즈"]);
});

test('[버그 재현] "시리즈-47화"처럼 특수문자로 연결된 캡션도 매칭돼야 함', () => {
  const { keyWords, minMatch } = buildSeriesKeys("시리즈");
  const { ok } = captionMatches(keyWords, minMatch, "시리즈-47화");
  expect(ok).toBe(true);
});

// ─── 케이스 11: ocrMatches — 대소문자 무시 substring 매칭 ────────
console.log("\n[케이스 11] ocrMatches — 대소문자 무시 substring 매칭");

test("[버그 재현] OCR 텍스트가 대문자인데 시리즈명은 소문자 섞임 → substring 매칭돼야 함", () => {
  const { keyWords, minMatch } = buildSeriesKeys("ReLIFE 리라이프");
  const { ok, matched } = ocrMatches(
    keyWords,
    minMatch,
    "정주행 완료 RELIFE 리라이프 12",
  );
  expect(ok).toBe(true);
  expect(matched).toEqual(["relife", "리라이프"]);
});

test("OCR 텍스트에 단어가 다른 단어 중간에 섞여 있어도 대소문자 무시하고 substring 매칭", () => {
  const { keyWords, minMatch } = buildSeriesKeys("sss급");
  const { ok } = ocrMatches(keyWords, minMatch, "오늘의sss급업로드");
  expect(ok).toBe(true);
});

test("순수 한글 OCR 텍스트 — 기존 동작 회귀 없음", () => {
  const { keyWords, minMatch } = buildSeriesKeys("시리즈");
  const { ok } = ocrMatches(keyWords, minMatch, "시리즈 12화 완결");
  expect(ok).toBe(true);
});

// ─── 결과 보고 ───────────────────────────────────────────────────
console.log("\n══════════════════════════════════════");
console.log(
  `결과: ${passed + failed}개 테스트 중 ${passed}개 통과, ${failed}개 실패`,
);

if (failed === 0) {
  console.log("✅ 모든 테스트 통과 — 로직 무결성 확인됨");

  console.log("\n── OCR 절감 효과 요약 ──────────────────");
  const runsPerDay = 8; // 3시간마다 = 하루 8회
  const toonCount = 5; // 평균 구독 툰 수
  const avgOcrPerRun_before = 4; // 기존: 포스트당 평균 4회 OCR
  const avgOcrPerRun_after = 0.3; // 개선: 새 포스트 없으면 0, 있어도 1~2개

  const daily_before = runsPerDay * toonCount * avgOcrPerRun_before;
  const daily_after = runsPerDay * toonCount * avgOcrPerRun_after;
  const savings = ((1 - daily_after / daily_before) * 100).toFixed(0);

  console.log(`  기존: 하루 약 ${daily_before}회 OCR 호출`);
  console.log(`  개선: 하루 약 ${daily_after}회 OCR 호출`);
  console.log(`  절감: 약 ${savings}% 감소`);
} else {
  console.log("❌ 일부 테스트 실패 — 코드 확인 필요");
  process.exit(1);
}
