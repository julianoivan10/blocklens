import { cn } from '@/lib/utils';

/**
 * The hero backdrop.
 *
 * This replaces an animated node-and-line network — the visual shorthand
 * every crypto landing page reaches for, and one that competed with the
 * typography it was supposed to support.
 *
 * What is here instead is a quiet measurement field: two grids at
 * different scales, one broad off-axis light source, and a horizon
 * hairline. Depth comes from the two grid densities and the mask falloff
 * rather than from perspective or 3D.
 *
 * Deliberately cheap. A server component with no JavaScript at all: no
 * canvas, no WebGL, no render loop, no client bundle. The only motion is
 * a 48-second drift of the light on the compositor, and the composition
 * is designed to look finished when that is switched off — which is what
 * happens under prefers-reduced-motion.
 */
export function FieldBackdrop({
  className,
  /** Horizon rule position, as a CSS length or percentage. */
  horizon = '72%',
}: {
  className?: string;
  horizon?: string;
}) {
  return (
    <div aria-hidden="true" className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      {/* Far grid: wide cells, the structural one. */}
      <div className="field-grid field-fade-soft absolute inset-0 opacity-90" />

      {/* Near grid: tight cells at low opacity, masked harder. The two
          densities together read as recession. */}
      <div className="field-grid-fine field-fade absolute inset-0 opacity-40" />

      {/* The light. Drifts slowly; static under reduced motion. */}
      <div className="backdrop-light anim-drift absolute inset-0" />

      {/* A horizon: one hairline that fades at both ends, giving the
          field a ground plane without drawing perspective. */}
      <div
        className="rule-h-fade absolute inset-x-0 h-px opacity-70"
        style={{ top: horizon }}
      />

      {/* Settle the field into the page at the bottom edge. */}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-linear-to-t from-ground to-transparent" />
    </div>
  );
}
