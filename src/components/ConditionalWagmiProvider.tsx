import { type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import LazyWagmiProvider from "./LazyWagmiProvider";

/** Routes that actually need the Web3/Wagmi provider */
const WEB3_ROUTES = ["/profile", "/admin"];

const needsWeb3 = (pathname: string) =>
  WEB3_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"));

/**
 * Only mounts the heavy Wagmi provider when the user is on a route that needs wallet features.
 * This avoids downloading/parsing the ~1.6 MB Web3 chunk for most sessions.
 */
const ConditionalWagmiProvider = ({ children }: { children: ReactNode }) => {
  const location = useLocation();

  if (needsWeb3(location.pathname)) {
    return <LazyWagmiProvider>{children}</LazyWagmiProvider>;
  }

  return <>{children}</>;
};

export default ConditionalWagmiProvider;
