import { Cpu, MemoryStick } from 'lucide-react';
import type { AssetId } from '../types';
import { ASSETS } from '../types';

interface AssetSelectorProps {
  selected: AssetId | null;
  onSelect: (assetId: AssetId) => void;
}

export function AssetSelector({ selected, onSelect }: AssetSelectorProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {ASSETS.map((asset) => {
        const isSelected = selected === asset.id;
        const Icon = asset.category === 'GPU' ? Cpu : MemoryStick;

        return (
          <button
            key={asset.id}
            onClick={() => onSelect(asset.id)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg transition-all
              ${
                isSelected
                  ? 'bg-primary-500/20 border-primary-500 text-primary-400'
                  : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white'
              }
              border
            `}
          >
            <Icon className="w-4 h-4" />
            <span className="font-medium">{asset.name}</span>
          </button>
        );
      })}
    </div>
  );
}
