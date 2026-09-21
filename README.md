# FITROOM

## 프로젝트 방향과 현재 상태

2026-09-16부터 **의류 소상공인을 위한 코디·광고 문구 제작 서비스**를 목표로 진행합니다. 첫 화면에서 판매자와 이용자의 공간을 구분하고, 판매자 입력·AI 생성·결과 편집·저장과 이용자용 3D 피팅룸을 각각의 페이지로 제공합니다. 실제 AI 호출에는 서버 환경변수 `OPENAI_API_KEY`가 필요합니다.

- [기획서와 첫 버전 범위](docs/PROJECT_PLAN.md)
- [광고 제작 입력·출력 설계와 예시](docs/AD_CREATION_SPEC.md)
- [일정과 제출 마감](docs/TIMELINE.md)
- [9월 16일 개인 업무일지 초안](docs/journal/2026-09-16.md)
- [9월 21일 오류·개인정보 점검 일지](docs/journal/2026-09-21.md)
- [프로젝트 보고서 초안](docs/report/REPORT_DRAFT.md)

GitHub Actions 검증 설정과 보고서 초안을 준비했습니다. GitHub 제출 저장소 게시와 최종 보고서 PDF는 로그인 복구와 실제 모델 평가 후 완료합니다.

## 페이지 구성

- `/`: 판매자와 이용자 역할 선택
- `/seller`: 판매자 대시보드와 등록 현황
- `/seller/products`: 상품 기본 정보·가격·재고·사이즈 실측 관리
- `/seller/ads`: 등록 상품을 불러오는 AI 광고 스튜디오
- `/wardrobe`: 옷을 찾는 이용자용 3D 웹 옷장

판매자 상품의 텍스트 정보는 `fitroom.seller.products.v1` 키로 같은 브라우저에 임시 저장합니다. 선택한 상품은 광고 스튜디오에 자동으로 채워집니다. 계정별 서버 저장과 이용자 옷장 게시 기능은 아직 연결하지 않았습니다.

## 판매자 센터

- 등록 상품 수와 가격·재고·필수 실측 완료 상품 수를 보여주는 대시보드.
- 상점명, 상품명, 카테고리, 색상, 특징, 소재, 판매가, 재고 입력.
- 상의·하의·모자에 맞는 사이즈별 실측표 입력과 게시 준비 판정.
- 상품 초안 수정·삭제와 선택 상품의 AI 광고 제작 연결.
- 상품 이미지는 현재 세션의 미리보기에만 사용하며 브라우저 저장에서도 제외.

## 현재 구현된 광고 스튜디오

- 매장명, 상품명, 종류, 색상, 특징, 소재, 가격·할인율과 광고 조건 입력.
- `gpt-5-mini` Responses API와 Structured Outputs를 사용한 관점별 초안 3개 생성.
- 상품 특징·스타일링·일상 장면 초안의 제목, 본문, CTA, 해시태그 직접 편집.
- 편집한 결과 복사, TXT 저장, 선택한 상품 이미지와 함께 PNG 광고 카드 저장.
- 상품 이미지는 브라우저 미리보기와 PNG 생성에만 사용하며 AI 요청·서버 저장에서 제외.
- 입력 누락, 할인율 누락, 연결 실패, 시간 초과, 결과 형식 오류 안내. 실패 시 기존 편집 결과 보존.
- 요청 본문 크기 제한과 상품 입력을 남기지 않는 최소 서버 로그.

## 함께 제공되는 3D 피팅룸

의류 소상공인이 직접 등록한 상품을 내 체형의 3D 아바타에 조합하고, 판매자 실측으로 예상 차이를 확인한 뒤 각 상점으로 이동하는 가상 옷장입니다.

## 실행

```sh
npm run install:ci
npm run dev
npm test
npm run typecheck
npm run build
npm run evaluate:ads -- --dry-run
```

Node.js 22.13 이상. Sites의 portable 실행 프로필과 Vinext/React/TypeScript, Three.js를 사용합니다.

AI 생성은 서버 실행 환경에 `OPENAI_API_KEY`를 비밀값으로 설정해야 동작합니다. 키가 없으면 화면에서 연결 설정 필요 상태를 명확히 표시하며 예시 문구를 실제 생성 결과처럼 대신 보여주지 않습니다.

실제 모델 평가 절차는 [광고 평가 안내](docs/evaluations/README.md)에 있습니다. `--dry-run`은 키 없이 정상·오류 입력 규격만 검사하고, 실제 평가는 키가 연결된 실행 환경에서 응답 시간·원문·자동 의심 표현·사람 평가란을 함께 저장합니다.

## 3D 피팅룸 기능

