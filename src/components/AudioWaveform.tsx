import React, { useCallback, useEffect, useMemo, useRef } from "react";
import "./AudioWaveform.scss";
import { clamp, MaybeWrapped } from "../utils";
import { PlayState } from "../App";
import DrawWorker from "../workers/compressionWorker?worker";
import { MessageData } from "../workers/compressionWorker";
import { clearCanvas, drawViewport } from "../drawing";

export interface Viewport {
  startIndex: number;
  length: number;
}

interface Props {
  file: File;
  threshold: number;
  ratio: number;
  attack: number;
  release: number;
  viewport: Viewport;
  onViewportChange: (
    viewport: Viewport | ((old: Viewport) => Viewport)
  ) => void;
  audioBuffer: AudioBuffer | null;
  playState: PlayState;
}

const AudioWaveform: React.FC<Props> = ({
  file,
  threshold,
  ratio,
  attack,
  release,
  viewport,
  onViewportChange: setViewport,
  audioBuffer,
  playState,
}) => {
  const fullCanvasRef = useRef<HTMLCanvasElement>(null);
  const fullOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrame = useRef<number | null>(null);
  const cacheSalt = useRef<number>(0);
  const audioBufferLength = useRef<number>(0);
  const transferredCanvases = useRef(false);

  const previewCanvasMouseDown = useRef(false);
  const fullCanvasMouseDown = useRef(false);
  const fullCanvasAction = useRef<
    "draggingStartBoundary" | "draggingEndBoundary" | "moving" | "none"
  >("none");
  const fullCanvasLastPoint = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const previewCanvasLastPoint = useRef<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const fullCanvasOriginalPoint = useRef<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const previewCanvasOriginalPoint = useRef<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const fullCanvasOriginalViewport = useRef<typeof viewport>(viewport);
  const previewCanvasOriginalViewport = useRef<typeof viewport>(viewport);
  const drawCallsPerSecond = 30;
  const lastDrawCallTime = useRef(0);
  const drawCallBuffer = useRef<MaybeWrapped<MessageData>>([]);
  const drawTimeout = useRef(0);

  const worker = useMemo(() => {
    return new DrawWorker();
  }, []);

  const postWorkerMessage = useCallback(
    (message: MaybeWrapped<MessageData>, transfer?: Transferable[]) => {
      if (!transfer) {
        worker.postMessage(message);
      } else {
        worker.postMessage(message, transfer);
      }
    },
    [worker]
  );

  useEffect(() => {
    if (
      !previewCanvasRef.current ||
      !fullCanvasRef.current ||
      transferredCanvases.current
    )
      return;

    transferredCanvases.current = true;

    const transfers = {
      previewCanvas: previewCanvasRef.current.transferControlToOffscreen(),
      fullCanvas: fullCanvasRef.current.transferControlToOffscreen(),
    };

    postWorkerMessage(
      {
        action: "registerCanvases",
        payload: transfers,
      },
      Object.values(transfers)
    );
  }, [postWorkerMessage]);

  const render = useCallback(() => {
    if (
      !fullCanvasRef.current ||
      !previewCanvasRef.current ||
      !fullOverlayCanvasRef.current ||
      !audioBuffer
    ) {
      animationFrame.current = requestAnimationFrame(render);
      return;
    }

    clearCanvas(fullOverlayCanvasRef.current);
    drawViewport(
      fullOverlayCanvasRef.current,
      audioBuffer,
      viewport.startIndex,
      viewport.length
    );

    //   action: "drawViewport",
    //   payload: {
    //     canvas: "fullCanvas",
    //     buffer: "audioBuffer",
    //     startIndex: viewport.startIndex,
    //     length: viewport.length,
    //   },
    // },

    const innerColor = "#ffcbfc";
    const outerColor = "#b26cc6";

    // if (!cachedWaveCanvasRef.current) {
    //   cachedWaveCanvasRef.current = document.createElement("canvas");
    //   cachedWaveCanvasRef.current.width = Math.min(
    //     audioBuffer.length,
    //     32767
    //   );
    //   cachedWaveCanvasRef.current.height = 255;
    //   previewCanvasRef.current.parentElement!.appendChild(
    //     cachedWaveCanvasRef.current
    //   );
    // }

    // if (invalidateCache.current) {
    //   invalidateCache.current = false;
    //   drawWaveform(
    //     "cache",
    //     cachedWaveCanvasRef.current,
    //     audioBuffer,
    //     { startIndex: 0, length: audioBuffer.length },
    //     outerColor,
    //     0,
    //     1,
    //     0,
    //     0
    //   );
    // }

    const drawCallData: MessageData[] = [
      // {
      //   action: "abortCurrentOperations",
      // },
      {
        action: "clearCanvas",
        payload: {
          canvas: "fullCanvas",
        },
      },
      {
        action: "drawWaveform",
        payload: {
          label: "mini background",
          canvas: "fullCanvas",
          buffer: "audioBuffer",
          viewport: { startIndex: 0, length: audioBufferLength.current },
          color: outerColor,
          threshold: 0,
          ratio: 1,
          attack: 0,
          release: 0,
          cacheKey: [file.name, cacheSalt.current].join(","),
        },
      },
      {
        action: "drawWaveform",
        payload: {
          label: "mini foreground",
          canvas: "fullCanvas",
          buffer: "audioBuffer",
          viewport: { startIndex: 0, length: audioBufferLength.current },
          color: innerColor,
          threshold,
          ratio,
          attack,
          release,
          cacheKey: [
            file.name,
            threshold,
            ratio,
            attack,
            release,
            cacheSalt.current,
          ].join(", "),
        },
      },
      {
        action: "clearCanvas",
        payload: {
          canvas: "previewCanvas",
        },
      },

      {
        action: "drawWaveform",
        payload: {
          label: "preview background",
          canvas: "previewCanvas",
          buffer: "audioBuffer",
          viewport,
          color: outerColor,
          threshold: 0,
          ratio: 1,
          attack: 0,
          release: 0,
          cacheKey: [
            file.name,
            viewport.length,
            viewport.startIndex,
            cacheSalt.current,
          ].join(", "),
        },
      },
      {
        action: "drawWaveform",
        payload: {
          label: "preview foreground",
          canvas: "previewCanvas",
          buffer: "audioBuffer",
          viewport,
          color: innerColor,
          threshold,
          ratio,
          attack,
          release,
          cacheKey: [
            file.name,
            threshold,
            ratio,
            attack,
            release,
            viewport.length,
            viewport.startIndex,
            cacheSalt,
          ].join(", "),
        },
      },
      {
        action: "drawDbLine",
        payload: {
          canvas: "previewCanvas",
          db: threshold,
          ratio,
        },
      },
      // {
      //   action: "drawViewport",
      //   payload: {
      //     canvas: "fullCanvas",
      //     buffer: "audioBuffer",
      //     startIndex: viewport.startIndex,
      //     length: viewport.length,
      //   },
      // },
      {
        action: "drawPlayState",
        payload: {
          playState,
          canvas: "previewCanvas",
          buffer: "audioBuffer",
          viewport,
        },
      },
      {
        action: "flushCanvas",
        payload: {
          canvas: "previewCanvas",
        },
      },
      {
        action: "flushCanvas",
        payload: {
          canvas: "fullCanvas",
        },
      },
    ];

    clearTimeout(drawTimeout.current);

    const now = performance.now();
    const nextAllowedDrawTime =
      lastDrawCallTime.current + 1000 / drawCallsPerSecond;
    if (now < nextAllowedDrawTime) {
      drawCallBuffer.current = drawCallData;
      drawTimeout.current = setTimeout(render, nextAllowedDrawTime - now);
    } else {
      postWorkerMessage(drawCallData);
      lastDrawCallTime.current = now;
    }

    animationFrame.current = null;
  }, [
    attack,
    audioBuffer,
    file.name,
    playState,
    postWorkerMessage,
    ratio,
    release,
    threshold,
    viewport,
  ]);

  useEffect(() => {
    if (!audioBuffer) return;

    cacheSalt.current++;
    audioBufferLength.current = audioBuffer.length;

    postWorkerMessage({
      action: "registerAudioBuffers",
      payload: {
        audioBuffer: {
          channelData: Array(audioBuffer.numberOfChannels)
            .fill(0)
            .map((_, i) => audioBuffer.getChannelData(i)),
          duration: audioBuffer.duration,
          length: audioBuffer.length,
          sampleRate: audioBuffer.sampleRate,
        },
      },
    });
  }, [audioBuffer, postWorkerMessage]);

  useEffect(() => {
    if (animationFrame.current) cancelAnimationFrame(animationFrame.current);

    animationFrame.current = requestAnimationFrame(render);
  }, [
    file.name,
    audioBuffer,
    threshold,
    ratio,
    attack,
    release,
    viewport.startIndex,
    viewport.length,
    playState.playing,
    playState.time,
    render,
  ]);

  useEffect(() => {
    const c = fullCanvasRef.current;
    const p = previewCanvasRef.current;
    const o = fullOverlayCanvasRef.current;
    if (!c || !p || !o || !audioBuffer) return;

    function isInViewport(canvasBounds: DOMRect, x: number) {
      const viewportStart =
        (viewport.startIndex / audioBuffer!.length) * canvasBounds.width;
      const viewportEnd =
        ((viewport.startIndex + viewport.length) / audioBuffer!.length) *
        canvasBounds.width;

      return x >= viewportStart && x <= viewportEnd;
    }

    function isInDragZone(canvasBounds: DOMRect, x: number) {
      const dragZoneLength = 8;

      const viewportStart =
        (viewport.startIndex / audioBuffer!.length) * canvasBounds.width;

      const inStart =
        x >= viewportStart - dragZoneLength / 2 &&
        x <= viewportStart + dragZoneLength / 2;

      if (inStart) return "start";

      const viewportEnd =
        ((viewport.startIndex + viewport.length) / audioBuffer!.length) *
        canvasBounds.width;

      const inEnd =
        x >= viewportEnd - dragZoneLength / 2 &&
        x <= viewportEnd + dragZoneLength / 2;

      if (inEnd) return "end";

      return false;
    }

    function onMove(e: PointerEvent) {
      // if (!isDown) return;
      if (!o) return;

      const canvasBounds = o.getBoundingClientRect();
      const mouseX = e.clientX - canvasBounds.x;
      const mouseY = e.clientY - canvasBounds.y;

      if (!fullCanvasMouseDown.current) {
        if (isInDragZone(canvasBounds, mouseX)) {
          console.log(isInDragZone(canvasBounds, mouseX));
          o.style.cursor = "ew-resize";
        } else if (isInViewport(canvasBounds, mouseX)) {
          o.style.cursor = "move";
        } else {
          o.style.cursor = "";
        }
      } else if (fullCanvasAction.current === "draggingStartBoundary") {
        const normalizedAmount = mouseX / canvasBounds.width;
        setViewport((old) => {
          const startIndex = Math.max(
            Math.round(normalizedAmount * audioBuffer!.length),
            0
          );

          return {
            startIndex,
            length: old.length + (old.startIndex - startIndex),
          };
        });
      } else if (fullCanvasAction.current === "draggingEndBoundary") {
        const normalizedAmount = mouseX / canvasBounds.width;
        setViewport((old) => {
          const endIndex = Math.min(
            Math.round(normalizedAmount * audioBuffer!.length),
            audioBuffer!.length
          );

          return {
            startIndex: old.startIndex,
            length: endIndex - old.startIndex,
          };
        });
      } else if (fullCanvasAction.current === "moving") {
        const deltaX = fullCanvasOriginalPoint.current.x - mouseX;
        const normalizedDeltaX = deltaX / canvasBounds.width;
        const deltaIndex = Math.round(normalizedDeltaX * audioBuffer!.length);
        setViewport((old) => ({
          startIndex: Math.min(
            Math.max(
              fullCanvasOriginalViewport.current.startIndex - deltaIndex,
              0
            ),
            audioBuffer!.length - old.length
          ),
          length: old.length,
        }));
      }

      fullCanvasLastPoint.current = { x: mouseX, y: mouseY };
    }

    function onDown(e: PointerEvent) {
      const canvasBounds = o!.getBoundingClientRect();
      const mouseX = e.clientX - canvasBounds.x;
      const mouseY = e.clientY - canvasBounds.y;
      let dragZone: ReturnType<typeof isInDragZone>;
      fullCanvasMouseDown.current = true;
      fullCanvasLastPoint.current = { x: mouseX, y: mouseY };
      fullCanvasOriginalPoint.current = { x: mouseX, y: mouseY };
      fullCanvasOriginalViewport.current = viewport;

      if ((dragZone = isInDragZone(canvasBounds, mouseX))) {
        fullCanvasAction.current =
          dragZone === "start"
            ? "draggingStartBoundary"
            : "draggingEndBoundary";
      } else if (isInViewport(canvasBounds, mouseX)) {
        fullCanvasAction.current = "moving";
      } else {
        fullCanvasAction.current = "none";
      }
    }

    function onUp() {
      fullCanvasMouseDown.current = false;
      previewCanvasMouseDown.current = false;
    }

    function onWheel(e: WheelEvent) {
      const canvasBounds = o!.getBoundingClientRect();
      const mouseX = e.clientX - canvasBounds.x;
      // const mouseY = e.clientY - canvasBounds.y;

      if (e.shiftKey) {
        const panAmount = e.deltaY * 0.001 * viewport.length;
        setViewport((old) => ({
          startIndex: clamp(
            old.startIndex - panAmount,
            0,
            audioBuffer!.length + old.length
          ),
          length: old.length,
        }));
      } else {
        const newLength = clamp(
          viewport.length * (1 - (1 / -e.deltaY) * 10),
          0,
          audioBuffer!.length
        );
        const pc = mouseX / canvasBounds.width;

        setViewport((old) => ({
          startIndex: clamp(
            old.startIndex + (old.length - newLength) * pc,
            0,
            audioBuffer!.length - newLength
          ),
          length: newLength,
        }));
      }
    }

    function onPreviewDown(e: PointerEvent) {
      const canvasBounds = p!.getBoundingClientRect();
      const mouseX = e.clientX - canvasBounds.x;
      const mouseY = e.clientY - canvasBounds.y;

      previewCanvasOriginalPoint.current = { x: mouseX, y: mouseY };
      previewCanvasLastPoint.current = { x: mouseX, y: mouseY };
      previewCanvasOriginalViewport.current = viewport;
      previewCanvasMouseDown.current = true;
    }

    function onPreviewMove(e: PointerEvent) {
      if (!previewCanvasMouseDown.current) return;

      const canvasBounds = p!.getBoundingClientRect();
      const mouseX = e.clientX - canvasBounds.x;
      const mouseY = e.clientY - canvasBounds.y;

      const deltaX = -(previewCanvasLastPoint.current.x - mouseX);
      const normalizedDeltaX = deltaX / canvasBounds.width;
      const deltaIndex = Math.round(normalizedDeltaX * viewport.length);

      setViewport((old) => ({
        startIndex: clamp(
          old.startIndex - deltaIndex,
          0,
          audioBuffer!.length - old.length
        ),
        length: old.length,
      }));

      previewCanvasLastPoint.current = { x: mouseX, y: mouseY };
    }

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointermove", onPreviewMove);
    o.addEventListener("pointerdown", onDown);
    p.addEventListener("pointerdown", onPreviewDown);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    p.addEventListener("wheel", onWheel);

    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointermove", onPreviewMove);
      o.removeEventListener("pointerdown", onDown);
      p.removeEventListener("pointerdown", onPreviewDown);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      p.removeEventListener("wheel", onWheel);
    };
  }, [
    audioBuffer,
    setViewport,
    viewport,
    viewport.length,
    viewport.startIndex,
  ]);

  return (
    <div className="audioWaveform">
      <canvas className="full" ref={fullCanvasRef} width={1600} height={50} />
      <canvas
        className="fullOverlay"
        ref={fullOverlayCanvasRef}
        width={1600}
        height={50}
      />
      <canvas
        className="preview"
        ref={previewCanvasRef}
        width={1600}
        height={200}
      />
    </div>
  );
};

export default AudioWaveform;
