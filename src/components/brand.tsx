/** Mojym's twin-arch M: two connected training spaces, one platform. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7 30V17a6.5 6.5 0 0 1 13 0v13-13a6.5 6.5 0 0 1 13 0v13"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="square"
      />
      <path d="M13 30h14" stroke="currentColor" strokeWidth="4" />
    </svg>
  );
}
