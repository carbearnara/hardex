import { useState } from 'react';
import { Header } from './components/Header';
import { StatsBar } from './components/StatsBar';
import { PriceCard } from './components/PriceCard';
import { PriceChart } from './components/PriceChart';
import { AssetSelector } from './components/AssetSelector';
import { RentalTab } from './components/RentalTab';
import { usePrices } from './hooks/usePrices';
import { ASSETS, type AssetId } from './types';

type TabId = 'hardware' | 'rental';

function App() {
  const { prices, history, isConnected, lastUpdate, refetch } = usePrices();
  const [selectedAsset, setSelectedAsset] = useState<AssetId>('GPU_RTX4090');
  const [activeTab, setActiveTab] = useState<TabId>('rental');

  const historyCount = Object.values(history).reduce((sum, h) => sum + h.length, 0);

  return (
    <div className="min-h-screen bg-slate-950">
      <Header isConnected={isConnected} lastUpdate={lastUpdate} onRefresh={refetch} cacheCount={historyCount} activeTab={activeTab} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tab Navigation */}
        <nav className="mb-8">
          <div className="flex space-x-1 bg-slate-800/50 p-1 rounded-lg w-fit">
            <button
              onClick={() => setActiveTab('rental')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'rental'
                  ? 'bg-purple-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                </svg>
                GPU Rentals
              </span>
            </button>
            <button
              onClick={() => setActiveTab('hardware')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'hardware'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
                Hardware Prices
              </span>
            </button>
          </div>
        </nav>

        {/* Hardware Prices Tab */}
        {activeTab === 'hardware' && (
          <>
            {/* Show content only if we have real data */}
            {prices && isConnected ? (
              <>
                {/* Stats Overview */}
                <section className="mb-8">
                  <StatsBar prices={prices} />
                </section>

                {/* Price Cards Grid */}
                <section className="mb-8">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-white">Live Prices</h2>
                    <span className="text-sm text-slate-500">Updates every 5 seconds</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {ASSETS.map((asset) => (
                      <PriceCard
                        key={asset.id}
                        asset={asset}
                        priceData={prices?.[asset.id]}
                        history={history[asset.id] || []}
                      />
                    ))}
                  </div>
                </section>

                {/* Detailed Chart Section */}
                <section>
                  <div className="mb-4">
                    <h2 className="text-lg font-semibold text-white mb-3">Price History</h2>
                    <AssetSelector selected={selectedAsset} onSelect={setSelectedAsset} />
                  </div>

                  <PriceChart history={history} selectedAsset={selectedAsset} />
                </section>
              </>
            ) : (
              /* No Data State - Real data requires backend */
              <div className="bg-slate-800/30 border border-slate-700 rounded-xl p-8">
                <div className="max-w-2xl mx-auto text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10 mb-6">
                    <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                    </svg>
                  </div>

                  <h2 className="text-xl font-semibold text-white mb-3">Real-Time Hardware Prices</h2>

                  <p className="text-slate-400 mb-6">
                    Hardware price tracking uses live web scrapers to fetch real prices from retailers like Newegg, Amazon, Best Buy, and B&H Photo. This requires the oracle service backend.
                  </p>

                  <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 mb-6 text-left">
                    <p className="text-sm text-slate-300 mb-3">To see real hardware prices, run locally:</p>
                    <div className="space-y-2">
                      <code className="block text-sm text-green-400 font-mono bg-slate-800 p-2 rounded">
                        git clone [repo] && cd hardex
                      </code>
                      <code className="block text-sm text-green-400 font-mono bg-slate-800 p-2 rounded">
                        pnpm install
                      </code>
                      <code className="block text-sm text-green-400 font-mono bg-slate-800 p-2 rounded">
                        pnpm dev
                      </code>
                    </div>
                  </div>

                  <div className="text-sm text-slate-500">
                    <p className="mb-2">Data sources (real scraped data):</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {['Newegg', 'Amazon', 'Best Buy', 'B&H Photo'].map((source) => (
                        <span key={source} className="px-2 py-1 bg-slate-800 rounded text-slate-400">
                          {source}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* GPU Rentals Tab */}
        {activeTab === 'rental' && <RentalTab />}

        {/* Footer */}
        <footer className="mt-12 pt-8 border-t border-slate-800">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <span>Hardex Oracle</span>
              <span className="text-slate-700">|</span>
              <span>Chainlink Compatible</span>
            </div>
            <div className="flex items-center gap-4">
              <span>Prices in USD</span>
              <span className="text-slate-700">|</span>
              <span>8 decimals precision</span>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

export default App;
