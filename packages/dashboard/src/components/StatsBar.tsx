import { Cpu, MemoryStick, Activity, Clock } from 'lucide-react';
import type { AssetId, PriceData } from '../types';
import { ASSETS } from '../types';

interface StatsBarProps {
  prices: Record<AssetId, PriceData> | null;
}

export function StatsBar({ prices }: StatsBarProps) {
  if (!prices) return null;

  const gpuAssets = ASSETS.filter((a) => a.category === 'GPU');
  const ramAssets = ASSETS.filter((a) => a.category === 'RAM');

  const avgGpuPrice =
    gpuAssets.reduce((sum, a) => sum + (prices[a.id]?.price || 0), 0) / gpuAssets.length;

  const avgRamPrice =
    ramAssets.reduce((sum, a) => sum + (prices[a.id]?.price || 0), 0) / ramAssets.length;

  const totalSources = Object.values(prices).reduce(
    (sum, p) => sum + (p?.sourceCount || 0),
    0
  );

  const latestUpdate = Math.max(...Object.values(prices).map((p) => p?.timestamp || 0));

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  };

  const stats = [
    {
      label: 'Avg GPU Price',
      value: formatPrice(avgGpuPrice),
      icon: Cpu,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
    },
    {
      label: 'Avg RAM Price',
      value: formatPrice(avgRamPrice),
      icon: MemoryStick,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
    },
    {
      label: 'Data Sources',
      value: totalSources.toString(),
      icon: Activity,
      color: 'text-primary-400',
      bg: 'bg-primary-500/10',
    },
    {
      label: 'Last Update',
      value: new Date(latestUpdate).toLocaleTimeString(),
      icon: Clock,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-slate-900/50 rounded-xl border border-slate-800 p-4 flex items-center gap-4"
        >
          <div className={`p-3 rounded-lg ${stat.bg}`}>
            <stat.icon className={`w-5 h-5 ${stat.color}`} />
          </div>
          <div>
            <p className="text-sm text-slate-400">{stat.label}</p>
            <p className="text-lg font-semibold text-white font-mono">{stat.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
