import React, { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const PWAPrompts: React.FC = () => {
  // --- Install prompt (Android/Windows/Desktop) ---
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // --- iOS install guide ---
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    // Don't show if already installed as standalone PWA
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if ((navigator as Navigator & { standalone?: boolean }).standalone) return;

    // Detect iOS Safari (not Chrome/Firefox on iOS — they can't install PWAs)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.userAgent.includes('Mac') && 'ontouchend' in document);
    const isSafari = /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(navigator.userAgent);

    if (isIOS && isSafari && !sessionStorage.getItem('pwa-install-dismissed')) {
      setShowIOSGuide(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
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
    setShowIOSGuide(false);
    setDismissed(true);
    sessionStorage.setItem('pwa-install-dismissed', '1');
  };

  // --- Update prompt ---
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, r) {
      // Check for updates every 60 seconds
      if (r) {
        setInterval(() => { r.update(); }, 60_000);
      }
    },
  });

  return (
    <>
      {/* Install banner (Android/Windows/Desktop) */}
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

      {/* iOS Safari install guide */}
      {showIOSGuide && !dismissed && (
        <div className="pwa-banner install-banner">
          <div className="pwa-banner-content">
            <span className="pwa-banner-icon">📲</span>
            <div>
              <strong>Install Yappin'</strong>
              <p className="pwa-banner-desc">
                Tap{' '}
                <span className="ios-share-icon" aria-label="Share">
                  <svg width="14" height="18" viewBox="0 0 14 18" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ verticalAlign: 'middle' }}>
                    <path d="M7 1v10M3 5l4-4 4 4M1 10v5a2 2 0 002 2h8a2 2 0 002-2v-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
                {' '}then <strong>"Add to Home Screen"</strong> for notifications &amp; the full app experience
              </p>
            </div>
          </div>
          <div className="pwa-banner-actions">
            <button className="pwa-btn dismiss" onClick={handleDismissInstall}>Got it</button>
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
