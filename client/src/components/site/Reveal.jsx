import { motion } from "framer-motion";

// Fades content up the first time it scrolls into view. With reduced motion
// requested, the app-wide MotionConfig drops the movement.
export default function Reveal({ as = "div", delay = 0, children, ...rest }) {
  const Tag = motion[as] || motion.div;

  return (
    <Tag
      initial={{ opacity: 0, y: 34 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: 0.85, delay, ease: [0.22, 1, 0.36, 1] }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
