import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AssetId, PriceHistory } from '../types';
import { ASSETS } from '../types';

interface PriceChartProps {
  history: Record<AssetId, PriceHistory[]>;
  selectedAsset: AssetId | null;
}

export function PriceChart({ history, selectedAsset }: PriceChartProps) {
  const assetId = selectedAsset || 'GPU_RTX4090';
  const data = history[assetId] || [];
  const asset = ASSETS.find((a) => a.id === assetId);

  if (data.length < 2) {
    return (
      <div className="h-80 flex items-center justify-center bg-slate-900/50 rounded-xl border border-slate-800">
        <p className="text-slate-500">Collecting price history data...</p>
      </div>
    );
  }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  };

  const isPositive = data.length >= 2 && data[data.length - 1].price >= data[0].price;
  const color = isPositive ? '#22c55e' : '#ef4444';

  return (
    <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white">
          {asset?.name || assetId} Price History
        </h3>
        <p className="text-sm text-slate-400">Last 5 minutes</p>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
            <XAxis
              dataKey="timestamp"
              tickFormatter={formatTime}
              stroke="#64748b"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={formatPrice}
              stroke="#64748b"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              domain={['auto', 'auto']}
              width={80}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '8px',
                fontSize: '14px',
              }}
              labelFormatter={(value) => formatTime(value as number)}
              formatter={(value: number, name: string) => [
                formatPrice(value),
                name === 'price' ? 'Spot' : 'TWAP',
              ]}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke={color}
              strokeWidth={2}
              fill="url(#priceGradient)"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="twap"
              stroke="#94a3b8"
              strokeWidth={1}
              strokeDasharray="4 4"
              fill="none"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center gap-6 mt-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5" style={{ backgroundColor: color }} />
          <span className="text-slate-400">Spot Price</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5 border-t border-dashed border-slate-400" />
          <span className="text-slate-400">TWAP</span>
        </div>
      </div>
    </div>
  );
}
