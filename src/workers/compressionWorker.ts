import Color from "colorjs.io";
import { PlayState } from "../App";
import { Viewport } from "../components/AudioWaveform";
import { MaybeWrapped } from "../utils";
import WaveformCache from "../waveformCache";

interface ShallowAudioBuffer {
  length: number;
  duration: number;
  channelData: Float32Array[];
  sampleRate: number;
}

const SHOULD_DOUBLE_BUFFER = false;

const canvases = new Map<string, OffscreenCanvas>();
const doubleBufferCanvases = new Map<string, OffscreenCanvas>();
const audioBuffers = new Map<string, ShallowAudioBuffer>();
let shouldAbort = false;

export type MessageData =
  | {
      action: "abortCurrentOperations";
    }
  | {
      action: "registerCanvases";
      payload: Record<string, OffscreenCanvas>;
    }
  | {
      action: "registerAudioBuffers";
      payload: Record<string, ShallowAudioBuffer>;
    }
  | {
      action: "resizeCanvas";
      payload: {
        canvas: string;
        width: number;
        height: number;
      };
    }
  | {
      action: "drawWaveform";
      payload: {
        label: string;
        canvas: string;
        buffer: string;
        viewport: Viewport;
        color: string;
        threshold: number; // dBFS level at which compression starts
        ratio: number; // Compression ratio (e.g., 4:1)
        attack: number; // Attack time in ms
        release: number; // Release time in ms,
        cacheKey: string | null;
      };
    }
  | {
      action: "clearCanvas";
      payload: {
        canvas: string;
      };
    }
  | {
      action: "drawSamples";
      payload: {
        canvas: string;
        samples: number[];
        maxWidth?: number;
      };
    }
  | {
      action: "drawPlayState";
      payload: {
        canvas: string;
        playState: PlayState;
        buffer: string;
        viewport: Viewport;
      };
    }
  | {
      action: "drawDbLine";
      payload: {
        canvas: string;
        db: number;
        ratio: number;
      };
    }
  | {
      action: "drawViewport";
      payload: {
        canvas: string;
        buffer: string;
        startIndex: number;
        length: number;
      };
    }
  | {
      action: "flushCanvas";
      payload: {
        canvas: string;
      };
    };

type QueueState = "working" | "idle";

let eventQueue: MessageData[] = [];
let queueState: QueueState = "idle";

// function waitForQueueIdle() {
//   return new Promise<void>((resolve) => {
//     const check = () => {
//       if (queueState === "idle") {
//         resolve();
//       } else {
//         setTimeout(check);
//       }
//     };

//     check();
//   });
// }

onmessage = (e: MessageEvent<MaybeWrapped<MessageData>>) => {
  const messages = Array.isArray(e.data) ? e.data : [e.data];

  messages.forEach(handleMessage);
};

function canvasFor(key: string): OffscreenCanvas {
  return SHOULD_DOUBLE_BUFFER
    ? doubleBufferCanvases.get(key)!
    : canvases.get(key)!;
}

function handleMessage(message: MessageData) {
  switch (message.action) {
    case "abortCurrentOperations":
      shouldAbort = true;
      break;
    case "registerCanvases":
      setupCanvases(message.payload);
      break;
    case "resizeCanvas":
      resizeCanvas(message.payload);
      break;
    case "registerAudioBuffers":
      setupAudioBuffers(message.payload);
      break;
    case "drawWaveform":
      drawWaveform({
        ...message.payload,
        canvas: canvasFor(message.payload.canvas),
        buffer: audioBuffers.get(message.payload.buffer)!,
      });
      break;
    case "clearCanvas":
      clearCanvas(canvasFor(message.payload.canvas));
      break;
    case "drawSamples":
      drawSamples(
        canvasFor(message.payload.canvas),
        message.payload.samples,
        message.payload.maxWidth
      );
      break;
    case "drawPlayState":
      drawPlayState(
        canvasFor(message.payload.canvas),
        message.payload.playState,
        audioBuffers.get(message.payload.buffer)!,
        message.payload.viewport
      );
      break;
    case "drawDbLine":
      drawDbLine(
        canvasFor(message.payload.canvas),
        message.payload.db,
        message.payload.ratio
      );
      break;
    case "drawViewport":
      drawViewport(
        canvasFor(message.payload.canvas),
        audioBuffers.get(message.payload.buffer)!,
        message.payload.startIndex,
        message.payload.length
      );
      break;
    case "flushCanvas":
      flushCanvas(message.payload.canvas);
      break;
  }
}

function flushCanvas(canvas: string) {
  if (!SHOULD_DOUBLE_BUFFER) return;
  const ctx = canvases.get(canvas)!.getContext("2d")!;

  clearCanvas(canvases.get(canvas)!);
  ctx.drawImage(doubleBufferCanvases.get(canvas)!, 0, 0);
}

