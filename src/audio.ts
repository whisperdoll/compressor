import { Viewport } from "./components/AudioWaveform";
import compress from "./compress";

export function renderBuffer(
  source: AudioBuffer,
  viewport: Viewport,
  threshold: number,
  ratio: number,
  attack: number,
  release: number,
  normalizeGain?: boolean
): AudioBuffer {
  const buffer = new AudioBuffer({
    length: viewport.length,
    sampleRate: source.sampleRate,
    numberOfChannels: source.numberOfChannels,
  });

  let max = 0;
  const channels: number[][] = [];

  for (let channel = 0; channel < source.numberOfChannels; channel++) {
    const data = source
      .getChannelData(channel)
      .subarray(viewport.startIndex, viewport.startIndex + viewport.length);

    const compressed = compress(data, {
      sampleRate: source.sampleRate,
      thresholdDb: threshold,
      ratio,
      attackMs: attack,
      releaseMs: release,
    });

    compressed.forEach((sample) => {
      if (Math.abs(sample) > max) {
        max = Math.abs(sample);
      }
    });

    channels.push(compressed);
  }

  if (normalizeGain) {
    const gainNormalizationFactor = 1 / max;

    for (let channel = 0; channel < source.numberOfChannels; channel++) {
      const data = channels[channel];
      for (let i = 0; i < data.length; i++) {
        data[i] *= gainNormalizationFactor;
      }
    }
  }

  for (let channel = 0; channel < source.numberOfChannels; channel++) {
    buffer.copyToChannel(new Float32Array(channels[channel]), channel);
  }

  return buffer;
}
