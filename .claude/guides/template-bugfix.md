# 버그 수정 정의 템플릿

> 수정 시작 전 이 템플릿을 채우세요.

---

## 리스크 등급 (AGENTS.md 참고)
- [ ] Low (UI/문구/단순 리팩터링) — 템플릿 간단히 채우고 바로 진행
- [ ] Medium (서비스 레이어: check-service.js, toon-store.js, notifications.js 등) — 이 템플릿 채워 사용자 확인 후 진행
- [ ] High (matchingUtils.js, Supabase 스키마, check-toons.js, 배포 설정) — Plan Mode로 전환해 계획 승인 먼저 받을 것

판단 근거:

---

## 버그 설명

## 재현 조건
1.
2.
3.

## 예상 동작 vs 실제 동작
- 예상:
- 실제:

## 원인 분석
- 원인 파일:
- 원인 함수 / 라인:
- 근본 원인 (로직 오류 / 엣지 케이스 미처리 / 중복 로직 불일치):

## 검토한 대안
- 고려했지만 채택 안 한 방법과 이유:
- 채택한 방법과 이유:

## 수정 범위
- 수정할 파일:
- [ ] 동일 로직이 다른 파일에도 있는지 확인 (matchingUtils, check-service, check-toons.js)

## 검증
- [ ] `node scripts/test-check-toons.js` 통과
- [ ] 재현 조건으로 수동 테스트

## 트러블슈팅 기록 (AGENTS.md Part 4)
- [ ] 수정 완료 후 기록
- 기록할 내용: 증상 / 원인 / 검토한 대안 / 해결 방법
