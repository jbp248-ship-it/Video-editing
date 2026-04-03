import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings as SettingsIcon, Save, CheckCircle, ExternalLink } from 'lucide-react';

const KEYS = [
  {
    field: 'ANTHROPIC_API_KEY',
    label: 'Anthropic API Key',
    placeholder: 'sk-ant-api03-...',
    description: 'Powers the Buy / Wait / Avoid AI recommendations',
    url: 'https://console.anthropic.com',
    urlLabel: 'Get free key →',
  },
  {
    field: 'SEATGEEK_CLIENT_ID',
    label: 'SeatGeek Client ID',
    placeholder: 'abc123def456...',
    description: 'Live resale prices and demand scores',
    url: 'https://seatgeek.com/account/develop',
    urlLabel: 'Get free key →',
  },
  {
    field: 'TICKETMASTER_API_KEY',
    label: 'Ticketmaster API Key',
    placeholder: 'xXxXxXxXxXxXxX...',
    description: 'Primary / face value ticket prices',
    url: 'https://developer.ticketmaster.com',
    urlLabel: 'Get free key →',
  },
  {
    field: 'TICKETSDATA_EMAIL',
    label: 'TicketsData Email (Optional)',
    placeholder: 'you@email.com',
    description: 'Multi-platform data: StubHub, VividSeats, TickPick, GameTime, Viagogo',
    url: 'https://ticketsdata.com',
    urlLabel: 'Free trial →',
  },
  {
    field: 'TICKETSDATA_PASSWORD',
    label: 'TicketsData Password (Optional)',
    placeholder: 'your-password',
    description: 'Unlocks ticket counts from 7+ platforms for accurate supply data',
    url: 'https://ticketsdata.com',
    urlLabel: 'Free trial →',
  },
];

export default function Settings() {
  const navigate = useNavigate();
  const [values, setValues] = useState({ ANTHROPIC_API_KEY: '', SEATGEEK_CLIENT_ID: '', TICKETMASTER_API_KEY: '', TICKETSDATA_EMAIL: '', TICKETSDATA_PASSWORD: '' });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        setValues({
          ANTHROPIC_API_KEY: data.ANTHROPIC_API_KEY || '',
          SEATGEEK_CLIENT_ID: data.SEATGEEK_CLIENT_ID || '',
          TICKETMASTER_API_KEY: data.TICKETMASTER_API_KEY || '',
          TICKETSDATA_EMAIL: data.TICKETSDATA_EMAIL || '',
          TICKETSDATA_PASSWORD: data.TICKETSDATA_PASSWORD || '',
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error('Failed to save');
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        navigate('/');
      }, 1000);
    } catch (err) {
      setError('Could not save settings. Is the server running?');
    }
  };

  const inputClass =
    'w-full px-3 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 text-sm font-mono focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30 transition-colors';

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
          <SettingsIcon className="w-6 h-6 text-emerald-400" />
          Settings
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Paste your API keys below — they are saved locally on your computer only.
        </p>
      </div>

      {loading ? (
        <div className="text-slate-500 text-sm">Loading...</div>
      ) : (
        <div className="space-y-5">
          {KEYS.map(({ field, label, placeholder, description, url, urlLabel }) => (
            <div key={field} className="bg-zinc-800 rounded-lg border border-slate-700 p-4">
              <div className="flex items-start justify-between mb-1">
                <label className="text-sm font-semibold text-slate-200">{label}</label>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                >
                  {urlLabel}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <p className="text-xs text-slate-500 mb-2">{description}</p>
              <input
                type="text"
                value={values[field]}
                onChange={(e) => setValues({ ...values, [field]: e.target.value })}
                placeholder={placeholder}
                className={inputClass}
              />
              {values[field] && (
                <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Key entered
                </p>
              )}
            </div>
          ))}

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleSave}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {saved ? (
              <>
                <CheckCircle className="w-4 h-4" />
                Saved!
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Keys
              </>
            )}
          </button>

          <p className="text-xs text-slate-500 text-center">
            All 3 keys are free. You only need to do this once.
          </p>
        </div>
      )}
    </div>
  );
}
