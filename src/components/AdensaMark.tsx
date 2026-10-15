/**
 * Adensa brand mark — Stack Peak (concept #4, the original three-bar design):
 * Dawn Gold cap over two Adensa Night bars, stepping wider toward the ground.
 * Geometry matches 07_Brand & Marketing/Logo Suite/adensa-mark-*.svg exactly.
 *
 * Inline SVG (not an asset file) so it renders in the sidebar's dark navy, in
 * the light header, and under the PIN gate without any network request.
 */
export function AdensaMark({
  variant = 'night',
  className,
}: {
  /** 'night' = sand bars for dark surfaces · 'day' = navy bars for light surfaces */
  variant?: 'day' | 'night'
  className?: string
}) {
  const bar = variant === 'night' ? '#F5EFE6' : '#0B1B2B'
  return (
    <svg
      viewBox="0 0 512 512"
      className={className}
      role="img"
      aria-label="Adensa, go to dashboard"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="#C9A227" x="198" y="110" width="116" height="68" rx="8" />
      <rect fill={bar} x="152" y="222" width="208" height="68" rx="8" />
      <rect fill={bar} x="106" y="334" width="300" height="68" rx="8" />
    </svg>
  )
}
