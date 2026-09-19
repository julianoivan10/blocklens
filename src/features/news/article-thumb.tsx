import { cn } from '@/lib/utils';

/**
 * An article's lead image.
 *
 * Deliberately a plain `<img>` rather than `next/image`. The feed pulls
 * images from whatever CDN each publication happens to use — Sanity,
 * WordPress, S3, and anything GNews returns — so optimising them would
 * mean either an allowlist that cannot be written in advance or proxying
 * arbitrary third-party URLs through our own server. Neither is worth it
 * for a thumbnail.
 *
 * `alt` is empty on purpose: the headline sits directly beside this and
 * already names the story, so the image is decorative. It also means a
 * dead image URL degrades to the sunken panel behind it rather than to a
 * block of broken alt text.
 *
 * `referrerPolicy` keeps our routes out of the publisher's logs.
 */
export function ArticleThumb({
  src,
  className,
  sizes = '(min-width: 640px) 112px, 88px',
}: {
  src: string;
  className?: string;
  sizes?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative block shrink-0 overflow-hidden border border-line bg-panel-sunken',
        className
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- third-party
          CDNs of unknown host; see note above. */}
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        sizes={sizes}
        referrerPolicy="no-referrer"
        className="size-full object-cover"
      />
      {/* A hairline wash keeps bright press photography from fighting the
          dark interface. */}
      <span className="absolute inset-0 bg-ground/15" />
    </span>
  );
}
