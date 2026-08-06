# 새 기능 정의 템플릿

> 구현 시작 전 이 템플릿을 채우고 사용자 확인 후 진행하세요.
> 빈칸이 있으면 진행하지 말 것.

---

## 기능명
(예: 시리즈명 수동 수정)

## 사용자 흐름 (User Flow)
1. 사용자가 [무엇을] 한다
2. 앱이 [어떻게] 반응한다
3. 사용자가 [결과를] 본다

## 영향받는 파일
- `src/screens/` :
- `src/components/` :
- `src/services/` :
- `src/utils/matchingUtils.js` : (변경 필요 여부)

## 데이터 변경
- AsyncStorage toon 객체 필드 추가/변경:
- Supabase 스키마 변경 필요 여부:

## 공유 로직 여부
- [ ] 앱과 서버 공통 → `matchingUtils.js`에 추가
- [ ] 앱 전용

## 배포 방식
- [ ] OTA 가능 (JS만 변경)
- [ ] 새 빌드 필요 (네이티브 변경 또는 환경변수 추가)

## 테스트 계획
- `scripts/test-check-toons.js` 추가 케이스: (에피소드 감지 관련일 경우)
- 수동 테스트 시나리오:
