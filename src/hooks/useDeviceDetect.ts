import { useState, useEffect } from 'react';

type DeviceInfo = {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isTouchDevice: boolean;
};

export function useDeviceDetect(): DeviceInfo {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>({
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    isTouchDevice: false,
  });

  useEffect(() => {
    const checkDevice = () => {
      // Check for touch support
      const hasTouchSupport =
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        // @ts-expect-error msMaxTouchPoints is an IE-specific property
        (navigator.msMaxTouchPoints !== undefined && navigator.msMaxTouchPoints > 0);

      // Screen size based detection
      const width = window.innerWidth;
      const isMobileView = width < 768;
      const isTabletView = width >= 768 && width < 1024;
      const isDesktopView = width >= 1024;

      // User agent based detection (fallback/additional check)
      const userAgent = navigator.userAgent.toLowerCase();
      const isMobileUserAgent =
        /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);

      // Determine final device type based on all factors
      const isMobile = isMobileView || (isMobileUserAgent && !isTabletView);
      const isTablet = isTabletView || (isMobileUserAgent && !isMobileView);
      const isDesktop = isDesktopView && !isMobileUserAgent;

      setDeviceInfo({
        isMobile,
        isTablet,
        isDesktop,
        isTouchDevice: hasTouchSupport,
      });
    };

    // Check on initial load
    checkDevice();

    // Check on window resize
    window.addEventListener('resize', checkDevice);

    // Clean up event listener
    return () => {
      window.removeEventListener('resize', checkDevice);
    };
  }, []);

  return deviceInfo;
}
