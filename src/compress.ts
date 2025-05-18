const clamp = (n: number, min: number, max: number): number => {
  return n < min ? min : n > max ? max : n;
};

type ArrayLike = { length: number; [key: number]: number };

function getRMS(samples: ArrayLike, i: number, windowSize: number = 5) {
  let sum = 0;
  let count = 0;
  for (
    let j = -Math.floor(windowSize / 2);
    j <= Math.floor(windowSize / 2);
    j++
  ) {
    const idx = i + j;
    if (idx >= 0 && idx < samples.length) {
      sum += Math.pow(samples[idx], 2);
      count++;
    }
  }
  return Math.sqrt(sum / count);
}

export default function compress(
  samples: ArrayLike,
  opts: {
    sampleRate: number;
    thresholdDb: number;
    ratio: number;
    attackMs: number;
    releaseMs: number;
    onSample?: (sample: number) => number | void;
  }
): number[] {
  const { sampleRate, thresholdDb, ratio, attackMs, releaseMs, onSample } =
    opts;

  const thresholdLinear = Math.pow(10, thresholdDb / 20);
  const attackCoef = Math.exp(-1 / ((sampleRate * attackMs) / 1000));
  const releaseCoef = Math.exp(-1 / ((sampleRate * releaseMs) / 1000));

  let gain = 1;
  const ret: number[] = Array(samples.length).fill(0);

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];

    const absSample = Math.abs(sample);

    const dbInput = 20 * Math.log10(absSample);
    const dbGainReduction =
      dbInput - thresholdDb - (dbInput - thresholdDb) / ratio;

    const targetGain =
      absSample > thresholdLinear ? Math.pow(10, -dbGainReduction / 20) : 1;

    const coef = targetGain < gain ? attackCoef : releaseCoef;
    gain = gain * coef + targetGain * (1 - coef);

    ret[i] = clamp(sample * gain, -1, 1);
  }

  return ret;
}
