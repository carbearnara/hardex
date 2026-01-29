import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import type { RentalGpuType, RentalPriceStats } from '../types';
import type { RentalPriceHistory } from '../hooks/useRentalPrices';

interface RentalBarChartProps {
  prices: Record<RentalGpuType, RentalPriceStats> | null;
}

interface RentalLineChartProps {
  history: Record<RentalGpuType, RentalPriceHistory[]>;
  selectedGpus: RentalGpuType[];
}

const GPU_COLORS: Record<RentalGpuType, string> = {
  RTX_4090: '#22c55e',
  RTX_3090: '#10b981',
  A100_40GB: '#8b5cf6',
  A100_80GB: '#a855f7',
  H100_80GB: '#ec4899',
  H100_PCIE: '#f43f5e',
  A6000: '#6366f1',
  L40S: '#3b82f6',
};

const GPU_NAMES: Record<RentalGpuType, string> = {
  RTX_4090: 'RTX 4090',
  RTX_3090: 'RTX 3090',
  A100_40GB: 'A100 40GB',
  A100_80GB: 'A100 80GB',
  H100_80GB: 'H100 80GB',
  H100_PCIE: 'H100 PCIe',
  A6000: 'A6000',
  L40S: 'L40S',
};

// Custom tooltip for bar chart
function BarTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl">
      <p className="font-medium text-white mb-1">{data.name}</p>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Average:</span>
          <span className="text-white">${data.avgPrice.toFixed(2)}/hr</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Min:</span>
          <span className="text-green-400">${data.minPrice.toFixed(2)}/hr</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Max:</span>
          <span className="text-red-400">${data.maxPrice.toFixed(2)}/hr</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Offers:</span>
          <span className={data.offerCount > 0 ? 'text-white' : 'text-slate-500'}>
            {data.offerCount > 0 ? data.offerCount : 'None'}
          </span>
        </div>
      </div>
    </div>
  );
}

// Custom tooltip for line chart
function LineTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl">
      <p className="text-xs text-slate-400 mb-2">
        {new Date(label).toLocaleTimeString()}
      </p>
      <div className="space-y-1">
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 text-sm">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-slate-300">{entry.name}:</span>
            <span className="text-white font-medium">
              ${entry.value.toFixed(2)}/hr
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RentalBarChart({ prices }: RentalBarChartProps) {
  const data = useMemo(() => {
    if (!prices) return [];

    return Object.entries(prices)
      .map(([gpuType, stats]) => ({
        gpuType: gpuType as RentalGpuType,
        name: GPU_NAMES[gpuType as RentalGpuType],
        avgPrice: stats.avgPrice,
        minPrice: stats.minPrice,
        maxPrice: stats.maxPrice,
        offerCount: stats.offerCount,
        color: GPU_COLORS[gpuType as RentalGpuType],
        hasLiveData: stats.offerCount > 0,
      }))
      .sort((a, b) => a.avgPrice - b.avgPrice);
  }, [prices]);

  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-500">
        No pricing data available
      </div>
    );
  }

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 10, right: 30, left: 80, bottom: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 'auto']}
            tickFormatter={(value) => `$${value.toFixed(2)}`}
            stroke="#64748b"
            fontSize={12}
          />
          <YAxis
            type="category"
            dataKey="name"
            stroke="#64748b"
            fontSize={12}
            width={75}
          />
          <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
          <Bar dataKey="avgPrice" radius={[0, 4, 4, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.hasLiveData ? entry.color : '#475569'}
                opacity={entry.hasLiveData ? 1 : 0.5}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RentalLineChart({ history, selectedGpus }: RentalLineChartProps) {
  const data = useMemo(() => {
    // Combine all timestamps and create data points
    const allTimestamps = new Set<number>();

    for (const gpuType of selectedGpus) {
      const gpuHistory = history[gpuType] || [];
      gpuHistory.forEach((h) => allTimestamps.add(h.timestamp));
    }

    const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);

    return sortedTimestamps.map((timestamp) => {
      const point: Record<string, number> = { timestamp };

      for (const gpuType of selectedGpus) {
        const gpuHistory = history[gpuType] || [];
        const entry = gpuHistory.find((h) => h.timestamp === timestamp);
        if (entry) {
          point[gpuType] = entry.avgPrice;
        }
      }

      return point;
    });
  }, [history, selectedGpus]);

  if (data.length < 2) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-500">
        <div className="text-center">
          <p>Collecting price history...</p>
          <p className="text-xs mt-1">Chart will appear after a few data points</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="timestamp"
            tickFormatter={(value) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            stroke="#64748b"
            fontSize={11}
          />
          <YAxis
            tickFormatter={(value) => `$${value.toFixed(2)}`}
            stroke="#64748b"
            fontSize={11}
            domain={['auto', 'auto']}
          />
          <Tooltip content={<LineTooltip />} />
          <Legend
            formatter={(value) => GPU_NAMES[value as RentalGpuType] || value}
            wrapperStyle={{ fontSize: '12px' }}
          />
          {selectedGpus.map((gpuType) => (
            <Line
              key={gpuType}
              type="monotone"
              dataKey={gpuType}
              name={GPU_NAMES[gpuType]}
              stroke={GPU_COLORS[gpuType]}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
