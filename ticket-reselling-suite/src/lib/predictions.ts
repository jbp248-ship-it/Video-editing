import { prisma } from "./db";

export interface PricePrediction {
  eventId: string;
  eventName: string;
  currentPrice: number;
  predictedPrice24h: number;
  predictedPrice48h: number;
  predictedPriceEvent: number;
  priceDirection: "UP" | "DOWN" | "STABLE";
  confidence: number;
  selloutProbability: number;
  estimatedSelloutDate: string | null;
  recommendation: "BUY" | "SELL" | "HOLD" | "AVOID";
  reasoning: string;
}

// ─── Linear Regression ──────────────────────────────────────────────────────
// Ordinary least squares on (x, y) points. Returns slope, intercept, and R².

function linearRegression(points: { x: number; y: number }[]): {
  slope: number;
  intercept: number;
  r2: number;
} {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.y ?? 0, r2: 0 };

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumX2 += p.x * p.x;
    sumY2 += p.y * p.y;
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) {
    return { slope: 0, intercept: sumY / n, r2: 0 };
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // Coefficient of determination (R²)
  const yMean = sumY / n;
  let ssTot = 0;
  let ssRes = 0;
  for (const p of points) {
    const predicted = slope * p.x + intercept;
    ssRes += (p.y - predicted) ** 2;
    ssTot += (p.y - yMean) ** 2;
  }

  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  return { slope, intercept, r2 };
}

// ─── Exponential Moving Average ─────────────────────────────────────────────
// Smooths a value series. Period controls how much weight recent values get.

function ema(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  if (period < 1) period = 1;

  const k = 2 / (period + 1);
  const result: number[] = [values[0]];

  for (let i = 1; i < values.length; i++) {
    result.push(values[i] * k + result[i - 1] * (1 - k));
  }

  return result;
}

// ─── Predict a single event ─────────────────────────────────────────────────

