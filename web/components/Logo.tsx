/* eslint-disable @next/next/no-img-element */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <img
      src="/logo.svg"
      alt="Geometric Forms"
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: 'contain' }}
      aria-hidden
    />
  );
}
