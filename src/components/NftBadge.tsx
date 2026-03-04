import { Hexagon } from "lucide-react";

/**
 * Small NFT badge indicator. Shows when avatar_url is external (not from project storage).
 * Use `absolute` positioning relative to a parent wrapper.
 */
export const isNftAvatar = (avatarUrl: string | null | undefined): boolean =>
  !!avatarUrl && !avatarUrl.includes("/storage/v1/");

const NftBadge = ({ className = "" }: { className?: string }) => (
  <div
    className={`bg-primary text-primary-foreground rounded-full p-0.5 border-2 border-background ${className}`}
    title="NFT Avatar"
  >
    <Hexagon className="w-2.5 h-2.5" />
  </div>
);

export default NftBadge;
