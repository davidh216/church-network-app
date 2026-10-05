interface AvatarImageProps {
  src: string;
  /** The person's name. */
  alt: string;
  className: string;
}

/**
 * A member's avatar. Avatar URLs are user-supplied and can point at any host, so they cannot be
 * listed in next/image remotePatterns (decision P2-3): this stays a lazy-loaded <img>.
 */
export default function AvatarImage({ src, alt, className }: AvatarImageProps) {
  // eslint-disable-next-line @next/next/no-img-element -- user-supplied host, see above
  return <img src={src} alt={alt} loading="lazy" className={className} />;
}
