import { useEffect, useMemo, useState } from "react";

export default function useUuid(dependencyArray: readonly unknown[] = []) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const uuid = useMemo<string>(() => crypto.randomUUID(), dependencyArray);

  return uuid;
}
