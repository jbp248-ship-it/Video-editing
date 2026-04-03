/**
 * Calculate velocity metrics from snapshots
 * @param {Array} snapshots - array of { timestamp, listingCount, floorPrice, avgPrice }
 * @returns velocity metrics
 */
export function calculateVelocity(snapshots) {
  if (!snapshots || snapshots.length < 2) {
    return {
      velocity: 'Unknown',
      dailyChange: 0,
      weeklyChange: 0,
      priceDirection: 'Stable',
      listingsTrend: 'Stable',
      daysTracked: snapshots?.length || 0,
      totalListingChange: 0,
      latestListings: snapshots && snapshots.length > 0 ? snapshots[snapshots.length - 1].listingCount : 0,
      latestPrice: snapshots && snapshots.length > 0 ? snapshots[snapshots.length - 1].floorPrice : null,
    };
  }

  // Sort by timestamp
  const sorted = [...snapshots].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const latest = sorted[sorted.length - 1];
  const previous = sorted[sorted.length - 2];
  const oldest = sorted[0];

  // Daily listing change (negative = tickets selling = good)
  const dailyChange = latest.listingCount - previous.listingCount;

  // Total change over tracking period
  const totalChange = latest.listingCount - oldest.listingCount;
  const daysTracked = Math.max(1, (new Date(latest.timestamp) - new Date(oldest.timestamp)) / (1000 * 60 * 60 * 24));
  const avgDailyChange = totalChange / daysTracked;

  // Weekly projection
  const weeklyChange = Math.round(avgDailyChange * 7);

  // Velocity classification
  let velocity;
  if (avgDailyChange < -20) velocity = 'Very Fast';
  else if (avgDailyChange < -5) velocity = 'Fast';
  else if (avgDailyChange < -1) velocity = 'Moderate';
  else if (avgDailyChange <= 1) velocity = 'Slow';
  else velocity = 'Increasing'; // listings growing = bad sign

  // Price direction
  let priceDirection = 'Stable';
  if (latest.floorPrice && oldest.floorPrice) {
    const priceChange = ((latest.floorPrice - oldest.floorPrice) / oldest.floorPrice) * 100;
    if (priceChange > 5) priceDirection = 'Rising';
    else if (priceChange < -5) priceDirection = 'Falling';
  }

  // Listings trend
  let listingsTrend = 'Stable';
  if (totalChange < -10) listingsTrend = 'Decreasing';
  else if (totalChange > 10) listingsTrend = 'Increasing';

  return {
    velocity,
    dailyChange: Math.round(avgDailyChange),
    weeklyChange,
    priceDirection,
    listingsTrend,
    daysTracked: Math.round(daysTracked),
    totalListingChange: totalChange,
    latestListings: latest.listingCount,
    latestPrice: latest.floorPrice,
  };
}

/**
 * Sort events by how fast they're selling (best opportunities first)
 */
export function rankByVelocity(events) {
  return events.sort((a, b) => {
    const velOrder = { 'Very Fast': 0, 'Fast': 1, 'Moderate': 2, 'Slow': 3, 'Increasing': 4, 'Unknown': 5 };
    return (velOrder[a.velocity] || 5) - (velOrder[b.velocity] || 5);
  });
}