export async function predictEvent(
  eventId: string
): Promise<PricePrediction | null> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      marketSnapshots: {
        orderBy: { capturedAt: "asc" },
      },
    },
  });

  if (!event) return null;

  // Cast to any[] since some schema fields (soldPercentage, etc.) may not
  // be in the generated client yet until the next `prisma generate`.
  const snapshots = event.marketSnapshots as any[];
  const now = Date.now();
  const eventTime = event.eventDate.getTime();
  const hoursToEvent = Math.max(0, (eventTime - now) / 3_600_000);

  // Need at least 5 data points for meaningful predictions
  const MIN_POINTS = 5;
  const hasEnoughData = snapshots.length >= MIN_POINTS;

  // Current price: most recent snapshot's get-in price
  const latest = snapshots[snapshots.length - 1];
  const currentPrice = latest?.getInPrice ?? 0;

  if (!hasEnoughData) {
    return {
      eventId: event.id,
      eventName: event.name,
      currentPrice,
      predictedPrice24h: currentPrice,
      predictedPrice48h: currentPrice,
      predictedPriceEvent: currentPrice,
      priceDirection: "STABLE",
      confidence: Math.min(snapshots.length * 5, 20), // 0-20% with < 5 points
      selloutProbability: 0,
      estimatedSelloutDate: null,
      recommendation: "HOLD",
      reasoning:
        `Insufficient data: only ${snapshots.length} snapshot(s) available. ` +
        `Need at least ${MIN_POINTS} data points for reliable predictions.`,
    };
  }

  // ── Build time series (hours from first snapshot) ──────────────────────
  const t0 = snapshots[0].capturedAt.getTime();

  const pricePoints: { x: number; y: number }[] = [];
  const listingPoints: { x: number; y: number }[] = [];
  const rawPrices: number[] = [];

  for (const snap of snapshots) {
    const hoursFromStart = (snap.capturedAt.getTime() - t0) / 3_600_000;
    pricePoints.push({ x: hoursFromStart, y: snap.getInPrice });
    listingPoints.push({ x: hoursFromStart, y: snap.totalListings });
    rawPrices.push(snap.getInPrice);
  }

  // ── Price regression ───────────────────────────────────────────────────
  const priceReg = linearRegression(pricePoints);

  // ── Listing regression (for sellout velocity) ──────────────────────────
  const listingReg = linearRegression(listingPoints);

  // ── EMA-smoothed recent price for short-term prediction ────────────────
  const smoothedPrices = ema(rawPrices, Math.min(5, rawPrices.length));
  const recentSmoothed = smoothedPrices[smoothedPrices.length - 1];

  // ── Hours elapsed since first snapshot ─────────────────────────────────
  const hoursElapsed = (now - t0) / 3_600_000;

  // ── Predict future prices ─────────────────────────────────────────────
  // Blend linear regression with EMA for robustness
  const blendWeight = Math.min(priceReg.r2, 0.8); // trust regression more when R² is high

  function predictPrice(hoursAhead: number): number {
    const regressionPrediction =
      priceReg.slope * (hoursElapsed + hoursAhead) + priceReg.intercept;
    // EMA-based: assume recent trend continues proportionally
    const emaTrend =
      smoothedPrices.length >= 2
        ? smoothedPrices[smoothedPrices.length - 1] -
          smoothedPrices[smoothedPrices.length - 2]
        : 0;
    const emaPrediction = recentSmoothed + emaTrend * hoursAhead;

    const blended =
      regressionPrediction * blendWeight + emaPrediction * (1 - blendWeight);
    return Math.max(0, Math.round(blended * 100) / 100);
  }

  const predictedPrice24h = predictPrice(24);
  const predictedPrice48h = predictPrice(48);
  const predictedPriceEvent = predictPrice(hoursToEvent);

  // ── Price direction ────────────────────────────────────────────────────
  // Use slope relative to current price for threshold
  const slopePercentPerHour =
    currentPrice > 0 ? (priceReg.slope / currentPrice) * 100 : 0;

  let priceDirection: "UP" | "DOWN" | "STABLE";
  if (slopePercentPerHour > 0.05) priceDirection = "UP";
  else if (slopePercentPerHour < -0.05) priceDirection = "DOWN";
  else priceDirection = "STABLE";

  // ── Confidence (0-100) ─────────────────────────────────────────────────
  // Based on: data point count, R² of price fit, time span coverage
  const dataPointScore = Math.min(snapshots.length / 20, 1) * 30; // up to 30
  const r2Score = priceReg.r2 * 40; // up to 40
  const spanHours = hoursElapsed;
  const spanScore = Math.min(spanHours / 72, 1) * 30; // up to 30 (72h = max)
  const confidence = Math.round(
    Math.min(100, dataPointScore + r2Score + spanScore)
  );

  // ── Sellout probability & estimated date ───────────────────────────────
  // listingReg.slope < 0 means listings are decreasing
  const currentListings = latest?.totalListings ?? 0;
  let selloutProbability = 0;
  let estimatedSelloutDate: string | null = null;

  if (listingReg.slope < 0 && currentListings > 0) {
    // Hours until listings reach 0, based on regression
    const predictedListingsNow =
      listingReg.slope * hoursElapsed + listingReg.intercept;
    const hoursToZero =
      predictedListingsNow > 0
        ? predictedListingsNow / Math.abs(listingReg.slope)
        : 0;

    if (hoursToZero > 0 && hoursToZero < hoursToEvent) {
      // Sellout expected before event
      const selloutDate = new Date(now + hoursToZero * 3_600_000);
      estimatedSelloutDate = selloutDate.toISOString();

      // Probability scales with how certain we are (R² of listing regression)
      // and how soon sellout is relative to event
      const urgency = 1 - hoursToZero / hoursToEvent; // closer to 1 = sooner sellout
      selloutProbability = Math.round(
        Math.min(100, listingReg.r2 * 60 + urgency * 40)
      );
    } else if (hoursToZero > 0) {
      // Sellout predicted but after event date
      selloutProbability = Math.round(
        Math.min(30, listingReg.r2 * 30)
      );
    }
  } else if (listingReg.slope >= 0) {
    // Listings are stable or increasing - low sellout chance
    selloutProbability = 0;
  }

  // Also factor in soldPercentage from latest snapshot if available
  if (latest?.soldPercentage != null && latest.soldPercentage > 70) {
    selloutProbability = Math.max(
      selloutProbability,
      Math.round(latest.soldPercentage * 0.8)
    );
  }

  // ── Recommendation ─────────────────────────────────────────────────────
  // BUY:  price trending down but demand high (listings dropping fast)
  // SELL: price near peak and listings stabilizing/increasing
  // HOLD: insufficient signal or mixed signals
  // AVOID: price dropping and demand low

  let recommendation: "BUY" | "SELL" | "HOLD" | "AVOID";
  let reasoning: string;

  const demandHigh = listingReg.slope < -1; // losing >1 listing/hour
  const demandLow = listingReg.slope >= 0;
  const priceUp = priceDirection === "UP";
  const priceDown = priceDirection === "DOWN";

  if (priceDown && demandHigh) {
    recommendation = "BUY";
    reasoning =
      "Price is currently declining but demand is strong (listings dropping rapidly). " +
      "This suggests a temporary dip before prices recover as inventory thins out. " +
      `Listings are dropping at ~${Math.abs(Math.round(listingReg.slope * 24))} per day.`;
  } else if (priceUp && demandHigh) {
    recommendation = "BUY";
    reasoning =
      "Both price and demand are rising. Early action is recommended as sellout risk is elevated. " +
      `Sellout probability: ${selloutProbability}%.`;
  } else if (priceUp && demandLow) {
    recommendation = "SELL";
    reasoning =
      "Price is trending up but demand has stalled (listings are stable or increasing). " +
      "Prices may be near their peak. Consider listing now to capture current value.";
  } else if (
    priceDirection === "STABLE" &&
    demandHigh &&
    selloutProbability > 50
  ) {
    recommendation = "BUY";
    reasoning =
      "Price is stable but inventory is depleting quickly. " +
      `Estimated sellout before event with ${selloutProbability}% probability. Prices likely to spike soon.`;
  } else if (priceDown && demandLow) {
    recommendation = "AVOID";
    reasoning =
      "Both price and demand are declining. The market is cooling for this event. " +
      "Wait for a clearer trend before committing capital.";
  } else if (priceDirection === "STABLE" && demandLow) {
    recommendation = "HOLD";
    reasoning =
      "Price and demand are both stable with no strong signals. " +
      "Monitor for changes in listing velocity or price movement.";
  } else {
    recommendation = "HOLD";
    reasoning =
      "Mixed signals: no clear trend emerges from the data. " +
      `Price trend: ${priceDirection.toLowerCase()}, listing velocity: ${Math.round(listingReg.slope * 24)}/day. ` +
      "Continue monitoring.";
  }

  // Override to HOLD if confidence is very low
  if (confidence < 25 && recommendation !== "HOLD") {
    reasoning =
      `Low confidence (${confidence}%) overrides initial ${recommendation} signal. ` +
      reasoning;
    recommendation = "HOLD";
  }

  return {
    eventId: event.id,
    eventName: event.name,
    currentPrice,
    predictedPrice24h,
    predictedPrice48h,
    predictedPriceEvent,
    priceDirection,
    confidence,
    selloutProbability,
    estimatedSelloutDate,
    recommendation,
    reasoning,
  };
}

// ─── Predict all upcoming events ────────────────────────────────────────────

export async function predictAll(): Promise<PricePrediction[]> {
  const events = await prisma.event.findMany({
    where: { eventDate: { gte: new Date() } },
    select: { id: true },
    orderBy: { eventDate: "asc" },
  });

  const predictions: PricePrediction[] = [];

  for (const event of events) {
    const prediction = await predictEvent(event.id);
    if (prediction) {
      predictions.push(prediction);
    }
  }

  return predictions;
}
