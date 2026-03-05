import React from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  headerAction?: React.ReactNode;
}

export const Modal = ({ isOpen, onClose, title, children, headerAction }: ModalProps) => (
  <AnimatePresence>
    {isOpen && (
      <>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50" />
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          drag="y"
          dragConstraints={{ top: 0 }}
          dragElastic={{ top: 0, bottom: 0.5 }}
          onDragEnd={(_, info) => {
            if (info.offset.y > 100 || info.velocity.y > 500) onClose();
          }}
          className="fixed bottom-4 left-0 right-0 bg-zinc-900 border-t border-zinc-800 rounded-t-3xl z-50 max-h-[85vh] flex flex-col mx-4"
        >
          <div className="flex justify-center pt-2 pb-1 shrink-0 cursor-grab active:cursor-grabbing">
            <div className="w-12 h-1 rounded-full bg-zinc-600" aria-hidden />
          </div>
          <div className="p-4 pt-0 border-b border-zinc-800 flex items-center justify-between shrink-0">
            <h3 className="text-lg font-semibold text-zinc-50 truncate max-w-[70%]">{title}</h3>
            <div className="flex items-center gap-2">
              {headerAction}
              <button onClick={onClose} className="min-w-[48px] min-h-[48px] flex items-center justify-center bg-zinc-800 rounded-full text-zinc-400 hover:text-zinc-50">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="overflow-y-auto p-4 flex-1 pb-10">{children}</div>
        </motion.div>
      </>
    )}
  </AnimatePresence>
);
