import { useCallback, useEffect, useRef } from "react";
import "./Knob.scss";
import useUuid from "../hooks/useUuid";

interface Props {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  minHint?: number;
  maxHint?: number;
  step?: number;
  label?: string;
}

const tryParseFloat = (n: string, fallback: number) => {
  const parsed = parseFloat(n);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return parsed;
};

// remap(-1, [-1, 1], [0, 100]) === 0
// remap(0, [-1, 1], [0, 100]) === 50
const remap = (
  n: number,
  ogRange: [number, number],
  newRange: [number, number]
) => {
  const ogRangeMagnitude = ogRange[1] - ogRange[0];
  const newRangeMagnitude = newRange[1] - newRange[0];
  const pc = (n - ogRange[0]) / ogRangeMagnitude;
  return newRange[0] + newRangeMagnitude * pc;
};

export default function Knob({
  value,
  onChange,
  min,
  max,
  minHint,
  maxHint,
  step = 1,
  label,
}: Props) {
  const displayMin = min ?? minHint ?? 0;
  const displayMax = max ?? maxHint ?? 100;
  const displayRange = displayMax - displayMin;
  const mouseDown = useRef(false);
  const rotateFactor = 100;
  const id = useUuid();
  const knobRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: PointerEvent) => {
      if (!mouseDown.current) return;
      e.preventDefault();

      let movement = -e.movementY;
      if (e.ctrlKey) {
        movement /= 10;
      }
      let newValue = value + movement * (displayRange / rotateFactor);
      newValue = Math.round(newValue * 1000) / 1000;

      if (typeof min === "number") {
        newValue = Math.max(newValue, min);
      }
      if (typeof max === "number") {
        newValue = Math.min(newValue, max);
      }
      onChange(newValue);
    };

    const handleMouseUp = () => {
      mouseDown.current = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (mouseDown.current) {
        e.preventDefault();
      }
    };

    const handleMouseDown = (e: TouchEvent | MouseEvent) => {
      e.preventDefault();
      mouseDown.current = true;
    };

    knobRef.current?.addEventListener("mousedown", handleMouseDown);
    knobRef.current?.addEventListener("touchstart", handleMouseDown);
    document.addEventListener("pointermove", handleMouseMove, {
      passive: false,
    });
    document.addEventListener("pointerup", handleMouseUp);
    document.addEventListener("touchmove", handleTouchMove, { passive: false });

    return () => {
      document.removeEventListener("pointermove", handleMouseMove);
      document.removeEventListener("pointerup", handleMouseUp);
      document.removeEventListener("touchmove", handleTouchMove);
      knobRef.current?.removeEventListener("mousedown", handleMouseDown);
      knobRef.current?.removeEventListener("touchstart", handleMouseDown);
    };
  }, [mouseDown, onChange, step, value, min, max, rotateFactor, displayRange]);

  const start = 1 / 3;
  const end = 7 / 6;

  const valuePolar =
    start + ((value - displayMin) / (displayMax - displayMin)) * (end - start);

  return (
    <div className="knobContainer">
      {label && <div>{label}</div>}
      <div className="knob" ref={knobRef}>
        <div
          className="handle"
          style={{
            left: `${
              remap(Math.cos(valuePolar * Math.PI * 2), [-1, 1], [0, 60]) + 20
            }%`,
            top: `${
              remap(Math.sin(valuePolar * Math.PI * 2), [-1, 1], [0, 60]) + 20
            }%`,
          }}
        ></div>
        <div
          className="mark"
          style={{
            left: `${
              remap(Math.cos((1 / 3) * Math.PI * 2), [-1, 1], [0, 120]) - 10
            }%`,
            top: `${
              remap(Math.sin((1 / 3) * Math.PI * 2), [-1, 1], [0, 120]) - 10
            }%`,
          }}
        ></div>
        <div
          className="mark"
          style={{
            left: `${
              remap(Math.cos((1 / 6) * Math.PI * 2), [-1, 1], [0, 120]) - 10
            }%`,
            top: `${
              remap(Math.sin((1 / 6) * Math.PI * 2), [-1, 1], [0, 120]) - 10
            }%`,
          }}
        ></div>
      </div>
      <input
        id={id}
        value={value}
        type="number"
        onChange={(e) => onChange(tryParseFloat(e.currentTarget.value, 0))}
      />
    </div>
  );
}
