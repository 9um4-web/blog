import { generateKeyBetween } from "fractional-indexing";

/**
 * PostSeries.order용 fractional order 키 (스펙 6장).
 * 문자열 정렬 키라 중간 삽입 시 기존 행을 건드리지 않는다.
 */

/** 목록 맨 뒤에 붙일 키. lastKey가 없으면(빈 시리즈) 첫 키. */
export function keyAfter(lastKey: string | null): string {
  return generateKeyBetween(lastKey, null);
}

/** 목록 맨 앞에 붙일 키. */
export function keyBefore(firstKey: string | null): string {
  return generateKeyBetween(null, firstKey);
}

/** 두 키 사이에 삽입할 키. a < b 여야 한다. */
export function keyBetween(a: string | null, b: string | null): string {
  return generateKeyBetween(a, b);
}
