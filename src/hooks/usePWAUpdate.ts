import { useState, useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

export const usePWAUpdate = () => {
  const [showUpdate, setShowUpdate] = useState(false);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      // Check for updates every 60 seconds
      if (registration) {
        setInterval(() => {
          registration.update();
        }, 60 * 1000);
      }
    },
  });

  useEffect(() => {
    if (needRefresh) setShowUpdate(true);
  }, [needRefresh]);

  const update = () => {
    updateServiceWorker(true);
    setShowUpdate(false);
  };

  const dismiss = () => setShowUpdate(false);

  return { showUpdate, update, dismiss };
};
