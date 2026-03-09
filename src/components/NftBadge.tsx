/**
 * Small NFT / verified badge indicator.
 * Shows a golden Twitter/X-style checkmark when avatar_url is external (not from project storage).
 */
export const isNftAvatar = (avatarUrl: string | null | undefined): boolean =>
  !!avatarUrl && !avatarUrl.includes("/storage/v1/");

/** Golden verified tick – mirrors the X (Twitter) gold badge shape */
const GoldenTick = ({ size = 16 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-label="Verified"
  >
    {/* Starburst seal */}
    <path
      d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81C14.67 2.63 13.43 1.75 12 1.75S9.33 2.63 8.66 3.94c-1.39-.46-2.9-.2-3.91.81s-1.27 2.52-.81 3.91C2.63 9.33 1.75 10.57 1.75 12s.88 2.67 2.19 3.34c-.46 1.39-.2 2.9.81 3.91s2.52 1.27 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.67-.88 3.34-2.19c1.39.46 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34Z"
      fill="url(#gold-grad)"
    />
    {/* Checkmark */}
    <path
      d="M9.726 15.39a.75.75 0 0 1-.53-.22l-2.72-2.72a.75.75 0 1 1 1.06-1.06l2.19 2.19 4.99-4.99a.75.75 0 1 1 1.06 1.06l-5.52 5.52a.75.75 0 0 1-.53.22Z"
      fill="#fff"
    />
    <defs>
      <linearGradient id="gold-grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
        <stop stopColor="#F7D86C" />
        <stop offset="0.5" stopColor="#E8B730" />
        <stop offset="1" stopColor="#C6951B" />
      </linearGradient>
    </defs>
  </svg>
);

const NftBadge = ({ className = "", size = 16 }: { className?: string; size?: number }) => (
  <span className={`inline-flex items-center ${className}`} title="Verified">
    <GoldenTick size={size} />
  </span>
);

export default NftBadge;
