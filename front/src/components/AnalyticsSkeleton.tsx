import { motion } from 'framer-motion';

export function AnalyticsSkeleton() {
  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0.5 }}
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.5, repeat: Infinity }}
        className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4"
      >
        <div className="h-6 bg-zinc-700 rounded w-32 mb-4" />
        <div className="h-32 bg-zinc-800 rounded" />
      </motion.div>
      <motion.div
        initial={{ opacity: 0.5 }}
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }}
        className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4"
      >
        <div className="h-6 bg-zinc-700 rounded w-40 mb-4" />
        <div className="grid grid-cols-2 gap-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-12 bg-zinc-800 rounded" />
          ))}
        </div>
      </motion.div>
    </div>
  );
}
