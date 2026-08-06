# 새 기능 개발 레시피

---

## 순서

### 1. 정의 먼저
- `.claude/templates/feature.md` 내용을 채워서 사용자 확인
- 확인 전에는 코드 작성 금지

### 2. 기존 로직 탐색
- `src/utils/matchingUtils.js` → 키워드/화수 관련 함수
- `src/services/toon-store.js` → 데이터 CRUD
- `src/services/check-service.js` → 감지 로직
- 있으면 재사용, 없으면 적절한 위치에 추가

### 3. 구현 순서
1. 공유 로직이 있으면 `matchingUtils.js` 먼저
2. 서비스 레이어 (`toon-store.js` / `check-service.js`)
3. UI 마지막 (`components/`, `screens/`)
4. `toon-service.js` barrel 업데이트 (새 export가 있으면)

### 4. 검증
- [ ] `node scripts/test-check-toons.js` 실행 → 전체 통과
- [ ] 에피소드 감지 관련이면 새 케이스 추가

### 5. 배포
- JS만 변경 → `.claude/recipes/ota-deploy.md` 체크리스트
- 네이티브 변경 → `.claude/recipes/new-build.md`

### 6. 마무리
- [ ] `TROUBLESHOOTING.md` 기록 (버그 수정 포함 시)
- [ ] `README.md` 업데이트
- [ ] git commit & push
