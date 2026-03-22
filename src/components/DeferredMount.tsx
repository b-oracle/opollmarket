import { useState, useEffect, type ReactNode } from "react";

/**
 * Delays mounting children until after initial paint + specified delay.
 * Use for non-critical providers/components that trigger network requests on mount.
 */
const DeferredMount = ({ children, delay = 2000 }: { children: ReactNode; delay?: number }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  if (!mounted) return null;
  return <>{children}</>;
};

export default DeferredMount;
