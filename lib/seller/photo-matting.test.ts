import test from 'node:test';
import assert from 'node:assert/strict';
import {MATTING_MODEL,probabilityToAlpha,toModelInput} from './photo-matting';

test('AI 모델 입력은 채널 우선 배열이고 (값 − 128) ÷ 256으로 정규화한다',()=>{
 // 2×2 사진: 첫 픽셀만 흰색, 나머지 검정.
 const rgba=new Uint8ClampedArray([255,255,255,255, 0,0,0,255, 0,0,0,255, 0,0,0,255]);
 const input=toModelInput(rgba,2);
 assert.equal(input.length,12);
 assert.ok(Math.abs(input[0]-127/256)<1e-6,'R 평면 첫 값');
 assert.ok(Math.abs(input[4]-127/256)<1e-6,'G 평면 첫 값');
 assert.ok(Math.abs(input[9]+.5)<1e-6,'B 평면 둘째 값');
});

test('모델 출력(옷일 확률)을 0~255 알파로 바꾸고 범위 밖 값은 자른다',()=>{
 assert.deepEqual([...probabilityToAlpha([-.1,0,.5,1,1.2])],[0,0,128,255,255]);
});

test('AI 모델은 고정된 커밋의 파일을 크기와 SHA-256으로 확인한다',()=>{
 assert.match(MATTING_MODEL.url,/^https:\/\/huggingface\.co\/imgly\/isnet-general-onnx\/resolve\/[0-9a-f]{40}\/onnx\/model_fp16\.onnx$/);
 assert.match(MATTING_MODEL.sha256,/^[0-9a-f]{64}$/);
 assert.ok(MATTING_MODEL.bytes>80e6&&MATTING_MODEL.bytes<100e6);
});