function setupCanvases(toSetup: Record<string, OffscreenCanvas>) {
  for (const [key, canvas] of Object.entries(toSetup)) {
    canvases.set(key, canvas);

    if (SHOULD_DOUBLE_BUFFER) {
      doubleBufferCanvases.set(
        key,
        new OffscreenCanvas(canvas.width, canvas.height)
      );
    }
  }
}

function resizeCanvas(
  opts: (MessageData & { action: "resizeCanvas" })["payload"]
) {
  const canvas = canvasFor(opts.canvas);
  canvas.width = opts.width;
  canvas.height = opts.height;
}

function setupAudioBuffers(toSetup: Record<string, ShallowAudioBuffer>) {
  for (const [key, audioBuffer] of Object.entries(toSetup)) {
    audioBuffers.set(key, audioBuffer);
  }
}

function clearCanvas(canvas: OffscreenCanvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no context");

  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
}

const waveformCache = new WaveformCache();
const cacheStats = new Map<string, { missed: number; hit: number }>();

// (window as any).cacheStats = () => {
//   const str: string[] = [];
//   for (const [label, { missed, hit }] of cacheStats.entries()) {
//     const total = missed + hit;
//     str.push(`${label}: ${Math.round((hit / total) * 100)}% hit rate`);
//   }

//   console.log(str.join("\n"));
// };

function drawSamples(
  canvas: OffscreenCanvas,
  samples: number[],
  maxWidth: number = 500
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = Math.min(maxWidth, canvas.width);
  const height = canvas.height;
  const midY = height / 2;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "black";

  // how many samples per pixel column
  const step = Math.ceil(samples.length / width);

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

    ctx.beginPath();
    ctx.moveTo(x, y1);
    ctx.lineTo(x, y2);
    ctx.stroke();
  }
}

const timings: Record<string, number> = {};
const time = <T>(label: string, fn: () => T): T => {
  const now = performance.now();
  const ret = fn();
  const newNow = performance.now();
  if (!Object.prototype.hasOwnProperty.call(timings, label)) {
    timings[label] = 0;
  }
  timings[label] += newNow - now;
  return ret;
};

