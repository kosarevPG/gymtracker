import { useState, useEffect, useRef } from 'react';
import { LAST_ACTIVE_KEY, SESSION_ID_KEY, ORDER_COUNTER_KEY } from '../constants';

export const useSession = () => {
  const [sessionId, setSessionId] = useState('');
  const orderCounterRef = useRef(0);

  useEffect(() => {
    const lastActive = localStorage.getItem(LAST_ACTIVE_KEY);
    const savedSession = localStorage.getItem(SESSION_ID_KEY);
    const savedOrder = localStorage.getItem(ORDER_COUNTER_KEY);
    const now = Date.now();

    if (!lastActive || (now - parseInt(lastActive)) > 14400000 || !savedSession) {
      const newId = crypto.randomUUID();
      setSessionId(newId);
      orderCounterRef.current = 0;
      localStorage.setItem(SESSION_ID_KEY, newId);
    } else {
      orderCounterRef.current = parseInt(savedOrder || '0');
      setSessionId(savedSession);
    }
    localStorage.setItem(LAST_ACTIVE_KEY, now.toString());
  }, []);

  const incrementOrder = () => {
    orderCounterRef.current += 1;
    const next = orderCounterRef.current;
    localStorage.setItem(ORDER_COUNTER_KEY, next.toString());
    localStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString());
    return next;
  };
  return { sessionId, incrementOrder };
};
