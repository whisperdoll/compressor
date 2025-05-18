import { Viewport } from "./components/AudioWaveform";
import compress from "./compress";

export function renderBuffer(
  source: AudioBuffer,
  viewport: Viewport,
  threshold: number,
  ratio: number,
  attack: number,
  release: number
): AudioBuffer {
  const buffer = new AudioBuffer({
    length: viewport.length,
    sampleRate: source.sampleRate,
    numberOfChannels: source.numberOfChannels,
  });

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

    buffer.copyToChannel(new Float32Array(compressed), channel);
  }
  return buffer;
}
