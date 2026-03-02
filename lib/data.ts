// Static fallback data — used only when /api/recommendations (Groq AI) fails.
// Normal operation: stock lists are fully AI-generated from live news + market data.
export interface StockEntry {
  ticker: string;
  name: string;
  reason: string;
  etf?: boolean;
}

export interface StockCategory {
  icon: string;
  title: string;
  subtitle: string;
  tag: string;
  tagType: 'green' | 'blue' | 'amber' | 'red';
  stocks: StockEntry[];
}

export const buyCategories: StockCategory[] = [
  {
    icon: '🛡',
    title: 'Defense & Aerospace',
    subtitle: 'Missiles, radar, aircraft in active use',
    tag: 'Strong Buy',
    tagType: 'green',
    stocks: [
      { ticker: 'LMT',  name: 'Lockheed Martin',               reason: 'F-35 jets, THAAD interceptors — core to US/Israel ops' },
      { ticker: 'RTX',  name: 'RTX Corporation',               reason: 'Tomahawk cruise missiles, AN/TPY-2 radar systems' },
      { ticker: 'NOC',  name: 'Northrop Grumman',              reason: 'B-21 bomber, cyber & space systems — up ~11%' },
      { ticker: 'BA',   name: 'Boeing',                        reason: 'F-15, Apache helicopters, missile defense' },
      { ticker: 'ITA',  name: 'iShares Aerospace & Defense',   reason: 'Broad sector exposure — entire defense basket', etf: true },
    ],
  },
  {
    icon: '⛽',
    title: 'Energy & Oil',
    subtitle: 'Direct beneficiaries of $100+ crude prices',
    tag: 'Buy on Dip',
    tagType: 'blue',
    stocks: [
      { ticker: 'XOM', name: 'ExxonMobil',                    reason: 'Global integrated oil — up 11%, benefits from surge' },
      { ticker: 'CVX', name: 'Chevron',                       reason: 'Diversified ops, 26.6% upside target from current price' },
      { ticker: 'COP', name: 'ConocoPhillips',                reason: 'Pure-play E&P with high leverage to oil prices' },
      { ticker: 'XLE', name: 'Energy Select Sector SPDR',     reason: 'Broad US energy sector exposure', etf: true },
    ],
  },
  {
    icon: '🥇',
    title: 'Gold & Precious Metals',
    subtitle: 'Safe-haven demand surges in geopolitical crises',
    tag: 'Safe Haven',
    tagType: 'amber',
    stocks: [
      { ticker: 'GOLD', name: 'Barrick Gold',                 reason: "World's largest gold miner — gold up 22% YTD 2026" },
      { ticker: 'NEM',  name: 'Newmont',                      reason: 'Major gold/silver producer, strong price correlation' },
      { ticker: 'GLD',  name: 'SPDR Gold Shares',             reason: 'Direct gold price exposure, most liquid gold ETF', etf: true },
      { ticker: 'SLV',  name: 'iShares Silver Trust',         reason: 'Silver rising on safe-haven + industrial demand', etf: true },
    ],
  },
  {
    icon: '🔐',
    title: 'Cybersecurity',
    subtitle: 'Iran is a known state-level cyber actor — threat elevated',
    tag: 'Watch',
    tagType: 'blue',
    stocks: [
      { ticker: 'PLTR', name: 'Palantir',                     reason: '$178M Pentagon contract — AI used by US/Israel military' },
      { ticker: 'CRWD', name: 'CrowdStrike',                  reason: 'Endpoint security demand spikes during state-level cyber ops' },
      { ticker: 'PANW', name: 'Palo Alto Networks',           reason: 'Network security — critical infrastructure protection' },
    ],
  },
];

