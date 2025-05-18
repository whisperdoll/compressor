import { useEffect, useRef } from "react";

export default function useCancellableEffect(
  fn: (
    shouldCancel: React.MutableRefObject<boolean>,
    cancel: () => void
  ) => (() => void) | void,
  deps?: any[]
) {
  const shouldCancel = useRef(false);
  const cancel = () => (shouldCancel.current = true);

  useEffect(() => {
    shouldCancel.current = false;
    const cleanup = fn(shouldCancel, cancel);

    return () => {
      cancel();
      cleanup && cleanup();
    };
  }, deps);
}
