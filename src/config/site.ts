export const siteConfig = {
  name: 'BlockLens',
  tagline: 'Crypto research intelligence',
  description:
    'Understand crypto beyond the price. Research digital assets through market data, on-chain activity, tokenomics, project signals, and AI-powered analysis.',
  url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  links: {
    github: 'https://github.com/blocklens',
    twitter: 'https://twitter.com/blocklens',
  },
} as const;
