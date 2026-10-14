import { useReducedMotion, useScroll, useTransform } from "framer-motion";

// Moves a layer more slowly than the page as its section scrolls away, which
// gives a photograph depth behind the content in front of it. Returns nothing
// when reduced motion is requested, so the layer simply stays put.
export default function useParallax(ref, distance = 140) {
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, distance]);
  const fade = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return reduce ? { y: undefined, fade: undefined } : { y, fade };
}
