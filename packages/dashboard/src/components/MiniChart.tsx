import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';
import type { PriceHistory } from '../types';

interface MiniChartProps {
  data: PriceHistory[];
  isPositive: boolean;
}

export function MiniChart({ data, isPositive }: MiniChartProps) {
  if (data.length < 2) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-600 text-xs">
        Collecting data...
      </div>
    );
  }

  const color = isPositive ? '#22c55e' : '#ef4444';

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`gradient-${isPositive}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis domain={['dataMin', 'dataMax']} hide />
        <Area
          type="monotone"
          dataKey="price"
          stroke={color}
          strokeWidth={2}
          fill={`url(#gradient-${isPositive})`}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
