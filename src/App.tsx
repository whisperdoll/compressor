import { useEffect, useRef, useState } from "react";
import "./App.scss";
import AudioWaveform, { Viewport } from "./components/AudioWaveform";
import FileUpload from "./components/FileUpload";
import Knob from "./components/Knob";
import GoogleIcon from "./components/GoogleIcon";
import { renderBuffer } from "./audio";
import { drawSamples } from "./drawing";
import createWav from "./wav";

export interface PlayState {
  playing: boolean;
  time: number;
  currentlyPreviewing: "compressed" | "uncompressed" | null;
}

function App() {
  const [files, setFiles] = useState<FileList | null>(null);
  const [threshold, setThreshold] = useState(0);
  const [ratio, setRatio] = useState(2);
  const [attack, setAttack] = useState(0.2);
  const [release, setRelease] = useState(200);
  const [viewport, setViewport] = useState<Viewport>({
    startIndex: 0,
    length: 0,
  });
  const [playState, setPlayState] = useState<PlayState>({
    playing: false,
    time: 0,
    currentlyPreviewing: "uncompressed",
  });
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const _audioContextRef = useRef<AudioContext | null>(null);
  const uncompressedBufferSrc = useRef<AudioBufferSourceNode | null>(null);
  const compressedBufferSrc = useRef<AudioBufferSourceNode | null>(null);
  const currentSource = useRef<AudioBufferSourceNode | null>(null);
  const animationFrame = useRef<number>(0);
  const startTime = useRef<number>(0);
  const [normalizeGain, setNormalizeGain] = useState(true);
  const renderedWaveformsContainerRef = useRef<HTMLDivElement>(null);

  const audioContext: () => React.MutableRefObject<AudioContext> = () => {
    if (!_audioContextRef.current)
      _audioContextRef.current = new AudioContext();
    return _audioContextRef as React.MutableRefObject<AudioContext>;
  };

  const loadBuffer = async () => {
    if (!files?.length) return;
    const file = files[0];

    setAudioBuffer(null);
    const buffer = await file.arrayBuffer();
    const decodedBuffer = await audioContext().current.decodeAudioData(buffer);

    setViewport({
      startIndex: 0,
      length: decodedBuffer.length / 3,
    });

    setAudioBuffer(decodedBuffer);
  };

  useEffect(() => {
    loadBuffer();
  }, [files]);

  const readyToPlay = !!(files?.length && audioBuffer);

  function stop() {
    currentSource.current?.stop();
    compressedBufferSrc.current?.disconnect();
    uncompressedBufferSrc.current?.disconnect();
    setPlayState({
      currentlyPreviewing: null,
      playing: false,
      time: 0,
    });
    cancelAnimationFrame(animationFrame.current);
  }

  function updateSeekPosition() {
    setPlayState((old) => {
      if (!currentSource.current || !old.playing) return old;

      return {
        ...old,
        time: currentSource.current.context.currentTime - startTime.current,
      };
    });

    animationFrame.current = requestAnimationFrame(updateSeekPosition);
  }

  function playUncompressed() {
    if (!readyToPlay || !audioRef.current) return;

    if (playState.playing) {
      stop();
    }

    const uncompressed = renderBuffer(
      audioBuffer,
      viewport,
      0,
      1,
      0,
      0,
      normalizeGain
    );

    if (renderedWaveformsContainerRef.current) {
      renderedWaveformsContainerRef.current.innerHTML = "";
      for (let i = 0; i < uncompressed.numberOfChannels; i++) {
        const newCanvas = document.createElement("canvas");
        newCanvas.height = 200;
        newCanvas.width = 800;
        drawSamples(
          newCanvas,
          Array.from(uncompressed.getChannelData(i)),
          newCanvas.width
        );
        const label = document.createElement("div");
        label.innerText = `Uncompressed Channel ${i}`;
        const container = document.createElement("div");
        container.appendChild(label);
        container.appendChild(newCanvas);
        renderedWaveformsContainerRef.current?.appendChild(container);
      }
    }

    uncompressedBufferSrc.current = currentSource.current =
      audioContext().current.createBufferSource();
    uncompressedBufferSrc.current.buffer = uncompressed;
    uncompressedBufferSrc.current.connect(audioContext().current.destination);

    uncompressedBufferSrc.current.onended = () => {
      stop();
    };

    setTimeout(() => {
      startTime.current = audioContext().current.currentTime;
      uncompressedBufferSrc.current!.start();

      setPlayState({
        playing: true,
        time: 0,
        currentlyPreviewing: "uncompressed",
      });

      updateSeekPosition();
    });
  }

  function playCompressed() {
    if (!readyToPlay || !audioRef.current) return;

    if (playState.playing) {
      stop();
    }

    const compressed = renderBuffer(
      audioBuffer,
      viewport,
      threshold,
      ratio,
      attack,
      release,
      normalizeGain
    );

    if (renderedWaveformsContainerRef.current) {
      renderedWaveformsContainerRef.current.innerHTML = "";
      for (let i = 0; i < compressed.numberOfChannels; i++) {
        const newCanvas = document.createElement("canvas");
        newCanvas.height = 200;
        newCanvas.width = 800;
        drawSamples(
          newCanvas,
          Array.from(compressed.getChannelData(i)),
          newCanvas.width
        );
        const label = document.createElement("div");
        label.innerText = `Compressed Channel ${i}`;
        const container = document.createElement("div");
        container.appendChild(label);
        container.appendChild(newCanvas);
        renderedWaveformsContainerRef.current?.appendChild(container);
      }
    }

    compressedBufferSrc.current = currentSource.current =
      audioContext().current.createBufferSource();
    compressedBufferSrc.current.buffer = compressed;
    compressedBufferSrc.current.connect(audioContext().current.destination);

    compressedBufferSrc.current.onended = () => {
      stop();
    };

    setTimeout(() => {
      startTime.current = audioContext().current.currentTime;
      compressedBufferSrc.current!.start();

      setPlayState({
        playing: true,
        time: 0,
        currentlyPreviewing: "compressed",
      });

      updateSeekPosition();
    });
  }

  function exportCompressed() {
    if (!audioBuffer) return;

    const compressed = renderBuffer(
      audioBuffer,
      viewport,
      threshold,
      ratio,
      attack,
      release,
      normalizeGain
    );

    console.log(audioBuffer.sampleRate);

    const wav = createWav(compressed);

    const blob = new Blob([wav], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${files?.[0].name || "audio"}.wav`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const playingCompressed =
    playState.playing && playState.currentlyPreviewing === "compressed";
  const playingUncompressed =
    playState.playing && playState.currentlyPreviewing === "uncompressed";

  return (
    <>
      <div className="container">
        <FileUpload onUpload={setFiles} />
        {files && files[0] && (
          <>
            <div className="controls">
              <Knob
                label="Threshold"
                min={-40}
                max={0}
                value={threshold}
                onChange={setThreshold}
                step={0.1}
              />
              <Knob
                label="Ratio"
                min={1}
                max={20}
                value={ratio}
                onChange={setRatio}
                step={0.1}
              />
              <Knob
                label="Attack (ms)"
                min={0}
                max={20}
                value={attack}
                onChange={setAttack}
                step={0.1}
              />
              <Knob
                label="Release (ms)"
                min={0}
                max={500}
                value={release}
                onChange={setRelease}
                step={0.1}
              />
            </div>
            <AudioWaveform
              viewport={viewport}
              onViewportChange={setViewport}
              file={files[0]}
              threshold={threshold}
              ratio={ratio}
              attack={attack}
              release={release}
              audioBuffer={audioBuffer}
              playState={playState}
            />
            {readyToPlay && (
              <div className="col gap-2">
                <button
                  className="row gap-1"
                  onClick={playingUncompressed ? stop : playUncompressed}
                >
                  {playingUncompressed ? (
                    <>
                      <GoogleIcon icon="stop" /> Stop
                    </>
                  ) : (
                    <>
                      <GoogleIcon icon="play_arrow" /> Play Original (
                      {Math.round(
                        (viewport.length / audioBuffer.length) *
                          audioBuffer.duration
                      )}
                      s)
                    </>
                  )}
                </button>
                <button
                  className="row gap-1"
                  onClick={playingCompressed ? stop : playCompressed}
                >
                  {playingCompressed ? (
                    <>
                      <GoogleIcon icon="stop" /> Stop
                    </>
                  ) : (
                    <>
                      <GoogleIcon icon="play_arrow" /> Play Compressed (
                      {Math.round(
                        (viewport.length / audioBuffer.length) *
                          audioBuffer.duration
                      )}
                      s)
                    </>
                  )}
                </button>
                <div className="row gap-1">
                  <label className="pointer checkboxLabel">
                    <input
                      type="checkbox"
                      checked={normalizeGain}
                      onChange={(e) =>
                        setNormalizeGain(e.currentTarget.checked)
                      }
                    ></input>
                    <span>Normalize Gain</span>
                  </label>{" "}
                  <span
                    className="hint"
                    title="When playing either version, scale the volume up as much as possible without clipping."
                  >
                    (?)
                  </span>
                </div>
                <audio ref={audioRef} />
                <div
                  className="renderedWaveformsContainer"
                  ref={renderedWaveformsContainerRef}
                ></div>
                <button onClick={exportCompressed}>
                  <GoogleIcon icon="save" /> Export Compressed
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

export default App;
