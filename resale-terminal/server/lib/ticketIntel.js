/**
 * Classify venue size based on capacity
 */
export function classifyVenue(capacity) {
  if (!capacity) return { size: 'Unknown', category: 'unknown' };
  if (capacity < 1000) return { size: 'Intimate', category: 'intimate' };
  if (capacity < 5000) return { size: 'Small', category: 'small' };
  if (capacity < 15000) return { size: 'Medium', category: 'medium' };
  if (capacity < 30000) return { size: 'Large', category: 'large' };
  return { size: 'Arena/Stadium', category: 'arena' };
}

/**
 * Compute supply metrics
 */
export function computeSupply(listingCount, venueCapacity, popularityScore) {
  if (!venueCapacity || venueCapacity <= 0) {
    return { supplyRatio: null, supplyLevel: 'Unknown', selloutLikelihood: 'Unknown', estimatedRemaining: null };
  }

  const supplyRatio = (listingCount / venueCapacity) * 100;

  let supplyLevel;
  if (supplyRatio < 2) supplyLevel = 'Low';
  else if (supplyRatio < 5) supplyLevel = 'Medium';
  else supplyLevel = 'High';

  // Sellout likelihood based on supply + demand signals
  let selloutLikelihood;
  const pop = popularityScore || 0;
  if (supplyRatio < 1 && pop > 0.7) selloutLikelihood = 'Very High';
  else if (supplyRatio < 2 && pop > 0.5) selloutLikelihood = 'High';
  else if (supplyRatio < 4 && pop > 0.3) selloutLikelihood = 'Medium';
  else selloutLikelihood = 'Low';

  // Estimate remaining tickets: rough formula
  // Low listing count + high popularity = most primary tickets sold
  const soldFraction = Math.min(0.95, pop * 0.8 + 0.1);
  const estimatedRemaining = Math.round(venueCapacity * (1 - soldFraction));

  return { supplyRatio: Math.round(supplyRatio * 100) / 100, supplyLevel, selloutLikelihood, estimatedRemaining };
}

/**
 * Compute price spread and margin opportunity
 */
export function computeSpread(resaleFloor, faceValue) {
  if (!resaleFloor || !faceValue || faceValue <= 0) {
    return { spread: null, spreadPercent: null, hasMargin: false };
  }
  const spread = resaleFloor - faceValue;
  const spreadPercent = Math.round((spread / faceValue) * 10000) / 100;
  return { spread: Math.round(spread * 100) / 100, spreadPercent, hasMargin: spread > 0 };
}

/**
 * Generate a simple investment signal
 */
export function generateSignal(supply, demand, spread) {
  let score = 50; // neutral

  // Supply factor: low supply = bullish
  if (supply.supplyLevel === 'Low') score += 20;
  else if (supply.supplyLevel === 'Medium') score += 5;
  else if (supply.supplyLevel === 'High') score -= 15;

  // Demand factor: high demand = bullish
  if (demand.score > 70) score += 15;
  else if (demand.score > 40) score += 5;
  else score -= 10;

  // Spread factor: positive spread = bullish
  if (spread.hasMargin && spread.spreadPercent > 50) score += 15;
  else if (spread.hasMargin) score += 5;
  else if (spread.spread && spread.spread < 0) score -= 15;

  // Sellout factor
  if (supply.selloutLikelihood === 'Very High') score += 10;
  else if (supply.selloutLikelihood === 'High') score += 5;

  score = Math.max(0, Math.min(100, score));

  let signal;
  if (score >= 70) signal = 'Strong Buy';
  else if (score >= 55) signal = 'Buy';
  else if (score >= 40) signal = 'Hold';
  else signal = 'Avoid';

  return { signal, score };
}