function drawWaveform(props: {
  label: string;
  canvas: OffscreenCanvas;
  buffer: ShallowAudioBuffer;
  viewport: Viewport;
  color: string;
  threshold: number; // dBFS level at which compression starts
  ratio: number; // Compression ratio (e.g., 4:1)
  attack: number; // Attack time in ms
  release: number; // Release time in ms,
  cacheKey: string | null;
}) {
  const {
    label,
    canvas,
    buffer,
    viewport,
    color,
    threshold,
    ratio,
    attack,
    release,
    cacheKey,
  } = props;
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

  let cachedCanvas: OffscreenCanvas;

  if (cacheKey) {
    cachedCanvas = new OffscreenCanvas(canvas.width, canvas.height);
    waveformCache.add(cacheKey, cachedCanvas);
  } else {
    cachedCanvas = canvas;
  }

  const ctx = cachedCanvas.getContext("2d");
  if (!ctx) return;

  const { width, height } = cachedCanvas;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;

  // const [image, pixels, r, g, b] = time("setup pixels", () => {
  const image = ctx.createImageData(width, height);
  const pixels = image.data;

  let { r, g, b } = new Color(color);
  r *= 255;
  g *= 255;
  b *= 255;

  // return [image, pixels, r, g, b];
  // });
  // console.log({ r, g, b });

  const data = buffer.channelData[0];
  const step = Math.floor(viewport.length / width);
  const amp = height / 2;

  // Convert threshold from dBFS to linear amplitude
  const thresholdLinear = Math.pow(10, threshold / 20);
  const attackCoef = Math.exp(-1 / ((attack * buffer.sampleRate) / 1000));
  const releaseCoef = Math.exp(-1 / ((release * buffer.sampleRate) / 1000));

  let gain = 1;

  // ctx.beginPath();
  let lastCompressionEngagedMs: number | null = null;

  const durationInViewportMs =
    (viewport.length / buffer.length) * (buffer.duration * 1000);

  const toLog: Record<string, string | number | boolean | null>[] = [];
  const startMs =
    (viewport.startIndex / buffer.length) * (buffer.duration * 1000);
  let lastFullS = Math.floor(startMs / 1000 - 1);

  for (let i = 0; i < width; i++) {
    let min = Infinity;
    let max = -Infinity;
    const nowMs = startMs + (i / width) * durationInViewportMs;

    for (let j = 0; j < step; j++) {
      const index = i * step + j;
      const sample =
        data[Math.min(index + viewport.startIndex, data.length - 1)];

      if (sample < min) min = sample;
      if (sample > max) max = sample;
    }

    let attackEngaged = false;
    let releaseEngaged = false;
    let compressionEngaged = false;

    [min, max].forEach((sample, sampleI) => {
      const absSample = Math.min(Math.abs(sample), 1);

      const dbInput = 20 * Math.log10(absSample);
      const dbGainReduction =
        dbInput - threshold - (dbInput - threshold) / ratio;

      const compressing = absSample > thresholdLinear;
      compressionEngaged = compressionEngaged || compressing;
      if (compressing) {
        lastCompressionEngagedMs = nowMs;
        // toLog.push({ absSample, thresholdLinear });
      }
      const targetGain = compressing ? Math.pow(10, -dbGainReduction / 20) : 1;

      attackEngaged = attackEngaged || (compressing && gain > targetGain);
      releaseEngaged =
        releaseEngaged ||
        (!compressing &&
          lastCompressionEngagedMs !== null &&
          nowMs - lastCompressionEngagedMs < release);

      const coef = targetGain < gain ? attackCoef : releaseCoef;
      gain = gain * coef + targetGain * (1 - coef);

      if (sampleI === 0) {
        min *= gain;
      } else {
        max *= gain;
      }
    });

    // time("write pixels", () => {
    const y1 = Math.max(0, Math.min(height - 1, Math.round(amp * (1 - min))));
    const y2 = Math.max(0, Math.min(height - 1, Math.round(amp * (1 - max))));

    for (let y = y2; y <= y1; y++) {
      const offset = (y * width + i) * 4;
      pixels[offset] = r;
      pixels[offset + 1] = g;
      pixels[offset + 2] = b;
      pixels[offset + 3] = 255;
    }

    const currentFullS = Math.floor(nowMs / 1000);
    // if (currentFullS > lastFullS) {
    //   lastFullS = currentFullS;

    //   for (let y = height - 8; y <= height - 1; y++) {
    //     for (let xi = 0; xi < 2; xi++) {
    //       const offset = (y * width + i + xi) * 4;
    //       pixels[offset] = 255;
    //       pixels[offset + 1] = 255;
    //       pixels[offset + 2] = 255;
    //       pixels[offset + 3] = 255;
    //     }
    //   }
    // }

    if (compressionEngaged || attackEngaged || releaseEngaged) {
      const envColor = attackEngaged
        ? [255, 127, 100, 255]
        : compressionEngaged
        ? [255, 255, 100, 255]
        : [100, 100, 255, 255];

      for (let y = height - 3; y <= height - 1; y++) {
        for (let xi = 0; xi < 2; xi++) {
          const offset = (y * width + i + xi) * 4;
          pixels[offset] = envColor[0];
          pixels[offset + 1] = envColor[1];
          pixels[offset + 2] = envColor[2];
          pixels[offset + 3] = envColor[3];
        }
      }
    }
    // });

    // if (i === 0) {
    //   ctx.moveTo(i + 0.5, Math.round(amp * (1 + min)) + 0.5);
    // } else {
    //   ctx.lineTo(i + 0.5, Math.round(amp * (1 + min)) + 0.5);
    // }
    // const [x, y] = [i + 0.5, Math.round(amp * (1 + max)) + 0.5];
    // ctx.lineTo(x, y);
  }
  // time("putImageData", () => {
  ctx.putImageData(image, 0, 0);
  if (toLog.length) {
    console.log(toLog);
  }
  // });

  // ctx.stroke();

  if (cacheKey) {
    drawCached(cacheKey);
  }
  // console.timeEnd(label);
  // console.log(timings);
}

function drawPlayState(
  canvas: OffscreenCanvas,
  playState: PlayState,
  buffer: { length: number; duration: number },
  viewport: Viewport
) {
  if (!playState.playing) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { width, height } = canvas;

  const durationInViewport =
    (viewport.length / buffer.length) * buffer.duration;

  // const latencyCompensation = -durationInViewport / 1.5;
  const x =
    Math.round((playState.time / durationInViewport) * width) -
    // latencyCompensation +
    0.5;

  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = "rgba(0, 0, 200, 0.3)";
  ctx.fillRect(0, 0, x, height);

  ctx.globalCompositeOperation = "source-over";
  ctx.beginPath();
  ctx.strokeStyle = "white";
  ctx.lineWidth = 2;
  ctx.moveTo(x, 0);
  ctx.lineTo(x, height);
  ctx.stroke();
}

function drawDbLine(canvas: OffscreenCanvas, db: number, ratio: number) {
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
  ctx.lineTo(width, Math.round(height / 2) + 0.5);
  ctx.stroke();
  ctx.strokeStyle = "red";
  ctx.beginPath();
  ctx.moveTo(0, y - 1);
  ctx.lineTo(width, y);
  ctx.moveTo(0, y2);
  ctx.lineTo(width, y2 + 1);
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

function drawViewport(
  canvas: OffscreenCanvas,
  buffer: ShallowAudioBuffer,
  startIndex: number,
  length: number
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { width, height } = canvas;

  const x = (startIndex / buffer.length) * width;
  const y = 0;
  const w = (length / buffer.length) * width;
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
