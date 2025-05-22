import { PlayState } from "./App";
import { Viewport } from "./components/AudioWaveform";
import WaveformCache from "./waveformCache";

export function clearCanvas(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
}

const waveformCache = new WaveformCache();
const cacheStats = new Map<string, { missed: number; hit: number }>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).cacheStats = () => {
  const str: string[] = [];
  for (const [label, { missed, hit }] of cacheStats.entries()) {
    const total = missed + hit;
    str.push(`${label}: ${Math.round((hit / total) * 100)}% hit rate`);
  }

  console.log(str.join("\n"));
};
export function drawSamples(
  canvas: HTMLCanvasElement,
  samples: number[],
  maxWidth: number = 500
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = Math.min(maxWidth, canvas.width);
  const height = canvas.height;
  const midY = height / 2;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "white";

  ctx.beginPath();
  // how many samples per pixel column
  const step = Math.floor(samples.length / width);

  for (let x = 0; x < width; x++) {
    const start = x * step;
    const end = Math.min(start + step, samples.length);

    let min = 1,
      max = -1;
    for (let i = start; i < end; i++) {
      const v = samples[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }

    const y1 = midY + min * midY;
    const y2 = midY + max * midY;

    ctx.moveTo(x, y1);
    ctx.lineTo(x, y2);
  }
  ctx.stroke();
}

export function drawWaveform(
  label: string,
  canvas: HTMLCanvasElement,
  buffer: AudioBuffer,
  viewport: Viewport,
  color: string,
  threshold: number, // dBFS level at which compression starts
  ratio: number, // Compression ratio (e.g., 4:1)
  attack: number, // Attack time in ms
  release: number, // Release time in ms,
  cacheKey: string | null
) {
  // console.time(label);
  const drawCached = (cacheKey: string) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = canvas;
    const cached = waveformCache.get(cacheKey);
    if (!cached) throw "not cached";
    ctx.drawImage(
      cached,
      // (viewport.startIndex / buffer.length) * cached.width,
      0,
      0,
      // (viewport.length / buffer.length) * cached.width,
      cached.width,
      cached.height,
      0,
      0,
      width,
      height
    );
  };

  const stats: NonNullable<ReturnType<typeof cacheStats.get>> =
    cacheStats.get(label) ||
    cacheStats.set(label, { hit: 0, missed: 0 }).get(label)!;

  if (cacheKey && waveformCache.has(cacheKey)) {
    stats.hit++;
    // console.log(`  cache hit: ${cacheKey}`);
    drawCached(cacheKey);
    // console.timeEnd(label);
    return;
  }

  stats.missed++;
  // console.log(`  cache miss: ${cacheKey}`);

  let cachedCanvas: HTMLCanvasElement;
  if (cacheKey) {
    cachedCanvas = document.createElement("canvas");
    cachedCanvas.width = canvas.width;
    cachedCanvas.height = canvas.height;
    waveformCache.add(cacheKey, cachedCanvas);
  } else {
    cachedCanvas = canvas;
  }
  const ctx = cachedCanvas.getContext("2d");
  if (!ctx) return;

  const { width, height } = cachedCanvas;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;

  const data = buffer
    .getChannelData(0)
    .subarray(viewport.startIndex, viewport.startIndex + viewport.length);
  const step = Math.ceil(data.length / width);
  const amp = height / 2;

  // Convert threshold from dBFS to linear amplitude
  const thresholdLinear = Math.pow(10, threshold / 20);
  const attackCoef = Math.exp(-1 / (attack * buffer.sampleRate * 0.001));
  const releaseCoef = Math.exp(-1 / (release * buffer.sampleRate * 0.001));

  let gain = 1;

  ctx.beginPath();

  for (let i = 0; i < width; i++) {
    let min = Infinity;
    let max = -Infinity;

    for (let j = 0; j < step; j++) {
      const index = Math.min(i * step + j, data.length - 1);
      let sample = data[index] || 0;
      const absSample = Math.abs(sample); // Avoid log(0)

      // Apply compression if above threshold
      if (absSample > thresholdLinear) {
        const dbInput = 20 * Math.log10(absSample);
        const dbGainReduction =
          dbInput - threshold - (dbInput - threshold) / ratio;
        const linearGain = Math.pow(10, -dbGainReduction / 20);

        gain = gain * attackCoef + linearGain * (1 - attackCoef);
        sample *= gain;
      } else {
        gain = gain * releaseCoef + 1 * (1 - releaseCoef);
      }

      if (sample < min) min = sample;
      if (sample > max) max = sample;
    }

    if (i === 0) {
      ctx.moveTo(i + 0.5, Math.round(amp * (1 + min)) + 0.5);
    } else {
      ctx.lineTo(i + 0.5, Math.round(amp * (1 + min)) + 0.5);
    }
    ctx.lineTo(i + 0.5, Math.round(amp * (1 + max)) + 0.5);
  }
  ctx.stroke();

  if (cacheKey) {
    drawCached(cacheKey);
  }
  // console.timeEnd(label);
}

