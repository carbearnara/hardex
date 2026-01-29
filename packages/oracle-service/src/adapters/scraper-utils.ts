import axios, { AxiosInstance, AxiosRequestConfig, AxiosProxyConfig } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

// Proxy configuration
export interface ProxyConfig {
  url: string;        // Full proxy URL: http://user:pass@host:port or socks5://host:port
  type?: 'http' | 'https' | 'socks4' | 'socks5';
}

// Proxy pool for rotation
let proxyPool: ProxyConfig[] = [];
let currentProxyIndex = 0;

/**
 * Initialize proxy pool from environment or array
 */
export function initProxyPool(proxies?: string[]): void {
  const envProxies = process.env.PROXY_URLS?.split(',').map(p => p.trim()).filter(Boolean);
  const proxyUrls = proxies || envProxies || [];

  proxyPool = proxyUrls.map(url => {
    const type = url.startsWith('socks5') ? 'socks5' :
                 url.startsWith('socks4') ? 'socks4' :
                 url.startsWith('https') ? 'https' : 'http';
    return { url, type };
  });

  if (proxyPool.length > 0) {
    console.log(`[proxy] Initialized pool with ${proxyPool.length} proxies`);
  }
}

/**
 * Get the next proxy from the pool (round-robin)
 */
export function getNextProxy(): ProxyConfig | null {
  if (proxyPool.length === 0) return null;

  const proxy = proxyPool[currentProxyIndex];
  currentProxyIndex = (currentProxyIndex + 1) % proxyPool.length;
  return proxy;
}

/**
 * Get a random proxy from the pool
 */
export function getRandomProxy(): ProxyConfig | null {
  if (proxyPool.length === 0) return null;
  return proxyPool[Math.floor(Math.random() * proxyPool.length)];
}

/**
 * Parse proxy URL into axios proxy config
 */
export function parseProxyUrl(proxyUrl: string): AxiosProxyConfig | null {
  try {
    const url = new URL(proxyUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80),
      auth: url.username ? {
        username: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password || ''),
      } : undefined,
      protocol: url.protocol.replace(':', ''),
    };
  } catch {
    return null;
  }
}

/**
 * Create a proxy agent for axios (supports HTTP, HTTPS, SOCKS)
 */
export function createProxyAgent(proxy: ProxyConfig): HttpsProxyAgent<string> | SocksProxyAgent | null {
  try {
    if (proxy.type === 'socks4' || proxy.type === 'socks5') {
      return new SocksProxyAgent(proxy.url);
    }
    return new HttpsProxyAgent(proxy.url);
  } catch {
    return null;
  }
}

// Realistic browser user agents (updated 2024)
const USER_AGENTS = [
  // Chrome on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  // Chrome on Mac
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  // Firefox on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  // Safari on Mac
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  // Edge on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0',
];

// Common screen resolutions
const SCREEN_RESOLUTIONS = [
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
];

// Languages
const ACCEPT_LANGUAGES = [
  'en-US,en;q=0.9',
  'en-US,en;q=0.9,es;q=0.8',
  'en-GB,en;q=0.9,en-US;q=0.8',
  'en-US,en;q=0.8',
];

export function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export function getRandomDelay(min: number = 1000, max: number = 3000): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function getRandomResolution(): { width: number; height: number } {
  return SCREEN_RESOLUTIONS[Math.floor(Math.random() * SCREEN_RESOLUTIONS.length)];
}

export function getBrowserHeaders(referer?: string): Record<string, string> {
  const ua = getRandomUserAgent();
  const isChrome = ua.includes('Chrome');
  const isFirefox = ua.includes('Firefox');
  const resolution = getRandomResolution();
  const lang = ACCEPT_LANGUAGES[Math.floor(Math.random() * ACCEPT_LANGUAGES.length)];

  const headers: Record<string, string> = {
    'User-Agent': ua,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': lang,
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0',
  };

  if (referer) {
    headers['Referer'] = referer;
  }

  // Chrome-specific headers
  if (isChrome) {
    headers['Sec-Ch-Ua'] = '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"';
    headers['Sec-Ch-Ua-Mobile'] = '?0';
    headers['Sec-Ch-Ua-Platform'] = ua.includes('Windows') ? '"Windows"' : '"macOS"';
    headers['Sec-Fetch-Dest'] = 'document';
    headers['Sec-Fetch-Mode'] = 'navigate';
    headers['Sec-Fetch-Site'] = referer ? 'same-origin' : 'none';
    headers['Sec-Fetch-User'] = '?1';
  }

  // Firefox-specific
  if (isFirefox) {
    headers['TE'] = 'trailers';
  }

  return headers;
}

