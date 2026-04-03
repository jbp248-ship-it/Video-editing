import AIBadge from './AIBadge';

const levelColors = {
  Low: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  Medium: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  High: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const velocityColors = {
  Fast: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  Moderate: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  Slow: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const velocityLabels = {
  Fast: 'Fast Selling',
  Moderate: 'Moderate',
  Slow: 'Slow',
};

const supplyLabels = {
  Low: 'Low Supply',
  Medium: 'Medium Supply',
  High: 'High Supply',
};

const riskLabels = {
  Low: 'Low Risk',
  Medium: 'Medium Risk',
  High: 'High Risk',
};

function MetricPill({ label, level, colorMap }) {
  const colorClass = colorMap[level] || colorMap.Medium || 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded-full ${colorClass}`}>
      {label}
    </span>
  );
}

export default function AIThesis({ result }) {
  if (!result) return null;

  const { recommendation, confidence, reasoning, metrics } = result;
  const supply = metrics?.supplyLevel || 'Medium';
  const velocity = metrics?.velocityEstimate || 'Moderate';
  const risk = metrics?.riskLevel || 'Medium';

  // Risk level colors are inverted: Low risk = green, High risk = red
  const riskColors = {
    Low: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    Medium: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    High: 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  return (
    <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/50 space-y-2.5">
      {/* Top row: Badge + Confidence + Risk */}
      <div className="flex items-center gap-2 flex-wrap">
        <AIBadge recommendation={recommendation} confidence={confidence} />
        <span className="text-xs text-slate-400">
          Confidence: <span className="text-slate-200 font-semibold">{confidence}%</span>
        </span>
        <MetricPill label={riskLabels[risk]} level={risk} colorMap={riskColors} />
      </div>

      {/* Reasoning paragraph */}
      {reasoning && (
        <p className="text-sm text-slate-300 leading-relaxed">{reasoning}</p>
      )}

      {/* Bottom row: Metric pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <MetricPill label={supplyLabels[supply]} level={supply} colorMap={levelColors} />
        <MetricPill label={velocityLabels[velocity]} level={velocity} colorMap={velocityColors} />
      </div>
    </div>
  );
}
