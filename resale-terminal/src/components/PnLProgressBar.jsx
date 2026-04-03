import { formatCurrency } from '../lib/format';

export default function PnLProgressBar({ current = 0, goal = 10000 }) {
  const percentage = Math.min(Math.max((current / goal) * 100, 0), 100);
  const size = 200;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="transform -rotate-90"
        >
          {/* Background track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-slate-700"
          />
          {/* Progress fill */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="text-emerald-400 transition-all duration-1000 ease-out"
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-slate-100">
            {percentage.toFixed(0)}%
          </span>
          <span className={`text-sm font-semibold ${current >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {formatCurrency(current)}
          </span>
        </div>
      </div>
      <p className="text-sm text-slate-400 mt-3">
        {formatCurrency(current)} / {formatCurrency(goal)}
      </p>
      <p className="text-xs text-slate-500 mt-1">Realized Profit Goal</p>
    </div>
  );
}
