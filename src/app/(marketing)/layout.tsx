import { MarketingNav } from '@/components/layout/marketing-nav';
import { Footer } from '@/components/layout/footer';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <MarketingNav />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}
