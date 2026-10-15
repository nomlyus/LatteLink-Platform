import { useCallback, useEffect, useRef, useState } from "react";

/** Keep pull-to-refresh independent from background query fetching. */
export function useRefresh(tasks: readonly (() => Promise<unknown>)[]) {
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    void Promise.allSettled(tasksRef.current.map((task) => Promise.resolve().then(task))).finally(() => {
      inFlight.current = false;
      if (mounted.current) setRefreshing(false);
    });
  }, []);

  return { refreshing, refresh };
}
