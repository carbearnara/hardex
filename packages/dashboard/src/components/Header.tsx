import { Activity, Cpu, RefreshCw, Database } from 'lucide-react';

interface HeaderProps {
  isConnected: boolean;
  lastUpdate: number | null;
  onRefresh: () => void;
  cacheCount: number;
  activeTab?: 'hardware' | 'rental';
}

export function Header({ isConnected, lastUpdate, onRefresh, cacheCount, activeTab = 'rental' }: HeaderProps) {
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-500/10 rounded-lg">
              <Cpu className="w-6 h-6 text-primary-500" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Hardex</h1>
              <p className="text-xs text-slate-400">Hardware Price Oracle</p>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center gap-4">
            {/* Connection Status - only show for hardware tab */}
            {activeTab === 'hardware' && (
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    isConnected ? 'bg-primary-500 animate-pulse' : 'bg-red-500'
                  }`}
                />
                <span className="text-sm text-slate-400">
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            )}

            {/* Cache Status */}
            {cacheCount > 0 && (
              <div className="hidden sm:flex items-center gap-2 text-sm text-slate-400">
                <Database className="w-4 h-4" />
                <span>{cacheCount} cached</span>
              </div>
            )}

            {/* Last Update */}
            {lastUpdate && (
              <div className="hidden md:flex items-center gap-2 text-sm text-slate-400">
                <Activity className="w-4 h-4" />
                <span>{formatTime(lastUpdate)}</span>
              </div>
            )}

            {/* Refresh Button */}
            <button
              onClick={onRefresh}
              className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
              title="Refresh prices"
            >
              <RefreshCw className="w-5 h-5 text-slate-400 hover:text-white" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
