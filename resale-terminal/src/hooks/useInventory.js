import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

export function useInventory() {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({
    totalInvested: 0,
    currentValue: 0,
    realizedProfit: 0,
    totalItems: 0,
    soldItems: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [inventoryData, summaryData] = await Promise.allSettled([
        api.getInventory(),
        api.getInventorySummary(),
      ]);

      if (inventoryData.status === 'fulfilled') {
        const fetchedItems = inventoryData.value?.items || inventoryData.value || [];
        setItems(fetchedItems);

        // Compute summary from items if summary endpoint fails
        if (summaryData.status === 'fulfilled' && summaryData.value) {
          setSummary({
            totalInvested: summaryData.value.totalInvested || 0,
            currentValue: summaryData.value.currentValue || 0,
            realizedProfit: summaryData.value.realizedProfit || 0,
            totalItems: summaryData.value.totalItems || fetchedItems.length,
            soldItems: summaryData.value.soldItems || 0,
          });
        } else {
          // Fallback: compute from items
          const totalInvested = fetchedItems.reduce(
            (sum, item) => sum + (item.purchase_price || 0) * (item.quantity || 1),
            0
          );
          const currentValue = fetchedItems
            .filter((item) => !item.sold_price)
            .reduce(
              (sum, item) => sum + (item.current_value || item.purchase_price || 0) * (item.quantity || 1),
              0
            );
          const realizedProfit = fetchedItems
            .filter((item) => item.sold_price)
            .reduce(
              (sum, item) =>
                sum + ((item.sold_price || 0) - (item.purchase_price || 0)) * (item.quantity || 1),
              0
            );
          const soldItems = fetchedItems.filter((item) => item.sold_price).length;

          setSummary({
            totalInvested,
            currentValue,
            realizedProfit,
            totalItems: fetchedItems.length,
            soldItems,
          });
        }
      } else {
        throw new Error(inventoryData.reason?.message || 'Failed to fetch inventory');
      }
    } catch (err) {
      setError(err.message || 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addItem = useCallback(
    async (data) => {
      try {
        await api.addInventory(data);
        await refresh();
      } catch (err) {
        setError(err.message);
        throw err;
      }
    },
    [refresh]
  );

  const updateItem = useCallback(
    async (id, data) => {
      try {
        await api.updateInventory(id, data);
        await refresh();
      } catch (err) {
        setError(err.message);
        throw err;
      }
    },
    [refresh]
  );

  const deleteItem = useCallback(
    async (id) => {
      try {
        await api.deleteInventory(id);
        await refresh();
      } catch (err) {
        setError(err.message);
        throw err;
      }
    },
    [refresh]
  );

  const markSold = useCallback(
    async (id, soldPrice) => {
      try {
        await api.updateInventory(id, {
          sold_price: soldPrice,
          sold_at: new Date().toISOString(),
        });
        await refresh();
      } catch (err) {
        setError(err.message);
        throw err;
      }
    },
    [refresh]
  );

  return { items, summary, loading, error, addItem, updateItem, deleteItem, markSold, refresh };
}