export const avoidCategories: StockCategory[] = [
  {
    icon: '✈',
    title: 'Airlines & Aviation',
    subtitle: 'Fuel = biggest cost driver. Middle East airspace closed.',
    tag: 'Avoid',
    tagType: 'red',
    stocks: [
      { ticker: 'DAL', name: 'Delta Air Lines',               reason: 'Jet fuel ~25% of costs — cannot hedge sudden spikes' },
      { ticker: 'UAL', name: 'United Airlines',               reason: 'Major fuel exposure, international route disruptions' },
      { ticker: 'AAL', name: 'American Airlines',             reason: 'Already debt-heavy — oil spike is existential pressure' },
      { ticker: 'LUV', name: 'Southwest Airlines',            reason: 'Domestic but fully fuel-sensitive, no Middle East hedge' },
    ],
  },
  {
    icon: '💻',
    title: 'Big Tech & High-Growth',
    subtitle: 'Risk-off rotation out of high-valuation growth stocks.',
    tag: 'Avoid',
    tagType: 'red',
    stocks: [
      { ticker: 'NVDA', name: 'NVIDIA',                       reason: 'High valuation — primary target in risk-off selloffs' },
      { ticker: 'TSLA', name: 'Tesla',                        reason: 'Consumer sentiment hit + supply chain energy costs' },
      { ticker: 'META', name: 'Meta',                         reason: 'Ad revenue drops sharply in uncertain consumer markets' },
      { ticker: 'AMZN', name: 'Amazon',                       reason: 'Consumer spending decline + logistics cost spike' },
    ],
  },
  {
    icon: '🛍',
    title: 'Consumer Discretionary',
    subtitle: 'Higher oil → higher inflation → consumers cut spending.',
    tag: 'Avoid',
    tagType: 'red',
    stocks: [
      { ticker: 'NKE',  name: 'Nike',                         reason: 'Consumer confidence drop, discretionary spend first cut' },
      { ticker: 'SBUX', name: 'Starbucks',                    reason: 'Non-essential spending evaporates in inflation spikes' },
      { ticker: 'CCL',  name: 'Carnival Cruise Lines',        reason: 'Middle East travel collapsed + massive fuel cost' },
      { ticker: 'RCL',  name: 'Royal Caribbean',              reason: 'Dual hit: travel demand collapse + fuel price surge' },
    ],
  },
  {
    icon: '🚢',
    title: 'Maritime Shipping',
    subtitle: 'War risk insurance on Gulf routes can jump 10×.',
    tag: 'Avoid',
    tagType: 'red',
    stocks: [
      { ticker: 'ZIM',   name: 'ZIM Integrated Shipping',     reason: 'Heavy Middle East route exposure — direct war zone' },
      { ticker: 'AMKBY', name: 'A.P. Moller-Maersk ADR',      reason: 'Strait of Hormuz route closure hits operations hard' },
    ],
  },
  {
    icon: '🌏',
    title: 'Emerging Market ETFs',
    subtitle: 'Oil-importing EMs face inflation + currency weakness.',
    tag: 'Reduce',
    tagType: 'amber',
    stocks: [
      { ticker: 'EEM',  name: 'iShares MSCI Emerging Markets', reason: 'Broad EM selloff as energy inflation ripples globally', etf: true },
      { ticker: 'INDA', name: 'iShares MSCI India',            reason: 'India imports ~85% of oil — massive cost pressure', etf: true },
      { ticker: 'FXI',  name: 'iShares China Large-Cap',       reason: 'Oil imports + geopolitical risk premium on China', etf: true },
    ],
  },
  {
    icon: '📉',
    title: 'Small-Cap & High-Beta',
    subtitle: 'First dumped in risk-off environments — least liquidity.',
    tag: 'Caution',
    tagType: 'amber',
    stocks: [
      { ticker: 'IWM',  name: 'iShares Russell 2000',          reason: 'Small caps sell off fast in geopolitical crises', etf: true },
      { ticker: 'ARKK', name: 'ARK Innovation ETF',            reason: 'High-beta, speculative — first exit in panic selling', etf: true },
    ],
  },
];

export const OIL_SCENARIOS = [
  {
    label: 'Scenario A — Contained',
    price: '$80–$90',
    name: 'Conflict contained, limited retaliation',
    desc: 'Hostilities remain short and concentrated. Strait of Hormuz stays open. Oil rallies briefly then stabilises.',
    colorText: 'text-nordic-green',
    colorBg:   'bg-nordic-green-bg',
    colorBorder:'border-green-200',
  },
  {
    label: 'Scenario B — Prolonged',
    price: '$90–$100',
    name: 'Prolonged conflict, broad Iran retaliation',
    desc: 'Fighting extends weeks. Regional proxies activate. Supply disruption fears keep oil near $100 (Barclays forecast).',
    colorText:  'text-nordic-amber',
    colorBg:    'bg-nordic-amber-bg',
    colorBorder:'border-yellow-200',
  },
  {
    label: 'Scenario C — Hormuz Closed',
    price: '$100–$120+',
    name: 'Iran closes Strait of Hormuz',
    desc: '~20% of global daily oil supply disrupted. Extreme price spike. Global recession risk. Worst-case tail scenario.',
    colorText:  'text-nordic-red',
    colorBg:    'bg-nordic-red-bg',
    colorBorder:'border-red-200',
  },
];

export const SOURCES = [
  { label: 'Al Jazeera Live',              url: 'https://www.aljazeera.com/news/liveblog/2026/2/28/live-israel-launches-attacks-on-iran-multiple-explosions-heard-in-tehran' },
  { label: 'Wikipedia — 2026 Strikes',     url: 'https://en.wikipedia.org/wiki/2026_Israeli%E2%80%93United_States_strikes_on_Iran' },
  { label: 'CNBC — Oil Markets',           url: 'https://www.cnbc.com/2026/02/28/iran-us-attack-oil-market-economy.html' },
  { label: 'CNBC — Markets Brace',         url: 'https://www.cnbc.com/2026/02/28/markets-brace-for-impact-following-us-military-strikes-against-iran.html' },
  { label: 'OilPrice.com',                 url: 'https://oilprice.com/Energy/Crude-Oil/Oil-Markets-Brace-for-Volatility-As-US-Israel-Launch-Strikes-Across-Iran.html' },
  { label: 'Seeking Alpha — Defense',      url: 'https://seekingalpha.com/article/4876777-iran-escalation-shock-triggers-risk-off-move-to-usd-and-gold-oil-defense-and-aerospace-win' },
  { label: 'Investing.com — 5 Stocks',     url: 'https://www.investing.com/analysis/5-stocks-that-could-benefit-from-escalated-usiranisrael-tensions-200662522' },
  { label: 'AltIndex — Stocks to Watch',   url: 'https://altindex.com/news/stocks-to-watch-us-iran-escalation' },
  { label: 'Euronews — Oil Prices',        url: 'https://www.euronews.com/business/2026/02/28/what-does-the-us-israel-attack-on-iran-mean-for-oil-prices' },
  { label: 'Nasdaq — Defense ETFs',        url: 'https://www.nasdaq.com/articles/defense-etfs-gain-if-trump-acts-his-intervention-threat-iran' },
];
