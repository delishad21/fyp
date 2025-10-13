import { motion } from "framer-motion";

export function QuizRowOverlay({
  title,
  color,
}: {
  title?: string;
  color?: string;
}) {
  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0.8 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-9 px-3 pr-4 rounded-full bg-[var(--color-bg2)] shadow inline-flex items-center gap-2 whitespace-nowrap w-auto max-w-[min(360px,90vw)] pointer-events-none"
    >
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ background: color || "var(--color-primary)" }}
      />
      <span className="text-sm font-medium overflow-hidden text-ellipsis">
        {title ?? "Quiz"}
      </span>
    </motion.div>
  );
}
