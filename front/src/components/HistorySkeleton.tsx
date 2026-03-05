import { motion } from 'framer-motion';

export function HistorySkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0.5 }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden"
        >
          <div className="p-4 flex items-center justify-between">
            <div className="space-y-2 flex-1">
              <div className="h-4 bg-zinc-700 rounded w-24" />
              <div className="h-3 bg-zinc-800 rounded w-40" />
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
