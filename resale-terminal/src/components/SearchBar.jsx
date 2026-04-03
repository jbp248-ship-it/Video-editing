import { useState, useEffect, useRef } from 'react';
import { Search, Loader2 } from 'lucide-react';

export default function SearchBar({ onSearch, loading }) {
  const [value, setValue] = useState('');
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleChange = (e) => {
    const newValue = e.target.value;
    setValue(newValue);

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      if (onSearch) onSearch(newValue);
    }, 300);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (timerRef.current) clearTimeout(timerRef.current);
    if (onSearch) onSearch(value);
  };

  return (
    <form onSubmit={handleSubmit} className="relative w-full max-w-2xl">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="text"
          value={value}
          onChange={handleChange}
          placeholder="Search artists, teams, events..."
          className="w-full pl-11 pr-10 py-3 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30 font-mono text-sm transition-colors"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-400 animate-spin" />
        )}
      </div>
    </form>
  );
}
