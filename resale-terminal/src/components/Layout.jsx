import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Terminal, Search, Package, TrendingUp, Bell, Menu, X } from 'lucide-react';

const navItems = [
  { to: '/', icon: Search, label: 'Discovery' },
  { to: '/inventory', icon: Package, label: 'Inventory' },
  { to: '/pnl', icon: TrendingUp, label: 'P&L Tracker' },
  { to: '/alerts', icon: Bell, label: 'Alerts' },
];

function SidebarContent({ onNavClick }) {
  return (
    <>
      <div className="p-6 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <Terminal className="w-6 h-6 text-emerald-400" />
          <h1 className="text-lg font-bold text-emerald-400 tracking-wider">
            RESALE TERMINAL
          </h1>
        </div>
      </div>

      <nav className="flex-1 py-4">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={onNavClick}
            className={({ isActive }) =>
              `flex items-center gap-3 px-6 py-3 text-sm transition-colors ${
                isActive
                  ? 'bg-slate-800 border-l-2 border-emerald-400 text-emerald-400'
                  : 'border-l-2 border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`
            }
          >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-700">
        <p className="text-xs text-slate-500">v1.0 | PWA Ready</p>
      </div>
    </>
  );
}

export default function Layout({ children }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col w-64 bg-zinc-900 border-r border-slate-700 flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-zinc-900 border-r border-slate-700 transform transition-transform md:hidden flex flex-col ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SidebarContent onNavClick={() => setMobileMenuOpen(false)} />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="md:hidden flex items-center gap-3 p-4 bg-zinc-900 border-b border-slate-700">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="text-slate-400 hover:text-slate-200"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-emerald-400" />
            <span className="text-sm font-bold text-emerald-400 tracking-wider">
              RESALE TERMINAL
            </span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
