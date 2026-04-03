import { useState } from 'react';
import { Calendar, MapPin, Loader2, Tag, Building2, Users, BarChart3 } from 'lucide-react';
import AIThesis from './AIThesis';
import AIBadge from './AIBadge';
import { formatCurrency, formatDate } from '../lib/format';
import { api } from '../lib/api';

function VenueSizeBadge({ size }) {
  if (!size) return null;
  const colorMap = {
    Intimate: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    Small: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    Medium: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    Large: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
    Arena: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  };
  const cls = colorMap[size] || colorMap.Medium;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-xs font-medium border rounded ${cls}`}>
      {size}
    </span>
  );
}

function SelloutBadge({ likelihood }) {
  if (!likelihood) return null;
  const config = {
    Likely: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', label: 'Likely to Sell Out' },
    Possible: { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', label: 'Possible Sellout' },
    Unlikely: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', label: 'Unlikely Sellout' },
  };
  const c = config[likelihood] || config.Possible;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded-full ${c.bg} ${c.color} ${c.border}`}>
      {c.label}
    </span>
  );
}

function SupplyBar({ listingCount, supplyRatio, venueCapacity }) {
  if (listingCount == null) return null;

  const ratio = parseFloat(supplyRatio) || 0;
  let barColor = 'bg-emerald-400';
  let barWidth = Math.min(ratio * 10, 100); // scale for visual: 10% ratio = full bar
  if (ratio > 5) {
    barColor = 'bg-red-400';
  } else if (ratio > 2) {
    barColor = 'bg-amber-400';
  }
  // Fallback width when no ratio
  if (!supplyRatio) barWidth = Math.min(listingCount / 5, 100);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <BarChart3 className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-xs text-slate-500">Supply</span>
        </div>
        <span className="text-xs font-mono text-slate-300">
          {listingCount.toLocaleString()} listings
          {supplyRatio && (
            <span className="text-slate-500"> · {supplyRatio}% of venue</span>
          )}
        </span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  );
}

