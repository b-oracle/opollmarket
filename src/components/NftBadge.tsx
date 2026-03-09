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
    viewBox="0 0 22 22"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-label="Verified"
  >
    {/* Star-burst / seal shape */}
    <path
      d="M20.396 11c.002-.457-.199-.893-.544-1.203l-1.63-1.465.385-2.152a1.472 1.472 0 0 0-.602-1.44l-1.835-1.222.006-2.206a1.473 1.473 0 0 0-.938-1.378L13.53.542l-.924-1.988A1.473 1.473 0 0 0 11.27-2h-.004L9.13-.672 7.17-.123a1.473 1.473 0 0 0-1.24.84L5.02 2.68 2.85 3.135a1.473 1.473 0 0 0-.946 1.137l-.312 2.18L.033 7.845a1.472 1.472 0 0 0-.298 1.39l.69 2.1-1.167 1.854a1.472 1.472 0 0 0 .08 1.422l1.213 1.822-.333 2.176a1.472 1.472 0 0 0 .614 1.432l1.842 1.207.036 2.206a1.472 1.472 0 0 0 .95 1.372l2.11.59.937 1.98a1.473 1.473 0 0 0 1.336.556l2.139-.355 2.077.572a1.472 1.472 0 0 0 1.238-.85l.893-1.97 2.166-.468a1.472 1.472 0 0 0 .94-1.145l.293-2.183 1.566-1.384a1.473 1.473 0 0 0 .283-1.393l-.707-2.093 1.15-1.866a1.472 1.472 0 0 0-.098-1.418l-1.228-1.81.349-2.173a1.472 1.472 0 0 0-.05-.586Z"
      transform="translate(1 1)"
      fill="url(#gold-gradient)"
    />
    {/* Checkmark */}
    <path
      d="M9.585 14.93l-3.585-3.586 1.414-1.414 2.171 2.172 4.586-4.586 1.414 1.414-6 6Z"
      fill="#fff"
    />
    <defs>
      <linearGradient id="gold-gradient" x1="0" y1="0" x2="20" y2="20" gradientUnits="userSpaceOnUse">
        <stop stopColor="#F5D061" />
        <stop offset="0.5" stopColor="#E4A853" />
        <stop offset="1" stopColor="#D4942A" />
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
