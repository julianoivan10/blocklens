import { HeroSection } from '@/features/landing/hero-section';
import { SignalsSection } from '@/features/landing/signals-section';
import { InstrumentsSection } from '@/features/landing/instruments-section';
import { DossierSection } from '@/features/landing/dossier-section';
import { JudgementSection } from '@/features/landing/judgement-section';
import { ClosingSection } from '@/features/landing/closing-section';

/**
 * The landing page reads as one narrative: the claim, what research
 * means here, the instruments, the artefact itself, how provenance is
 * handled, then the ask. Each section has a different composition on
 * purpose — the repeated heading/subtitle/three-cards rhythm is what
 * made the previous version feel generated.
 *
 * Statically rendered and revalidated every five minutes: the hero and
 * the dossier preview read live figures, so the page must not freeze at
 * whatever the providers returned during the build.
 */
export const revalidate = 300;

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <SignalsSection />
      <InstrumentsSection />
      <DossierSection />
      <JudgementSection />
      <ClosingSection />
    </>
  );
}
