interface CacheItem {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  timestamp: number;
}

const MAX = 10000;

export default class WaveformCache {
  items: (HTMLCanvasElement | OffscreenCanvas)[] = [];
  map: Map<string, number> = new Map();
  removed: number = 0;

  constructor() {}

  add(key: string, canvas: HTMLCanvasElement | OffscreenCanvas) {
    this.items.push(canvas);
    this.map.set(key, this.items.length - 1);
    // console.log(`${Math.round((this.items.length / MAX) * 100)}% full`);
    if (this.items.length > MAX) {
      const removing = MAX / 10;
      this.items.splice(0, removing);
      this.removed += removing;
    }
  }

  get(key: string): HTMLCanvasElement | OffscreenCanvas | undefined {
    const index = this.map.get(key);
    if (index === undefined) return undefined;

    return this.items[index - this.removed];
  }

  has(key: string): boolean {
    return this.map.has(key);
  }
}
