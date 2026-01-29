import { useEffect, useRef, useState, useCallback } from 'react';

interface ServiceWorkerMessage {
  type: string;
  data?: unknown;
  timestamp?: number;
}

export interface UseServiceWorkerReturn {
  isRegistered: boolean;
  isSupported: boolean;
  notificationPermission: NotificationPermission | null;
  requestNotificationPermission: () => Promise<NotificationPermission>;
  sendMessage: (message: ServiceWorkerMessage) => void;
}

export function useServiceWorker(
  onMessage?: (message: ServiceWorkerMessage) => void
): UseServiceWorkerReturn {
  const [isRegistered, setIsRegistered] = useState(false);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission | null>(null);

  const isSupported = 'serviceWorker' in navigator;
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  // Register service worker
  useEffect(() => {
    if (!isSupported) return;

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        });

        registrationRef.current = registration;
        setIsRegistered(true);
        console.log('[App] Service worker registered');

        // Check for updates
        registration.addEventListener('updatefound', () => {
          console.log('[App] Service worker update found');
        });

        // Tell SW to start background updates
        if (registration.active) {
          registration.active.postMessage({ type: 'START_UPDATES' });
        }
      } catch (error) {
        console.error('[App] Service worker registration failed:', error);
      }
    };

    // Check if already registered
    navigator.serviceWorker.getRegistration().then((existing) => {
      if (existing) {
        registrationRef.current = existing;
        setIsRegistered(true);

        // Ensure updates are running
        if (existing.active) {
          existing.active.postMessage({ type: 'START_UPDATES' });
        }
      } else {
        registerSW();
      }
    });

    // Listen for messages from service worker
    const handleMessage = (event: MessageEvent) => {
      if (onMessage) {
        onMessage(event.data as ServiceWorkerMessage);
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, [isSupported, onMessage]);

  // Check notification permission on mount
  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  // Request notification permission
  const requestNotificationPermission =
    useCallback(async (): Promise<NotificationPermission> => {
      if (!('Notification' in window)) {
        return 'denied';
      }

      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      return permission;
    }, []);

  // Send message to service worker
  const sendMessage = useCallback((message: ServiceWorkerMessage) => {
    if (registrationRef.current?.active) {
      registrationRef.current.active.postMessage(message);
    }
  }, []);

  return {
    isRegistered,
    isSupported,
    notificationPermission,
    requestNotificationPermission,
    sendMessage,
  };
}
