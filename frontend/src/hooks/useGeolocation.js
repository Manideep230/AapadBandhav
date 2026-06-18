import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';

export const useGeolocationPermission = () => {
  const [permissionState, setPermissionState] = useState('unknown'); // 'granted', 'prompt', 'denied', 'unsupported'

  useEffect(() => {
    if (!navigator.geolocation) {
      setPermissionState('unsupported');
      return;
    }

    const checkPermission = async () => {
      try {
        if (navigator.permissions && navigator.permissions.query) {
          const status = await navigator.permissions.query({ name: 'geolocation' });
          setPermissionState(status.state);

          const handleStateChange = () => {
            setPermissionState(status.state);
            if (status.state === 'denied') {
              toast.error(
                'Location access is blocked. Please enable location permissions in your browser settings to use live tracking and response features.',
                { id: 'geo-denied-toast', duration: 10000 }
              );
            } else if (status.state === 'granted') {
              toast.success('Location access enabled.', { id: 'geo-granted-toast' });
            }
          };

          status.addEventListener('change', handleStateChange);

          // If in prompt condition, trigger request immediately
          if (status.state === 'prompt') {
            navigator.geolocation.getCurrentPosition(
              () => {
                setPermissionState('granted');
                toast.success('Location access granted.', { id: 'geo-granted-toast' });
              },
              (err) => {
                if (err.code === err.PERMISSION_DENIED) {
                  setPermissionState('denied');
                  toast.error(
                    'Location access is blocked. Please enable location permissions in your browser settings to use live tracking and response features.',
                    { id: 'geo-denied-toast', duration: 10000 }
                  );
                }
              },
              { enableHighAccuracy: true, timeout: 5000 }
            );
          } else if (status.state === 'denied') {
            toast.error(
              'Location access is blocked. Please enable location permissions in your browser settings to use live tracking and response features.',
              { id: 'geo-denied-toast', duration: 10000 }
            );
          }

          return () => status.removeEventListener('change', handleStateChange);
        } else {
          // Fallback for older browsers
          navigator.geolocation.getCurrentPosition(
            () => setPermissionState('granted'),
            (err) => {
              if (err.code === err.PERMISSION_DENIED) {
                setPermissionState('denied');
                toast.error('Location access denied. Please enable location in browser settings.');
              }
            }
          );
        }
      } catch (err) {
        console.warn('Permissions API query failed, falling back to legacy prompt:', err);
        navigator.geolocation.getCurrentPosition(
          () => setPermissionState('granted'),
          () => setPermissionState('denied')
        );
      }
    };

    checkPermission();
  }, []);

  return permissionState;
};

export default useGeolocationPermission;
