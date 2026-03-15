import { useState, useEffect } from 'react';
import { StickyNote, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface NoteWidgetProps {
  initialValue: string;
  onChange: (value: string) => void;
}

export const NoteWidget = ({ initialValue, onChange }: NoteWidgetProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [value, setValue] = useState(initialValue);
  useEffect(() => setValue(initialValue), [initialValue]);

  return (
    <div className="mb-4">
      <button onClick={() => setIsOpen(!isOpen)} className="flex items-center gap-2 text-yellow-500 text-sm font-medium mb-2 w-full">
        <StickyNote className="w-4 h-4" /><span>Заметка</span><ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <textarea value={value} onChange={(e) => { setValue(e.target.value); onChange(e.target.value); }} placeholder="Настройки..." className="w-full bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-yellow-200 text-sm focus:outline-none min-h-[80px]" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
