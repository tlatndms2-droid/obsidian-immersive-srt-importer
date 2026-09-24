# Immersive Translate SRT Importer

Obsidian Canvas의 YouTube 링크 카드에서 Chrome의 Immersive Translate가 만든 SRT를 Vault에 저장합니다. 개인용 비공식 연동이며 Immersive Translate와 제휴한 제품이 아닙니다.

## 설치

Obsidian 데스크톱, Chrome, Chrome에 설치·로그인된 Immersive Translate가 필요합니다. 검증 환경은 Windows / Obsidian 1.13.7 / Immersive Translate 1.33.1입니다.

1. Releases의 Chrome 연결 확장 ZIP을 계속 사용할 폴더에 압축 해제합니다.
2. `chrome://extensions`에서 개발자 모드를 켜고 **압축해제된 확장 프로그램을 로드합니다**를 눌러 manifest.json이 바로 들어 있는 폴더를 선택합니다.
3. Obsidian BRAT에서 `tlatndms2-droid/obsidian-immersive-srt-importer`를 추가합니다. 수동 설치는 Release의 main.js, manifest.json, styles.css를 Vault의 `.obsidian/plugins/immersive-srt-importer/`에 넣고 플러그인을 켭니다.
4. Obsidian 플러그인 설정의 **연결 코드 복사**를 누릅니다.
5. Chrome의 **Immersive SRT — Obsidian 연결** 확장을 열어 코드를 붙여넣고 **연결**을 누릅니다.

연결 코드는 공유하지 마세요. 한 번에 하나의 Vault와 연결합니다. Chrome 확장 업데이트는 같은 폴더에 새 파일을 덮어쓴 뒤 확장 관리 화면에서 새로고침합니다. Obsidian 플러그인과 Chrome 확장은 같은 버전을 사용하세요.

## 사용

**Canvas YouTube 링크 카드 우클릭 → Immersive Translate 자막 가져오기 → 원문만 / 번역만 / 원문+번역 선택**

- Chrome 작업 탭에서 YouTube CC 버튼과 자막 번역이 꺼져 있으면 켠 뒤, 실제 자막이 표시되면 다운로드를 선택합니다. AI 자막을 자동 요청하지 않습니다. 다운로드 가능한 자막이 없으면 오류를 알립니다.
- 작업 탭의 자체 자동 다운로드를 끄고 공식 내보내기 결과를 Vault로 전달합니다. Chrome 폴더 선택 창 없이 저장합니다.
- Obsidian 알림 하나가 영상 열기, 자막 준비, 번역 완료 대기, SRT 받기, 저장 단계로 갱신됩니다. 완료·취소·실패는 8초 후 닫힙니다.
- **자막 저장 폴더** 기본값은 `SRT`입니다. `자료/자막`처럼 Vault 안의 경로를 입력하고 **저장**하면 다음 가져오기부터 적용됩니다. 없는 폴더는 저장 시 생성합니다. 기존 파일은 이동하지 않으며 빈 값은 `SRT`로 돌아갑니다.
- 같은 파일명이 있으면 Obsidian에서 덮어쓰기를 묻습니다. 취소 시 기존 파일을 유지합니다.
- 파일명과 자막 내용은 공급자 결과를 사용합니다. Windows에서 사용할 수 없는 파일명 문자는 바꿉니다. 공급자가 제목에 알림 수 `(49)` 등을 넣으면 같은 영상도 다른 파일로 저장될 수 있습니다.
- 저장 후 카드·링크·Markdown을 추가하지 않습니다. 연결 해제나 플러그인 삭제 후 SRT는 남습니다.
- 성공·취소 후 작업 탭은 닫습니다. 실패한 탭 또는 사용자가 다른 주소로 이동한 탭은 남깁니다.

## 지원 범위

단일 YouTube watch / youtu.be / shorts 주소를 지원합니다. 한 번에 한 영상이며 시간 제한은 10분입니다. 자막 작업은 자동 재시도하지 않고 유휴 연결만 복구합니다. Chrome이 실행돼 있어야 하며 영상 작업 탭을 표시합니다. Chrome 없는 처리는 후속 검토 대상입니다.

자막 생성·번역은 Immersive Translate가 담당하므로 계정 설정·사용량·제한이 적용됩니다. 공급자 화면 변경 시 연동 수정이 필요할 수 있습니다. 모든 영상, 번역 전용 구성, macOS/Linux는 아직 검증하지 않았습니다.

## 검증과 개발

- 자동 테스트 29개와 빌드 통과. Sandbox 설정 저장·재시작 유지 확인.
- 두 영상의 실제 영어·한국어 SRT 저장과 덮어쓰기 확인.
- Chrome 저장 창 제거, 진행 알림과 지정 폴더 저장은 사용자 확인을 받았습니다.

Node.js 20 이상과 pnpm: `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm build`.

소스는 `src/`, `chrome-extension/`입니다. 설치 파일은 `dist/obsidian/immersive-srt-importer/`, `dist/chrome-extension/`에 생성됩니다. 서버는 `127.0.0.1`에만 열고 256비트 연결 코드로 인증합니다. 연결 정보는 사용자 Vault와 Chrome 로컬 저장소에만 보관합니다.

Sandbox·계정 정보·자막 파일·Planning Pack은 저장소에 포함하지 않습니다. ws 라이브러리의 라이선스는 THIRD_PARTY_NOTICES.txt를 참조하세요.
