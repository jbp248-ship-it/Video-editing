const BASE = '';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  searchSeatGeek: (q) => request(`/api/seatgeek/events?q=${encodeURIComponent(q)}`),
  searchTicketmaster: (keyword) => request(`/api/ticketmaster/events?keyword=${encodeURIComponent(keyword)}`),
  getAIRecommendation: (data) => request('/api/ai/recommend', { method: 'POST', body: JSON.stringify(data) }),
  getInventory: () => request('/api/inventory'),
  getInventorySummary: () => request('/api/inventory/summary'),
  addInventory: (data) => request('/api/inventory', { method: 'POST', body: JSON.stringify(data) }),
  updateInventory: (id, data) => request(`/api/inventory/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteInventory: (id) => request(`/api/inventory/${id}`, { method: 'DELETE' }),
};
