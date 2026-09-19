import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono, Newsreader } from 'next/font/google';
import './globals.css';
import { siteConfig } from '@/config/site';
import { AuthProvider } from '@/components/providers/auth-provider';
import { SearchProvider } from '@/components/providers/search-provider';
import { ToastProvider } from '@/components/ui/toast';
import { CommandPalette } from '@/features/search/command-palette';

/* Interface voice. */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

/* Data and structural-label voice. Mono carries labels here, not
   just numbers — see .t-micro in globals.css. */
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

/* Editorial display voice. Used only for headline moments, never
   for UI chrome and never for figures. */
const newsreader = Newsreader({
  subsets: ['latin'],
  variable: '--font-newsreader',
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: `${siteConfig.name} — ${siteConfig.tagline}`,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  metadataBase: new URL(siteConfig.url),
  openGraph: {
    type: 'website',
    siteName: siteConfig.name,
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
    url: siteConfig.url,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
  },
};

export const viewport: Viewport = {
  themeColor: '#100e0c',
  colorScheme: 'dark',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} ${newsreader.variable}`}
    >
      <body className="bg-ground font-sans text-ink antialiased">
        <a
          href="#main"
          className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-100 focus-visible:rounded-sm focus-visible:bg-panel-raised focus-visible:px-3 focus-visible:py-2 focus-visible:text-sm focus-visible:text-ink"
        >
          Skip to content
        </a>
        <AuthProvider>
          <SearchProvider>
            <ToastProvider>
              {children}
              <CommandPalette />
            </ToastProvider>
          </SearchProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
