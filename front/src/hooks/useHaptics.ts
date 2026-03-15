export const useHaptics = () => {
  const haptic = (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => {
    if (!navigator.vibrate) return;
    if (style === 'light') navigator.vibrate(10);
    else if (style === 'medium') navigator.vibrate(20);
    else navigator.vibrate(40);
  };

  const notify = (type: 'error' | 'success' | 'warning') => {
    if (!navigator.vibrate) return;

    if (type === 'error') {
      navigator.vibrate([50, 100, 50, 100, 50]);
    } else if (type === 'warning') {
      navigator.vibrate([30, 50, 30]);
    } else {
      navigator.vibrate([20, 30, 20]); // success
    }
  };

  return { haptic, notify };
};
