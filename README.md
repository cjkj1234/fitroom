# FITROOM

내 체형의 3D 아바타에 무신사 상품을 조합해 입히고, 공개 실측으로 예상 차이를 확인하는 가상 옷장입니다.

## 실행

```sh
npm run install:ci
npm run dev
npm test
npm run typecheck
npm run build
```

Node.js 22.13 이상. Sites의 portable 실행 프로필과 Vinext/React/TypeScript, Three.js를 사용합니다.

## 제공 기능

- 8개 실제 상품: 상의 3, 하의 3, 모자 2. 상품 선택, 드래그/버튼 착용, 부위별 교체·벗기기, 사이즈 변경, 원본 구매 링크.
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

- `app/page.tsx`: 피팅룸 및 상품/착용 상태
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
