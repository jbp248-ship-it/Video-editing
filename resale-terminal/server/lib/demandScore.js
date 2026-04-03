export function computeDemandScore({ seatgeekScore = 0, resalePrice = 0, faceValue = 0, eventDate = null }) {
  // SeatGeek popularity (0-1 normalized to 0-40)
  const popularityComponent = Math.min(seatgeekScore, 1) * 40;

  // Spread ratio: resale/face, capped contribution at 40
  const spreadRatio = faceValue > 0 ? resalePrice / faceValue : 1;
  const spreadComponent = Math.min(spreadRatio, 4) / 4 * 40;

  // Date proximity: closer events = higher demand (max 20)
  let dateComponent = 10; // default mid-range
  if (eventDate) {
    const daysOut = Math.max(0, (new Date(eventDate) - new Date()) / (1000 * 60 * 60 * 24));
    if (daysOut <= 3) dateComponent = 20;
    else if (daysOut <= 7) dateComponent = 17;
    else if (daysOut <= 14) dateComponent = 14;
    else if (daysOut <= 30) dateComponent = 10;
    else if (daysOut <= 60) dateComponent = 6;
    else dateComponent = 3;
  }

  return Math.round(Math.min(100, popularityComponent + spreadComponent + dateComponent));
}
