# 코드 표준

---

## 재사용 원칙

구현 전 반드시 이 순서로 기존 함수를 탐색하세요:
1. `src/utils/matchingUtils.js` — 키워드 매칭, 화수 추출
2. `src/services/check-service.js` — 에피소드 감지 로직
3. `src/services/toon-store.js` — 데이터 CRUD

유사 함수가 있으면 새로 만들지 말고 import해서 사용합니다.

---

## 금지 패턴

```js
// ❌ API 키 하드코딩
const key = "sk-1234abcd";

// ❌ 동일 로직 복붙
// check-service.js의 화수 추출 로직을 scripts/check-toons.js에 그대로 복사

// ❌ check-service에서 AsyncStorage 직접 접근
import AsyncStorage from "@react-native-async-storage/async-storage";
// → 반드시 toon-store.js의 getToons(), updateToon() 경유

// ❌ 한 파일만 수정하고 나머지 방치
// matchingUtils.js 함수 시그니처 변경 후 서버 쪽 호출부 미수정
```

---

## 올바른 패턴

```js
// ✅ 공유 유틸 import
import { extractEpisodeNumber, captionMatches } from '../utils/matchingUtils';

// ✅ toon-store 경유 데이터 접근
import { getToons, updateToon } from './toon-store';

// ✅ barrel을 통한 외부 import
import { checkToon, addToon } from './toon-service';

// ✅ 서버에서 공유 유틸 사용
const { captionMatches } = require('./src/utils/matchingUtils');
```

---

## 새 파일 생성 기준

| 유형 | 위치 |
|------|------|
| 앱+서버 공유 유틸 | `src/utils/` (CommonJS 호환) |
| 앱 전용 서비스 | `src/services/` + `toon-service.js`에 re-export 추가 |
| UI 컴포넌트 | `src/components/` |
| 상수/URL | `src/constants/` |

---

## 주석 규칙

- 기본적으로 주석 없음
- WHY가 불명확한 경우에만 한 줄 추가 (숨겨진 제약, 특정 버그 우회 등)
- WHAT을 설명하는 주석 금지 (코드 자체가 설명해야 함)
