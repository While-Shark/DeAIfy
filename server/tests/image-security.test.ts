import {describe,expect,it} from 'vitest';
import {imageMagic,validateFormat,validateParams} from '../src/image/types.js';
const valid={strength:60,grain:10,warmth:0,saturation:0,contrast:0,softness:0,texture:0};
describe('untrusted upload gate',()=>{
 it('accepts only recognised image magic, never extension or MIME',()=>{
  expect(imageMagic(Buffer.from([137,80,78,71,13,10,26,10]))).toBe('image/png');
  expect(imageMagic(Buffer.from([255,216,255,12,20]))).toBe('image/jpeg');
  expect(imageMagic(Buffer.from('RIFFabcdWEBP','ascii'))).toBe('image/webp');
  expect(imageMagic(Buffer.from('<svg onload=alert(1)>'))).toBeNull();
  expect(imageMagic(Buffer.from('MZ.exe'))).toBeNull();
  expect(imageMagic(Buffer.from('<?php eval('))).toBeNull();
 });
 it('blocks malformed / oversized image effect inputs',()=>{
  expect(validateParams(valid)).toEqual(valid);
  expect(()=>validateParams({...valid,strength:100000})).toThrow();
  expect(()=>validateParams({...valid,grain:Infinity})).toThrow();
  expect(()=>validateFormat('image/svg+xml')).toThrow();
 });
});
