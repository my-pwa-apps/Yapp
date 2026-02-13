import React, { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const PWAPrompts: React.FC = () => {
  // --- Install prompt ---
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Don't show if already dismissed this session or already installed
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      // Only show if not previously dismissed this session
      if (!sessionStorage.getItem('pwa-install-dismissed')) {
        setShowInstallBanner(true);
      }
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallBanner(false);
    }
    setInstallPrompt(null);
  };

  const handleDismissInstall = () => {
    setShowInstallBanner(false);
    setDismissed(true);
    sessionStorage.setItem('pwa-install-dismissed', '1');
  };

  // --- Update prompt ---
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      // Check for updates every 60 seconds
      if (r) {
        setInterval(() => { r.update(); }, 60_000);
      }
    },
  });

  return (
    <>
      {/* Install banner */}
      {showInstallBanner && !dismissed && (
        <div className="pwa-banner install-banner">
          <div className="pwa-banner-content">
            <span className="pwa-banner-icon">📲</span>
            <div>
              <strong>Install Yappin'</strong>
              <p className="pwa-banner-desc">Add to your home screen for the best experience</p>
            </div>
          </div>
          <div className="pwa-banner-actions">
            <button className="pwa-btn install" onClick={handleInstall}>Install</button>
            <button className="pwa-btn dismiss" onClick={handleDismissInstall}>Not now</button>
          </div>
        </div>
      )}

      {/* Update banner */}
      {needRefresh && (
        <div className="pwa-banner update-banner">
          <div className="pwa-banner-content">
            <span className="pwa-banner-icon">🔄</span>
            <div>
              <strong>Update Available</strong>
              <p className="pwa-banner-desc">A new version of Yappin' is ready</p>
            </div>
          </div>
          <div className="pwa-banner-actions">
            <button className="pwa-btn update" onClick={() => updateServiceWorker(true)}>
              Update Now
            </button>
            <button className="pwa-btn dismiss" onClick={() => setNeedRefresh(false)}>Later</button>
          </div>
        </div>
      )}
    </>
  );
};
