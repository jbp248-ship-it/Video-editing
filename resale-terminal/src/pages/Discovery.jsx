import { Search } from 'lucide-react';
import SearchBar from '../components/SearchBar';
import EventCard from '../components/EventCard';
import { useSearch } from '../hooks/useSearch';

export default function Discovery() {
  const { results, loading, error, search } = useSearch();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100 mb-1 flex items-center gap-2">
          <Search className="w-6 h-6 text-emerald-400" />
          Event Discovery
        </h1>
        <p className="text-sm text-slate-400">
          Search for artists or teams to find resale opportunities
        </p>
      </div>

      <div className="mb-6">
        <SearchBar onSearch={search} loading={loading} />
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {results.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {results.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      ) : !loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <Search className="w-12 h-12 mb-4 opacity-30" />
          <p className="text-lg">Search for an artist or team to discover opportunities</p>
          <p className="text-sm mt-1">Try &quot;Taylor Swift&quot;, &quot;Lakers&quot;, or &quot;Beyoncé&quot;</p>
        </div>
      ) : null}
    </div>
  );
}
