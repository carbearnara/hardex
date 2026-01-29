import { AlertCircle, RefreshCw } from 'lucide-react';

interface ConnectionErrorProps {
  error: string;
  onRetry: () => void;
}

export function ConnectionError({ error, onRetry }: ConnectionErrorProps) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center max-w-md mx-auto p-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/10 mb-6">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>

        <h2 className="text-xl font-semibold text-white mb-2">Connection Error</h2>

        <p className="text-slate-400 mb-6">
          Unable to connect to the oracle service. Make sure the service is running on port 8080.
        </p>

        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 mb-6">
          <code className="text-sm text-red-400 font-mono">{error}</code>
        </div>

        <div className="space-y-3">
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
            Retry Connection
          </button>

          <p className="text-sm text-slate-500">
            Start the oracle service with:{' '}
            <code className="text-slate-400">pnpm --filter oracle-service dev</code>
          </p>
        </div>
      </div>
    </div>
  );
}
