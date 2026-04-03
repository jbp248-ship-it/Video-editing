import { useState } from 'react';
import { Calendar, MapPin, Loader2 } from 'lucide-react';
import AIBadge from './AIBadge';
import { formatCurrency, formatDate } from '../lib/format';
import { api } from '../lib/api';

function DemandBar({ score }) {
  const clampedScore = Math.max(0, Math.min(100, score));
  let barColor = 'bg-emerald-400';
  if (clampedScore < 30) barColor = 'bg-red-400';
  else if (clampedScore < 60) barColor = 'bg-amber-400';

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${clampedScore}%` }}
        />
      </div>
      <span className="text-xs text-slate-400 w-8 text-right">{clampedScore}</span>
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
        seatgeek_price: event.seatgeekPrice,
        ticketmaster_price: event.ticketmasterPrice,
        demand_score: event.demandScore,
        seatgeek_score: event.seatgeekScore,
        event_date: event.date,
      });
      setAiResult(result);
    } catch {
      setAiResult({
        recommendation: 'Wait',
        confidence: 0,
        reasoning: 'Unable to get AI analysis at this time.',
      });
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="bg-zinc-800 rounded-lg border border-slate-700 p-4 hover:border-emerald-500/50 transition-colors">
      <h3 className="text-lg font-semibold text-slate-100 mb-1 line-clamp-1">
        {event.name}
      </h3>

      <div className="flex items-center gap-3 text-sm text-slate-400 mb-3">
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
      </div>

      {/* Prices */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <p className="text-xs text-slate-500 mb-0.5">Floor (Resale)</p>
          <p className="text-sm font-semibold text-emerald-400">
            {formatCurrency(event.seatgeekPrice)}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-0.5">Face (Primary)</p>
          <p className="text-sm font-semibold text-slate-300">
            {formatCurrency(event.ticketmasterPrice)}
          </p>
        </div>
      </div>

      {/* Demand Score */}
      <div className="mb-3">
        <p className="text-xs text-slate-500 mb-1">Demand Score</p>
        <DemandBar score={event.demandScore} />
      </div>

      {/* AI Section */}
      {aiResult && (
        <div className="mb-3 p-2 bg-slate-900/50 rounded border border-slate-700/50">
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
        ) : (
          'Analyze'
        )}
      </button>
    </div>
  );
}
