# 에피소드 감지 로직 — 사고 가이드

에피소드 감지 관련 코드를 수정하기 전에 읽으세요.

---

## 판단 흐름 (check-service.js 기준)

```
포스트 목록 수신 (hasdata API)
    ↓
최신 순 정렬 (sort by timestamp desc)
    ↓
포스트 순회
    ↓
캡션 키워드 매칭 (captionMatches)
    ├─ 매칭 실패 + !isComplete
    │       → OCR 시도 (extractTextFromImage)
    │           ├─ OCR 매칭 실패 → continue (건너뜀)
    │           └─ OCR 매칭 성공 → extractEpisodeNumberFromOCR
    └─ 매칭 성공
            → extractEpisodeNumber(caption)
                ↓
            ep === null ?
            ├─ !isComplete → OCR 폴백 (화수만 추출)
            └─ captionIsComplete → 가상 화수 (runningMaxEp + 1)
                ↓
            ep <= readEpisode ?
            ├─ Yes → break  ← 이미 읽은 구간 도달
            └─ No  → collected에 추가
```

---

## 핵심 불변 조건

| 조건 | 이유 |
|------|------|
| **최신 순 순회** `sort((a,b) => b.timestamp - a.timestamp)` | 오래된 것부터 보면 조기 중단 불가 |
| **`lastEntry = collected[0]`** | 최신 순이므로 첫 번째가 가장 최신 에피소드 |
| **`ep === null`이면 break하지 않음** | 화수를 모르면 더 오래된 포스트에 있을 수 있음 |
| **`buildUnreadPosts`는 오름차순** | UI 표시용 — 순회 방향과 반대 |

---

## 엣지 케이스

| 상황 | 처리 방식 |
|------|-----------|
| 캡션에 키워드 있지만 화수 없음 | OCR 폴백 후 `extractEpisodeNumberFromOCR` |
| OCR도 화수 없음 + 완결 키워드 | 가상 화수 (`runningMaxEp + 1`) 부여 |
| `readEpisode = 0` | break 조건 불충족 → 전체 포스트 순회 |
| 중복 화수 (동일 ep, 다른 포스트) | `alreadyCollected` + `alreadyInUnread` 체크로 스킵 |
| 3주 이상 업데이트 없음 | `isSeriesAbandoned()` → 완결 처리 |
| `undetectable` 툰 | `checkAllToons(forceAll: false)`에서 제외, 수동만 체크 |
| 시리즈명에 영문 혼용 (예: `ReLIFE`) | 캡션/OCR과 대소문자 달라도 매칭 — `buildSeriesKeys`/`captionMatches`/`ocrMatches`에서 `toLowerCase()` 정규화 (TROUBLESHOOTING #18) |

---

## 수정 시 주의사항

- `matchingUtils.js` 수정 → 서버 `scripts/check-toons.js`도 동일 함수 사용하므로 영향받음
- 수정 후 반드시 `node scripts/test-check-toons.js` 실행
- 새 시나리오 발견 시 `test-check-toons.js`에 케이스 추가
- `buildEpisodeHistory`, `buildUnreadPosts`는 oldest-first 정렬 유지 (UI 표시용)
