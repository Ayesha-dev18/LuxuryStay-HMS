import { useCallback, useEffect, useRef, useState } from "react";

// Loads data when the component mounts and whenever a dependency changes.
// Stale responses (from an earlier dependency value) are ignored.
export function useLoad(loader, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: "" });
  const loaderRef = useRef(loader);
  const runRef = useRef(0);

  useEffect(() => {
    loaderRef.current = loader;
  });

  const run = useCallback(async ({ silent = false } = {}) => {
    const id = ++runRef.current;
    if (!silent) setState((current) => ({ ...current, loading: true, error: "" }));

    try {
      const data = await loaderRef.current();
      if (id === runRef.current) setState({ data, loading: false, error: "" });
    } catch (error) {
      if (error?.name === "AbortError" || id !== runRef.current) return;
      // A 401 is handled globally by returning to the sign-in page.
      setState((current) => ({
        data: silent ? current.data : null,
        loading: false,
        error: error.message || "Unable to load this information.",
      }));
    }
  }, []);

  useEffect(() => {
    run();
    return () => {
      runRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, reload: run, refresh: () => run({ silent: true }) };
}

// Returns a value that only changes after the input has been still for a moment.
export function useDebounced(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

// Wraps an async action with a busy flag so buttons can disable themselves
// and a second click cannot start the action again.
export function useAction() {
  const [busy, setBusy] = useState("");
  const busyRef = useRef("");

  const run = useCallback(async (key, action) => {
    if (busyRef.current) return undefined;
    busyRef.current = key;
    setBusy(key);
    try {
      return await action();
    } finally {
      busyRef.current = "";
      setBusy("");
    }
  }, []);

  return { busy, run };
}

export function useClickOutside(ref, onOutside, active = true) {
  useEffect(() => {
    if (!active) return undefined;

    const onPointer = (event) => {
      if (ref.current && !ref.current.contains(event.target)) onOutside();
    };
    const onKey = (event) => {
      if (event.key === "Escape") onOutside();
    };

    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, onOutside, active]);
}