export interface StealthClientOptions {
  baseURL?: string;
  useProxy?: boolean;      // Enable proxy rotation
  proxyUrl?: string;       // Use specific proxy (overrides rotation)
  timeout?: number;
}

export function createStealthClient(options?: StealthClientOptions | string): AxiosInstance {
  // Support legacy signature: createStealthClient(baseURL)
  const opts: StealthClientOptions = typeof options === 'string'
    ? { baseURL: options }
    : options || {};

  const clientConfig: any = {
    baseURL: opts.baseURL,
    timeout: opts.timeout || 20000,
    maxRedirects: 5,
    validateStatus: (status: number) => status < 500,
  };

  // Configure proxy
  let proxyAgent: HttpsProxyAgent<string> | SocksProxyAgent | null = null;

  if (opts.proxyUrl) {
    // Use specific proxy
    proxyAgent = createProxyAgent({ url: opts.proxyUrl });
  } else if (opts.useProxy) {
    // Use proxy from pool
    const proxy = getRandomProxy();
    if (proxy) {
      proxyAgent = createProxyAgent(proxy);
    }
  }

  if (proxyAgent) {
    clientConfig.httpsAgent = proxyAgent;
    clientConfig.httpAgent = proxyAgent;
    // Disable axios built-in proxy when using agent
    clientConfig.proxy = false;
  }

  const client = axios.create(clientConfig);

  // Add request interceptor to randomize headers
  client.interceptors.request.use((config) => {
    const browserHeaders = getBrowserHeaders(config.headers?.['Referer'] as string);
    for (const [key, value] of Object.entries(browserHeaders)) {
      if (!config.headers.has(key)) {
        config.headers.set(key, value);
      }
    }
    return config;
  });

  return client;
}

/**
 * Create a client that rotates through proxies on each request
 */
export function createRotatingProxyClient(baseURL?: string): AxiosInstance {
  const client = axios.create({
    baseURL,
    timeout: 25000,
    maxRedirects: 5,
    validateStatus: (status) => status < 500,
  });

  // Add request interceptor to rotate proxies and headers
  client.interceptors.request.use((config) => {
    // Get next proxy
    const proxy = getNextProxy();
    if (proxy) {
      const agent = createProxyAgent(proxy);
      if (agent) {
        config.httpsAgent = agent;
        config.httpAgent = agent;
        config.proxy = false;
      }
    }

    // Set headers
    const browserHeaders = getBrowserHeaders(config.headers?.['Referer'] as string);
    for (const [key, value] of Object.entries(browserHeaders)) {
      if (!config.headers.has(key)) {
        config.headers.set(key, value);
      }
    }

    return config;
  });

  return client;
}

// Generate a realistic cookie string
export function generateSessionCookies(domain: string): string {
  const sessionId = Math.random().toString(36).substring(2, 15);
  const timestamp = Date.now();

  const cookies: string[] = [];

  if (domain.includes('bestbuy')) {
    cookies.push(`SID=${sessionId}`);
    cookies.push(`intl_splash=false`);
    cookies.push(`oid=${Math.random().toString(36).substring(2, 10)}`);
    cookies.push(`CTT=${timestamp}`);
    cookies.push(`vt=${Math.floor(timestamp / 1000)}`);
  } else if (domain.includes('newegg')) {
    cookies.push(`NV%5FORDERHIS=`);
    cookies.push(`NV%5FCombine=`);
    cookies.push(`NV%5FCONFIGURATION=`);
    cookies.push(`NVTC=`);
    cookies.push(`NSC=${sessionId}`);
  }

  return cookies.join('; ');
}

// Fetch with retry and exponential backoff
export async function fetchWithRetry(
  client: AxiosInstance,
  url: string,
  config?: AxiosRequestConfig,
  maxRetries: number = 3
): Promise<any> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Add jitter delay between retries
      if (attempt > 0) {
        const delay = Math.pow(2, attempt) * 1000 + getRandomDelay(500, 1500);
        await sleep(delay);
      }

      const response = await client.get(url, config);

      if (response.status === 200) {
        return response;
      }

      if (response.status === 403 || response.status === 429) {
        // Rate limited or blocked, wait longer
        await sleep(getRandomDelay(3000, 6000));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error as Error;
    }
  }

  throw lastError || new Error('Max retries exceeded');
}