- 소상공인 입점 흐름을 보여주는 시연 상품 8개와 판매자가 직접 게시한 상품. 상품 선택, 드래그/버튼 착용, 부위별 교체·벗기기, 사이즈 변경, 상점 구매 링크.
- 판매자 상품의 가격·재고·실측·구매 링크 등록, 게시/게시 내리기, 같은 브라우저의 이용자 옷장 연동.
- MakeHuman CC0 자산 기반 3D 아바타: 회전·확대·시점 전환, 키와 체형 변형.
- 간편 설정·상세 치수·정면/측면 사진 추정. 사진은 브라우저 Worker에서 MediaPipe로 분석합니다.
- 원본 사진은 메모리에서만 사용하며 서버 업로드 및 저장이 없습니다. 적용한 치수만 `fitroom.body.v1` 키로 이 브라우저에 저장합니다.
- 사진 추정은 사용자 확인 후 적용합니다. 기존 직접 입력 치수는 보존합니다.
- 모바일 세로 배치, 키보드로 사용할 수 있는 착용 버튼과 체형 설정, 스크린리더 상태 메시지.

## 데이터 및 정확도

`lib/wardrobe/catalog.ts`에 상품 URL, 확인일, 공개된 사이즈별 실측과 누락 설명을 보관합니다. 가격·재고를 실시간 동기화하지 않습니다. 3D 의상과 썸네일은 직접 제작한 간략화 자산이며 사진 또는 원단 시뮬레이션이 아닙니다.

핏 계산은 평면 단면의 두 배와 신체 둘레 등의 차이를 제공하는 **검증 전 추정**입니다. 허리선 위치, 신축성 및 모자 조절 범위가 확인되지 않은 비교는 보류합니다. 불명확한 데이터를 0으로 대체하지 않습니다.

사진에서 입력한 키로 스케일을 맞추고 정면 너비·측면 깊이의 타원 근사로 초기 둘레를 추정합니다. 포즈 관절은 재봉 측정 지점과 다르며 촬영 자세·원근·옷 두께의 영향을 받습니다. 실제 인체 치수나 착용 결과로 정확도를 검증하지 않았습니다.

## 구조

- `app/page.tsx`: 판매자·이용자 역할 선택
- `app/seller/page.tsx`, `components/seller-dashboard.tsx`: 판매자 현황과 작업 흐름
- `app/seller/products/page.tsx`, `components/seller-products.tsx`: 상품·재고·사이즈 실측 등록과 브라우저 저장
- `app/seller/ads/page.tsx`, `components/ad-studio.tsx`: 선택 상품 광고 입력·생성·편집·저장
- `lib/seller/products.ts`: 판매자 상품 저장 계약과 게시 준비 판정
- `app/wardrobe/page.tsx`, `components/wardrobe.tsx`: 이용자 3D 피팅룸과 상품 실측 비교
- `app/api/ads/generate/route.ts`: 서버 전용 OpenAI Responses API 호출과 실패 처리
- `lib/ads/contracts.ts`: 요청·응답 검사, 모델 출력 JSON Schema, 프롬프트 정책
- `lib/ads/contracts.test.ts`: 할인 예외, 출력 관점 중복, Responses API 텍스트 추출 검사
- `components/avatar-view.tsx`, `lib/wardrobe/geometry.ts`: 3D 모델 및 상품 실측 기반 참고 의상
- `components/body-editor.tsx`, `lib/wardrobe/photo-worker.ts`: 체형 설정 및 기기 내 사진 추정
- `lib/wardrobe/body.ts`, `fit.ts`, `photo-estimate.ts`: 검증 가능한 계산과 저장 데이터 처리
- `lib/wardrobe/wardrobe.test.ts`: 변환·누락·교체·저장·사진 후처리·상품 및 조작 입력 검증

## 자산 재생성

의상 썸네일은 실제 Three.js geometry를 소프트웨어 렌더링합니다. Python 의존성은 numpy, Pillow입니다.

```sh
node --import tsx scripts/export-catalog.ts
python3 scripts/render-catalog.py
```

MakeHuman 출처·라이선스·변형 한계는 `docs/assets/MAKEHUMAN.md`, 재현용 원본과 생성기는 `docs/assets/source/`에 있습니다. 생성기는 numpy, scipy, Pillow가 필요합니다.

MediaPipe 모델은 Google 공개 `pose_landmarker_lite/float16/1`이며 WASM 파일은 설치된 `@mediapipe/tasks-vision` 버전과 일치합니다. 모두 같은 사이트에서 제공하여 원본 사진의 외부 전송을 피합니다.

## WebMCP

지원하는 브라우저에는 `get_wardrobe_state`, `wear_wardrobe_items`를 제공합니다. UI와 같은 상태 변경을 사용하며 잘못된 상품/사이즈 또는 같은 부위의 중복 배치는 원자적으로 거부합니다.