export function drawPlayState(
  canvas: HTMLCanvasElement,
  playState: PlayState,
  buffer: AudioBuffer,
  viewport: Viewport
) {
  if (!playState.playing) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { width, height } = canvas;

  ctx.beginPath();
  ctx.strokeStyle = "white";
  ctx.lineWidth = 2;
  const durationInViewport =
    (viewport.length / buffer.length) * buffer.duration;
  const x = Math.round((playState.time / durationInViewport) * width) + 0.5;
  ctx.moveTo(x, 0);
  ctx.lineTo(x, height);
  ctx.stroke();
}

export function drawDbLine(
  canvas: HTMLCanvasElement,
  db: number,
  ratio: number
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { width, height } = canvas;

  const amp = height / 2;
  const normalizedDb = 1 - Math.pow(10, db / 20);
  const y = amp * normalizedDb;
  const y2 = height - amp * normalizedDb;

  ctx.strokeStyle = "rgba(0,0,0,0.1)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, Math.round(height / 2) - 0.5);
  ctx.lineTo(width, Math.round(height / 2) - 0.5);
  ctx.stroke();
  ctx.strokeStyle = "red";
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(width, y);
  ctx.moveTo(0, y2);
  ctx.lineTo(width, y2);
  ctx.stroke();

  const stops: Array<[number, string]> = [
    [0, "rgba(255,0,0,0)"],
    [0.99, `rgba(255,0,0,${Math.log(ratio) / 8})`],
    [1, "rgba(255,0,0,1)"],
  ];

  const gradient1 = ctx.createLinearGradient(0, 0, 0, y);
  const gradient2 = ctx.createLinearGradient(0, height, 0, y2);
  stops.forEach((s) => {
    gradient1.addColorStop(s[0], s[1]);
    gradient2.addColorStop(s[0], s[1]);
  });

  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = `rgba(255,0,0,${Math.log(ratio) / 8})`;
  ctx.fillRect(0, y, width, y2 - y);
  ctx.fillStyle = gradient1;
  ctx.fillRect(0, 0, width, y);
  ctx.fillStyle = gradient2;
  ctx.fillRect(0, y2, width, y);
  ctx.globalCompositeOperation = "source-over";
}

export function drawViewport(
  canvas: HTMLCanvasElement,
  bufferLength: number,
  startIndex: number,
  length: number
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { width, height } = canvas;

  const x = (startIndex / bufferLength) * width;
  const y = 0;
  const w = (length / bufferLength) * width;
  const h = height;

  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.strokeStyle = "yellow";
  // ctx.fillStyle = "rgba(255,255,255,0)";
  // ctx.lineWidth = 2;
  ctx.beginPath();
  // ctx.rect(x, y, w, h);
  ctx.rect(0, y, x, h);
  ctx.rect(x + w, y, width - w - x, h);
  ctx.fill();
  // ctx.stroke();
}
