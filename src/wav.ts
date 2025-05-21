export default function createWav(audioBuffer: AudioBuffer) {
  const bitsPerSample = 16;

  const subchunk1Size = 16;
  const subchunk2Size =
    audioBuffer.length * audioBuffer.numberOfChannels * (bitsPerSample / 8);

  const filesize = 12 + (8 + subchunk1Size) + (8 + subchunk2Size);

  const buffer = new ArrayBuffer(filesize);
  const view = new DataView(buffer);

  /// RIFF header
  // ChunkID
  view.setUint32(0, 0x52494646, false); // "RIFF"
  // ChunkSize
  view.setUint32(4, filesize - 8, true); // size of the file - 8 (since these first two are 4 bytes each)
  // Format
  view.setUint32(8, 0x57415645, false); // "WAVE"

  /// subchunk 1
  // Subchunk1ID
  view.setUint32(12, 0x666d7420, false); // "fmt "
  // Subchunk1Size
  view.setUint32(16, subchunk1Size, true);
  // AudioFormat
  view.setUint16(20, 1, true); // 1 = PCM
  // NumChannels
  view.setUint16(22, audioBuffer.numberOfChannels, true);
  // SampleRate
  view.setUint32(24, audioBuffer.sampleRate, true);
  // ByteRate
  view.setUint32(
    28,
    audioBuffer.sampleRate * audioBuffer.numberOfChannels * (bitsPerSample / 8),
    true
  );
  // BlockAlign
  view.setUint16(32, audioBuffer.numberOfChannels * (bitsPerSample / 8), true);
  // BitsPerSample
  view.setUint16(34, bitsPerSample, true);

  /// subchunk 2 (data)
  // Subchunk2ID
  view.setUint32(36, 0x64617461, false); // "data"
  // Subchunk2Size
  view.setUint32(40, subchunk2Size, false); // "data"
  // Data
  let byteIndex = 44;
  const channelData: Float32Array[] = [];

  for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
    channelData.push(audioBuffer.getChannelData(i));
  }

  for (let sampleIndex = 0; sampleIndex < audioBuffer.length; sampleIndex++) {
    for (
      let channelIndex = 0;
      channelIndex < audioBuffer.numberOfChannels;
      channelIndex++
    ) {
      const floatValue = channelData[channelIndex][sampleIndex];
      const intValue = Math.round(floatValue * 32767);
      view.setInt16(byteIndex, intValue, true);
      byteIndex += 2;
    }
  }

  return buffer;
}
