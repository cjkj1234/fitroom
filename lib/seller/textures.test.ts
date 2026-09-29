import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTextureMap,withTexture} from './textures';

const jpeg='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBD';

test('세션 텍스처는 이미지 데이터 주소만 받아들인다',()=>{
 assert.deepEqual(parseTextureMap(JSON.stringify({a:jpeg})),{a:jpeg});
 assert.deepEqual(parseTextureMap(JSON.stringify({a:'https://example.com/x.jpg',b:'javascript:alert(1)',c:'data:text/html;base64,AAAA',d:5,e:jpeg})),{e:jpeg});
 assert.deepEqual(parseTextureMap('not json'),{});
 assert.deepEqual(parseTextureMap(JSON.stringify([jpeg])),{});
 assert.deepEqual(parseTextureMap(null),{});
});

test('너무 큰 텍스처는 저장하지 않고, null이면 지운다',()=>{
 const huge=`data:image/jpeg;base64,${'A'.repeat(200_000)}`;
 assert.deepEqual(withTexture({},'p1',huge),{});
 assert.deepEqual(withTexture({p1:jpeg},'p1',null),{});
 assert.deepEqual(withTexture({p1:jpeg},'p2',jpeg),{p1:jpeg,p2:jpeg});
 assert.deepEqual(withTexture({},'p1','not a data url'),{});
});
