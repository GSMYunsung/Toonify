# Toonify — AI Agent 행동 지침

> CLAUDE.md가 "무엇을 할지" 정의한다면, 이 파일은 "어떻게 생각하고 어떤 순서로 접근할지"를 정의합니다.
> 명령을 받으면 이 파일을 먼저 읽고, 태스크 유형에 맞는 파일을 추가로 참조하세요.

---

## 태스크별 참조 파일 맵

| 태스크 유형 | 추가로 읽을 파일 |
|-------------|-----------------|
| 에피소드 감지 로직 수정 | `.claude/skills/episode-detection.md` |
| 배포 방식 결정 | `.claude/skills/deploy-decision.md` |
| 새 기능 구현 | `.claude/templates/feature.md` → `.claude/recipes/new-feature.md` |
| 버그 수정 | `.claude/templates/bugfix.md` |
| OTA 배포 실행 | `.claude/recipes/ota-deploy.md` |
| 새 빌드 실행 | `.claude/recipes/new-build.md` |
| 코드 구조 파악 | `.claude/docs/architecture.md` |
| 데이터 모델 관련 작업 | `.claude/docs/data-model.md` |
| 코드 리뷰 / 품질 판단 | `.claude/docs/code-standards.md` |

---

## 모든 태스크 공통 원칙

1. **기존 함수 먼저 탐색** — 구현 전 `matchingUtils.js` → `check-service.js` → `toon-store.js` 순서로 유사 로직 확인
2. **공유 로직은 `src/utils/`** — 앱(`src/`)과 서버(`scripts/`)가 함께 쓰는 로직은 반드시 공유 파일로
3. **배포 전 자가검증** — `.claude/recipes/ota-deploy.md` 체크리스트 완료 후 배포
4. **TROUBLESHOOTING.md 기록** — 해결한 버그/문제는 반드시 기록

---

## 작업 완료 후 — 정의서 동기화

**모든 작업이 끝나면 변경 내용이 .claude/ 정의서와 일치하는지 확인하고 업데이트하세요.**

| 변경 내용 | 업데이트할 파일 |
|-----------|----------------|
| 새 기능 추가 / 서비스 구조 변경 | `.claude/docs/architecture.md` |
| toon 객체 필드 추가·변경 / Supabase 스키마 변경 | `.claude/docs/data-model.md` |
| 새 금지 패턴 또는 새 공통 함수 발견 | `.claude/docs/code-standards.md` |
| 에피소드 감지 로직 변경 / 새 엣지케이스 발견 | `.claude/skills/episode-detection.md` |
| 배포 규칙 변경 (OTA 조건, 버전 규칙 등) | `.claude/skills/deploy-decision.md` |
| 배포 절차 변경 | `.claude/recipes/ota-deploy.md` 또는 `new-build.md` |
| 개발 워크플로우 변경 | `.claude/recipes/new-feature.md` |
| 새 반복 작업 패턴 생김 | 해당 recipe 파일 추가 |

정의서가 코드 현실과 어긋나면 다음 작업 시 잘못된 전제로 시작하게 됩니다.

---

## 금지 행동 (절대 하지 말 것)

- API 키, 환경변수를 코드에 직접 하드코딩
- 동일 로직을 두 파일에 따로 작성하거나 복붙
- 자가검증 없이 OTA 배포 실행
- `check-service.js` / `matchingUtils.js` 수정 후 테스트 케이스 추가 없이 배포

---

## 디렉토리 역할 요약

```
AGENTS.md          ← 이 파일: 태스크 라우팅 + 공통 원칙
CLAUDE.md          ← 핵심 업무 지시서 (기술 스택, 데이터 모델, 기능 명세)

.claude/
├── skills/        ← 특정 도메인에서 어떻게 생각할지
├── docs/          ← 무엇을 좋은 코드/구조로 볼지 (레퍼런스)
├── templates/     ← 구현 전에 무엇을 정의할지 (빈칸 채우기)
└── recipes/       ← 반복 작업을 어떤 순서로 할지 (체크리스트)

scripts/
├── check-toons.js        ← 서버 배치 (GitHub Actions)
└── test-check-toons.js   ← 에피소드 감지 테스트
```
