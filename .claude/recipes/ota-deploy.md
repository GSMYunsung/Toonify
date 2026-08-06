# OTA 배포 레시피

> `eas update --channel production` 실행 전 이 체크리스트를 완료하세요.

---

## 1. 로직 검증

- [ ] 변경된 함수를 직접 추적하며 엣지 케이스 확인
- [ ] 오탐 시나리오 (없는데 있다고 감지) 검토
- [ ] 누락 시나리오 (있는데 못 잡음) 검토
- [ ] `node scripts/test-check-toons.js` 실행 → 전체 통과

## 2. 테스트 케이스 추가

- [ ] 새 기능/버그픽스가 있으면 `test-check-toons.js`에 케이스 추가
- [ ] 추가한 케이스 포함해서 다시 통과 확인

## 3. 기록

- [ ] `TROUBLESHOOTING.md` 업데이트 (해결한 문제 있으면)
- [ ] `README.md` 변경사항 반영 (기능 추가/수정 있으면)

## 4. 배포 실행

```bash
eas update --channel production --message "변경 내용 (한글로 간결하게)"
```

## 5. 배포 후 확인

- [ ] EAS 대시보드에서 배포 상태 확인
- [ ] git commit & push

---

## 주의사항

- OTA는 **다음 앱 실행 시** 적용됨 (즉시 아님)
- `runtimeVersion`이 다른 빌드에는 OTA 적용 안 됨
- 환경변수(`EXPO_PUBLIC_*`) 변경은 OTA로 반영 불가 → 새 빌드 필요