function DemandBar({ score }) {
  const clampedScore = Math.max(0, Math.min(100, score));
  let barColor = 'bg-emerald-400';
  if (clampedScore < 30) barColor = 'bg-red-400';
  else if (clampedScore < 60) barColor = 'bg-amber-400';

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-500">Demand Score</span>
        <span className="text-xs font-mono text-slate-300">{clampedScore}</span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${clampedScore}%` }}
        />
      </div>
    </div>
  );
}

function PriceCell({ label, value, highlight }) {
  let textColor = 'text-slate-300';
  if (highlight === 'green') textColor = 'text-emerald-400';
  else if (highlight === 'red') textColor = 'text-red-400';

  return (
    <div>
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <p className={`text-sm font-mono font-semibold ${textColor}`}>
        {formatCurrency(value)}
      </p>
    </div>
  );
}

export default function EventCard({ event }) {
  const [aiResult, setAiResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  const handleAnalyze = async () => {
    setAiLoading(true);
    try {
      const result = await api.getAIRecommendation({
        event_name: event.name,
        venue: event.venue,
        venue_capacity: event.venueCapacity,
        venue_size: event.venueSize,
        city: event.city,
        state: event.state,
        event_date: event.date,
        seatgeek_price: event.seatgeekPrice,
        seatgeek_avg_price: event.seatgeekAvgPrice,
        seatgeek_high_price: event.seatgeekHighPrice,
        ticketmaster_price: event.ticketmasterPrice,
        ticketmaster_max_price: event.ticketmasterMaxPrice,
        listing_count: event.listingCount,
        supply_ratio: event.supplyRatio,
        seatgeek_score: event.seatgeekScore,
        popularity: event.popularity,
        demand_score: event.demandScore,
        sellout_likelihood: event.selloutLikelihood,
      });
      setAiResult(result);
    } catch {
      setAiResult({
        recommendation: 'Wait',
        confidence: 0,
        reasoning: 'Unable to get AI analysis at this time. Check that the ANTHROPIC_API_KEY is configured.',
        metrics: {
          supplyLevel: 'Medium',
          velocityEstimate: 'Moderate',
          riskLevel: 'Medium',
        },
      });
    } finally {
      setAiLoading(false);
    }
  };

  // Determine price color coding: green if resale > face (profit opportunity), red if resale < face
  const getFloorHighlight = () => {
    if (event.seatgeekPrice && event.ticketmasterPrice) {
      return event.seatgeekPrice > event.ticketmasterPrice ? 'green' : 'red';
    }
    return null;
  };

  const locationStr = [event.city, event.state].filter(Boolean).join(', ');

  return (
    <div className="bg-zinc-800 rounded-lg border border-slate-700 p-4 hover:border-emerald-500/50 transition-colors">
      {/* Header */}
      <h3 className="text-lg font-semibold text-slate-100 mb-1 line-clamp-1">
        {event.name}
      </h3>

      <div className="flex items-center gap-3 text-sm text-slate-400 mb-2">
        <span className="flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5" />
          {formatDate(event.date)}
        </span>
        {event.venue && (
          <span className="flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" />
            <span className="line-clamp-1">{event.venue}</span>
          </span>
        )}
        {locationStr && (
          <span className="text-slate-500 text-xs">{locationStr}</span>
        )}
      </div>

      {/* Venue Info Bar */}
      {(event.venueCapacity || event.venueSize) && (
        <div className="flex items-center gap-2 mb-3 px-2 py-1.5 bg-slate-900/50 rounded border border-slate-700/50">
          <Building2 className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
          {event.venueCapacity && (
            <span className="flex items-center gap-1 text-xs text-slate-300 font-mono">
              <Users className="w-3 h-3 text-slate-500" />
              {event.venueCapacity.toLocaleString()} seats
            </span>
          )}
          {event.venueCapacity && event.venueSize && (
            <span className="text-slate-600">·</span>
          )}
          <VenueSizeBadge size={event.venueSize} />
          {event.selloutLikelihood && (
            <>
              <span className="text-slate-600">·</span>
              <SelloutBadge likelihood={event.selloutLikelihood} />
            </>
          )}
        </div>
      )}

      {/* Price Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <PriceCell label="Floor" value={event.seatgeekPrice} highlight={getFloorHighlight()} />
        <PriceCell label="Avg" value={event.seatgeekAvgPrice} />
        <PriceCell label="High" value={event.seatgeekHighPrice} />
        <PriceCell label="Face Value" value={event.ticketmasterPrice} />
      </div>

      {/* Supply & Demand Section */}
      <div className="space-y-2 mb-3">
        <SupplyBar
          listingCount={event.listingCount}
          supplyRatio={event.supplyRatio}
          venueCapacity={event.venueCapacity}
        />
        <DemandBar score={event.demandScore} />
      </div>

      {/* AI Section */}
      {aiResult && (
        <div className="mb-3">
          {aiResult.metrics ? (
            <AIThesis result={aiResult} />
          ) : (
            <div className="p-2 bg-slate-900/50 rounded border border-slate-700/50">
              <div className="flex items-center gap-2 mb-1">
                <AIBadge
                  recommendation={aiResult.recommendation}
                  confidence={aiResult.confidence}
                />
              </div>
              {aiResult.reasoning && (
                <p className="text-xs text-slate-400 mt-1">{aiResult.reasoning}</p>
              )}
            </div>
          )}
        </div>
      )}

      <button
        onClick={handleAnalyze}
        disabled={aiLoading}
        className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 disabled:cursor-not-allowed text-sm font-medium rounded transition-colors flex items-center justify-center gap-2"
      >
        {aiLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Analyzing...
          </>
        ) : aiResult ? (
          'Re-Analyze'
        ) : (
          'Analyze'
        )}
      </button>
    </div>
  );
}
