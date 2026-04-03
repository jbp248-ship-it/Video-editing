import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../lib/api';

export function useMarketData(items = [], pollInterval = 60000) {
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const intervalRef = useRef(null);

  const refreshPrices = useCallback(async () => {
    const itemsWithSeatgeek = items.filter(
      (item) => item.seatgeek_event_id && !item.sold_price
    );

    if (itemsWithSeatgeek.length === 0) return;

    setRefreshing(true);
    try {
      const updates = await Promise.allSettled(
        itemsWithSeatgeek.map(async (item) => {
          try {
            const data = await api.searchSeatGeek(item.seatgeek_event_id);
            const events = data?.events || data || [];
            const event = Array.isArray(events) ? events[0] : events;
            const lowestPrice = event?.stats?.lowest_price;

            if (lowestPrice && lowestPrice !== item.current_value) {
              await api.updateInventory(item.id, {
                current_value: lowestPrice,
              });
              return { id: item.id, current_value: lowestPrice };
            }
            return null;
          } catch {
            return null;
          }
        })
      );

      const successful = updates
        .filter((r) => r.status === 'fulfilled' && r.value)
        .map((r) => r.value);

      if (successful.length > 0) {
        setLastUpdated(new Date());
      }
    } catch {
      // Silent failure for background polling
    } finally {
      setRefreshing(false);
    }
  }, [items]);

  useEffect(() => {
    // Initial refresh
    if (items.length > 0) {
      refreshPrices();
    }

    // Set up polling interval
    intervalRef.current = setInterval(() => {
      refreshPrices();
    }, pollInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [refreshPrices, pollInterval, items.length]);

  return { refreshing, lastUpdated };
}
