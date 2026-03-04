import { Download } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, Button } from '../ui';
import { ScreenHeader } from '../components/ScreenHeader';
import { api } from '../api';

export interface SettingsScreenProps {
  onBack: () => void;
}

export const SettingsScreen = ({ onBack }: SettingsScreenProps) => (
  <motion.div initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="min-h-screen bg-zinc-950">
    <ScreenHeader title="Настройки" onBack={onBack} />
    <div className="p-4 space-y-4">
      <Card className="p-4">
        <h2 className="text-sm font-bold text-zinc-400 uppercase mb-3">Управление данными</h2>
        <Button
          variant="secondary"
          onClick={() => api.exportCsv()}
          className="w-full h-12 flex items-center justify-center gap-2"
        >
          <Download className="w-5 h-5" />
          Выгрузить данные (CSV)
        </Button>
      </Card>
    </div>
  </motion.div>
);
