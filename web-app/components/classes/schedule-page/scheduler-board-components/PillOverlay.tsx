import { motion } from "framer-motion";

export function PillOverlay({
  title,
  color,
}: {
  title?: string;
  color?: string;
}) {
  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0.7 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ opacity: 0 }}
      className="px-2.5 py-1.5 rounded-full bg-[var(--color-bg2)] shadow flex items-center gap-2 pointer-events-none"
    >
      <span
        className="h-2.5 w-2.5 rounded-full shrink-0"
        style={{ background: color || "var(--color-primary)" }}
      />
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium">
        {title ?? "Quiz"}
      </span>
    </motion.div>
  );
}
