const styles = {
  Buy: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  Wait: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  Avoid: 'bg-red-500/20 text-red-400 border-red-500/30',
};

export default function AIBadge({ recommendation, confidence }) {
  const colorClass = styles[recommendation] || styles.Wait;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold border rounded-full ${colorClass}`}
    >
      <span>{recommendation}</span>
      {confidence != null && (
        <span className="opacity-75">{confidence}%</span>
      )}
    </span>
  );
}
