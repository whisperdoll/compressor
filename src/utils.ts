export type MaybeWrapped<T> = T | T[];

export function reversed<T>(array: T[]): T[] {
  return array.map((_, i) => array[array.length - 1 - i]);
}

export function clamp(n: number, min: number, max: number): number {
  return n < min ? min : n > max ? max : n;
}
