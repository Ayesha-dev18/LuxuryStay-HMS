import { useRef } from "react";

// A gentle perspective tilt that follows the pointer, for decorative imagery
// only. Touch screens and people who ask for reduced motion get a still image;
// nothing here affects layout or what can be clicked.
const canTilt = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(hover: hover) and (pointer: fine)").matches &&
  !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function Tilt({ as: Tag = "div", max = 4, className = "", children, ...rest }) {
  const ref = useRef(null);
  const frame = useRef(0);

  const move = (event) => {
    if (!canTilt() || !ref.current) return;
    const box = ref.current.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;

    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      ref.current?.style.setProperty("--tilt-x", `${(-y * max).toFixed(2)}deg`);
      ref.current?.style.setProperty("--tilt-y", `${(x * max).toFixed(2)}deg`);
    });
  };

  const leave = () => {
    cancelAnimationFrame(frame.current);
    ref.current?.style.setProperty("--tilt-x", "0deg");
    ref.current?.style.setProperty("--tilt-y", "0deg");
  };

  return (
    <Tag ref={ref} className={`tilt ${className}`} onPointerMove={move} onPointerLeave={leave} {...rest}>
      {children}
    </Tag>
  );
}
