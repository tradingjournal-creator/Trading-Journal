'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';

type Trade = {
  id: string;
  pnl: number;
  rr: number;
  session: string;
  strategy: string;
  operation: string;
  market: string;
  date: string;
  image_url?: string;
  quality?: string;
  profile?: string;
  notes?: string;
  no_stats?: boolean;
};

type Filters = {
  session: string;
  strategy: string;
  quality: string;
  dateFrom: string;
  dateTo: string;
};

type Profile = {
  name: string;
  initialBalance: number;
  color: string;
};

const QUALITY_ORDER = ['B', 'B+', 'A', 'A+', 'S', 'S+'];

const QUALITY_COLORS: Record<string, string> = {
  'B':  '#6b7280',
  'B+': '#60a5fa',
  'A':  '#34d399',
  'A+': '#10b981',
  'S':  '#f59e0b',
  'S+': '#f97316',
};

const PROFILE_COLORS = ['#22c55e','#60a5fa','#f59e0b','#f97316','#a78bfa','#f472b6','#34d399','#fb7185'];

const DEFAULT_PROFILES: Profile[] = [
  { name: 'Rafael', initialBalance: 50000, color: '#22c55e' },
  { name: 'Papá',   initialBalance: 25000, color: '#60a5fa' },
];

const MONTH_NAMES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

const DATE_FILTERS = ['1D','1W','1M','3M','6M','1Y','ALL'] as const;
type DateFilter = typeof DATE_FILTERS[number];

const STRATEGIES = ['Heikin Ashi', 'Zero Lag', 'Estudio de Mercado', 'ICT'];
const SESSIONS   = ['New York', 'London', 'Asia'];
const SYMBOLS    = ['MNQ', 'MCL', 'MGC'];

type ChartView = 'lineal' | 'circular';

/* ── DATE HELPERS ── */
function formatDate(raw: string): string {
  if (!raw) return '';
  const clean = raw.split('T')[0];
  if (clean.includes('-')) {
    const [y, m, d] = clean.split('-');
    return `${parseInt(d)}/${parseInt(m)}/${y}`;
  }
  return raw;
}

function formatDateShort(raw: string): string {
  if (!raw) return '';
  const clean = raw.split('T')[0];
  if (!clean.includes('-')) return raw;
  const [, m, d] = clean.split('-');
  return `${parseInt(d)}/${parseInt(m)}`;
}

function parseToDate(raw: string): Date {
  if (!raw) return new Date(0);
  const clean = raw.split('T')[0];
  if (clean.includes('-')) return new Date(clean + 'T00:00:00');
  const [d, m, y] = clean.split('/').map(Number);
  return new Date(y, m - 1, d);
}

function normalizeDate(raw: string): string {
  if (!raw) return '';
  return raw.split('T')[0];
}

function getDateCutoff(filter: DateFilter): Date {
  const now = new Date();
  switch (filter) {
    case '1D': {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case '1W':  return new Date(now.getTime() -   7 * 24 * 60 * 60 * 1000);
    case '1M':  return new Date(now.getTime() -  30 * 24 * 60 * 60 * 1000);
    case '3M':  return new Date(now.getTime() -  90 * 24 * 60 * 60 * 1000);
    case '6M':  return new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    case '1Y':  return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    default:    return new Date(0);
  }
}

/* ── PIE CHART ── */
function PieChart({ wins, losses, bes, total, profileColor }: {
  wins: number; losses: number; bes: number; total: number; profileColor: string;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  if (total === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#374151', fontSize: 14 }}>
        Sin trades aún
      </div>
    );
  }

  const size   = 200;
  const cx     = size / 2;
  const cy     = size / 2;
  const radius = 80;
  const inner  = 50;

  const slices = [
    { key: 'wins',   value: wins,   color: profileColor, label: 'Wins' },
    { key: 'losses', value: losses, color: '#ef4444',    label: 'Losses' },
    { key: 'bes',    value: bes,    color: '#6366f1',    label: 'Break Even' },
  ].filter(s => s.value > 0);

  function polarToCartesian(angle: number, r: number) {
    const rad = (angle - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function makeArc(startAngle: number, endAngle: number, r: number, ri: number) {
    const s1 = polarToCartesian(startAngle, r);
    const e1 = polarToCartesian(endAngle,   r);
    const s2 = polarToCartesian(endAngle,   ri);
    const e2 = polarToCartesian(startAngle, ri);
    const large = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${s1.x} ${s1.y} A ${r} ${r} 0 ${large} 1 ${e1.x} ${e1.y} L ${s2.x} ${s2.y} A ${ri} ${ri} 0 ${large} 0 ${e2.x} ${e2.y} Z`;
  }

  let currentAngle = 0;
  const paths = slices.map(s => {
    const sweep = (s.value / total) * 360;
    const start = currentAngle;
    const end   = currentAngle + sweep;
    currentAngle = end;
    const isHov = hovered === s.key;
    return { ...s, start, end, isHov, pct: Math.round(s.value / total * 100) };
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
      <svg width={size} height={size} style={{ flexShrink: 0 }}>
        {paths.map(p => (
          <path
            key={p.key}
            d={makeArc(p.start, p.end, p.isHov ? radius + 6 : radius, inner)}
            fill={p.color}
            opacity={hovered && !p.isHov ? 0.45 : 1}
            style={{ transition: 'all 0.2s', cursor: 'pointer' }}
            onMouseEnter={() => setHovered(p.key)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
        <text x={cx} y={cy - 6}  textAnchor="middle" fill="white"   fontSize="22" fontWeight="700">{total}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill="#6b7280" fontSize="11">trades</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {paths.map(p => (
          <div key={p.key}
            style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'default', opacity: hovered && hovered !== p.key ? 0.45 : 1, transition: 'opacity 0.2s' }}
            onMouseEnter={() => setHovered(p.key)}
            onMouseLeave={() => setHovered(null)}
          >
            <div style={{ width: 12, height: 12, borderRadius: 3, background: p.color, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>{p.label}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{p.value} trades · {p.pct}%</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── TRADING STATISTICS BAR ── */
function TradingStatistics({ wins, losses, bes, total, profileColor }: {
  wins: number; losses: number; bes: number; total: number; profileColor: string;
}) {
  const winRate = total > 0 ? (wins / total * 100) : 0;
  const winPct  = total > 0 ? (wins   / total * 100) : 0;
  const bePct   = total > 0 ? (bes    / total * 100) : 0;
  const lossPct = total > 0 ? (losses / total * 100) : 0;

  return (
    <div style={{ padding: '4px 0' }}>
      {total === 0 ? (
        <div style={{ color: '#374151', fontSize: 14, textAlign: 'center', padding: '16px 0' }}>Sin trades para este período</div>
      ) : (
        <>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Win Rate</p>
            <span style={{ fontSize: 42, fontWeight: 800, color: profileColor, letterSpacing: '-1.5px', lineHeight: 1 }}>
              {winRate.toFixed(1)}%
            </span>
          </div>
          {/* Segmented bar */}
          <div style={{ display: 'flex', height: 10, borderRadius: 99, overflow: 'hidden', gap: 2, marginBottom: 14 }}>
            {winPct  > 0 && <div style={{ width: `${winPct}%`,  background: profileColor, borderRadius: 99, transition: 'width 0.4s ease' }} />}
            {bePct   > 0 && <div style={{ width: `${bePct}%`,   background: '#6366f1',    borderRadius: 99, transition: 'width 0.4s ease' }} />}
            {lossPct > 0 && <div style={{ width: `${lossPct}%`, background: '#ef4444',    borderRadius: 99, transition: 'width 0.4s ease' }} />}
          </div>
          {/* Legend */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24, fontSize: 13 }}>
            <span style={{ color: profileColor, fontWeight: 600 }}>● {wins} Win</span>
            <span style={{ color: '#6366f1',    fontWeight: 600 }}>● {bes} BE</span>
            <span style={{ color: '#ef4444',    fontWeight: 600 }}>● {losses} Loss</span>
          </div>
        </>
      )}
    </div>
  );
}

/* ── DROPDOWN FILTER BUTTON ── */
function DropdownFilter({
  label,
  options,
  selected,
  onSelect,
  profileColor,
}: {
  label: string;
  options: string[];
  selected: string;
  onSelect: (val: string) => void;
  profileColor: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const isActive = selected !== '';

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          padding: '6px 14px',
          borderRadius: 8,
          border: `1px solid ${isActive ? profileColor : '#1f2937'}`,
          background: isActive ? 'rgba(99,102,241,0.08)' : '#0b0f1a',
          color: isActive ? profileColor : '#9ca3af',
          fontWeight: isActive ? 700 : 500,
          fontSize: 13,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          transition: 'all 0.15s',
          whiteSpace: 'nowrap' as const,
        }}
      >
        {isActive ? selected : label}
        <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 2 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          left: 0,
          background: '#111827',
          border: '1px solid #1f2937',
          borderRadius: 10,
          padding: 6,
          zIndex: 100,
          minWidth: 140,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          {isActive && (
            <button
              onClick={() => { onSelect(''); setOpen(false); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
                background: 'none', border: 'none', color: '#6b7280', fontSize: 13,
                cursor: 'pointer', borderRadius: 6,
              }}
            >
              Todos
            </button>
          )}
          {options.map(opt => (
            <button
              key={opt}
              onClick={() => { onSelect(opt); setOpen(false); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
                background: selected === opt ? 'rgba(99,102,241,0.15)' : 'none',
                border: 'none',
                color: selected === opt ? profileColor : '#d1d5db',
                fontSize: 13, cursor: 'pointer', borderRadius: 6,
                fontWeight: selected === opt ? 700 : 400,
                transition: 'background 0.1s',
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [tab, setTab]       = useState<'resumen' | 'trades' | 'calendario'>('resumen');

  /* ── Resumen filters ── */
  const [dateFilter,      setDateFilter]      = useState<DateFilter>('ALL');
  const [resumeStrategy,  setResumeStrategy]  = useState('');
  const [resumeSession,   setResumeSession]   = useState('');
  const [resumeSymbol,    setResumeSymbol]    = useState('');
  const [chartView,       setChartView]       = useState<ChartView>('lineal');

  const [profiles, setProfiles] = useState<Profile[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_PROFILES;
    try {
      const saved = localStorage.getItem('tj_profiles');
      return saved ? JSON.parse(saved) : DEFAULT_PROFILES;
    } catch { return DEFAULT_PROFILES; }
  });
  const [profile, setProfile]                     = useState<string>('Rafael');
  const [showProfileManager, setShowProfileManager] = useState(false);
  const [newProfileName, setNewProfileName]         = useState('');
  const [newProfileBalance, setNewProfileBalance]   = useState('');
  const [newProfileColor, setNewProfileColor]       = useState(PROFILE_COLORS[2]);

  useEffect(() => {
    localStorage.setItem('tj_profiles', JSON.stringify(profiles));
  }, [profiles]);

  function addProfile() {
    if (!newProfileName.trim() || !newProfileBalance) return;
    const usedColors = profiles.map(p => p.color);
    const color = newProfileColor || PROFILE_COLORS.find(c => !usedColors.includes(c)) || PROFILE_COLORS[0];
    setProfiles(prev => [...prev, { name: newProfileName.trim(), initialBalance: Number(newProfileBalance), color }]);
    setNewProfileName(''); setNewProfileBalance(''); setNewProfileColor(PROFILE_COLORS[2]);
  }

  function deleteProfile(name: string) {
    if (profiles.length <= 1) return;
    setProfiles(prev => prev.filter(p => p.name !== name));
    if (profile === name) setProfile(profiles.find(p => p.name !== name)?.name || '');
  }

  /* ── UI state ── */
  const [showAdd, setShowAdd]         = useState(false);
  const [viewTrade, setViewTrade]     = useState<Trade | null>(null);
  const [isEditing, setIsEditing]     = useState(false);

  /* ── Edit form state ── */
  const [editPnl, setEditPnl]           = useState('');
  const [editRr, setEditRr]             = useState('');
  const [editSession, setEditSession]   = useState('New York');
  const [editStrategy, setEditStrategy] = useState('Heikin Ashi');
  const [editOperation, setEditOperation] = useState('Long');
  const [editMarket, setEditMarket]     = useState('MNQ');
  const [editQuality, setEditQuality]   = useState('B');
  const [editDay, setEditDay]           = useState('1');
  const [editMonth, setEditMonth]       = useState('1');
  const [editYear, setEditYear]         = useState('2026');
  const [editNotes, setEditNotes]       = useState('');
  const [editIsBreakEven, setEditIsBreakEven] = useState(false);
  const [editNoStats, setEditNoStats]   = useState(false);
  const [editImageFile, setEditImageFile]     = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null);
  const [editRemoveImage, setEditRemoveImage]   = useState(false);
  const [editIsDragging, setEditIsDragging]     = useState(false);
  const [editUploading, setEditUploading]       = useState(false);

  function openEdit(trade: Trade) {
    const dateParts = normalizeDate(trade.date).split('-');
    setEditYear(dateParts[0] || '2026');
    setEditMonth(String(parseInt(dateParts[1] || '1')));
    setEditDay(String(parseInt(dateParts[2] || '1')));
    setEditPnl(trade.pnl === 0 ? '0' : String(trade.pnl));
    setEditRr(String(trade.rr));
    setEditSession(trade.session);
    setEditStrategy(trade.strategy);
    setEditOperation(trade.operation);
    setEditMarket(trade.market);
    setEditQuality(trade.quality || 'B');
    setEditNotes(trade.notes || '');
    setEditIsBreakEven(trade.pnl === 0 && !trade.no_stats);
    setEditNoStats(trade.no_stats || false);
    setEditImageFile(null);
    setEditImagePreview(trade.image_url || null);
    setEditRemoveImage(false);
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    setEditImageFile(null);
    setEditImagePreview(null);
  }

  function handleEditDrop(e: React.DragEvent) {
    e.preventDefault(); setEditIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setEditImageFile(file);
      setEditImagePreview(URL.createObjectURL(file));
      setEditRemoveImage(false);
    }
  }

  function handleEditFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setEditImageFile(file);
      setEditImagePreview(URL.createObjectURL(file));
      setEditRemoveImage(false);
    }
  }

  async function saveTrade() {
    if (!viewTrade) return;
    setEditUploading(true);

    let finalImageUrl: string | null | undefined = viewTrade.image_url;

    // User wants to remove the image
    if (editRemoveImage) {
      finalImageUrl = null;
    }

    // User uploaded a new image
    if (editImageFile) {
      const uploaded = await uploadImage(editImageFile);
      if (uploaded) finalImageUrl = uploaded;
    }

    const date = `${editYear}-${String(editMonth).padStart(2,'0')}-${String(editDay).padStart(2,'0')}`;
    const finalPnl = editIsBreakEven ? 0 : Number(editPnl);

    const updates = {
      pnl: finalPnl,
      rr: Number(editRr),
      session: editSession,
      strategy: editStrategy,
      operation: editOperation,
      market: editMarket,
      date,
      quality: editQuality,
      notes: editNotes.trim() || null,
      no_stats: editNoStats,
      image_url: finalImageUrl,
    };

    const { data, error } = await supabase
      .from('trades')
      .update(updates)
      .eq('id', viewTrade.id)
      .select();

    if (error) { console.error('Update error:', error.message); setEditUploading(false); return; }

    if (data?.[0]) {
      setTrades(prev => prev.map(t => t.id === viewTrade.id ? data[0] : t));
      setViewTrade(data[0]);
    }

    setEditUploading(false);
    setIsEditing(false);
    setEditImageFile(null);
  }

  const [hover, setHover]             = useState<{ x: number; y: number; idx: number } | null>(null);
  const svgRef                        = useRef<SVGSVGElement>(null);
  const [filters, setFilters]         = useState<Filters>({ session: '', strategy: '', quality: '', dateFrom: '', dateTo: '' });
  const [showFilters, setShowFilters] = useState(false);
  const [calMonth, setCalMonth]       = useState(new Date().getMonth());
  const [calYear, setCalYear]         = useState(new Date().getFullYear());

  /* ── Add Trade form state ── */
  const [pnl, setPnl]             = useState('');
  const [rr, setRR]               = useState('');
  const [session, setSession]     = useState('New York');
  const [strategy, setStrategy]   = useState('Heikin Ashi');
  const [operation, setOperation] = useState('Long');
  const [market, setMarket]       = useState('MNQ');
  const [quality, setQuality]     = useState('B');
  const [day, setDay]             = useState('1');
  const [month, setMonth]         = useState(String(new Date().getMonth() + 1));
  const [year, setYear]           = useState('2026');
  const [notes, setNotes]         = useState('');
  const [imageFile, setImageFile]       = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging]     = useState(false);
  const [uploading, setUploading]       = useState(false);
  const [isBreakEven, setIsBreakEven]   = useState(false);
  const [noStats, setNoStats]           = useState(false);

  useEffect(() => { fetchTrades(); }, []);

  async function fetchTrades() {
    const { data } = await supabase.from('trades').select('*').order('date', { ascending: true });
    setTrades(data || []);
  }

  function resetAddForm() {
    setPnl(''); setRR(''); setSession('New York'); setStrategy('Heikin Ashi');
    setOperation('Long'); setMarket('MNQ'); setQuality('B');
    setDay('1'); setMonth(String(new Date().getMonth() + 1)); setYear('2026');
    setNotes('');
    setImagePreview(null); setImageFile(null); setIsBreakEven(false); setNoStats(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) { setImageFile(file); setImagePreview(URL.createObjectURL(file)); }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) { setImageFile(file); setImagePreview(URL.createObjectURL(file)); }
  }

  async function uploadImage(file: File): Promise<string | null> {
    try {
      const ext = file.name.split('.').pop();
      const fileName = `trade_${Date.now()}.${ext}`;
      const { data, error } = await supabase.storage.from('trade-images').upload(fileName, file, { contentType: file.type });
      if (error) { console.warn('Image upload failed:', error.message); return null; }
      const { data: urlData } = supabase.storage.from('trade-images').getPublicUrl(data.path);
      return urlData?.publicUrl || null;
    } catch (err) { console.warn('Upload exception:', err); return null; }
  }

  async function addTrade() {
    setUploading(true);
    let finalImageUrl: string | null = null;
    if (imageFile) { finalImageUrl = await uploadImage(imageFile); }
    const date = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const finalPnl = isBreakEven ? 0 : Number(pnl);
    const { data, error } = await supabase.from('trades').insert([{
      pnl: finalPnl, rr: Number(rr), session, strategy, operation,
      market, date, image_url: finalImageUrl, quality, profile,
      notes: notes.trim() || null,
      no_stats: noStats,
    }]).select();
    if (error) { console.error('Insert trade error:', error.message); setUploading(false); return; }
    if (data?.[0]) setTrades(prev => [...prev, data[0]]);
    setUploading(false); setShowAdd(false);
    resetAddForm();
  }

  async function deleteTrade(id: string) {
    await supabase.from('trades').delete().eq('id', id);
    setTrades(prev => prev.filter(t => t.id !== id));
    setViewTrade(null);
  }

  /* ── Derived data ── */
  const profileConfig  = profiles.find(p => p.name === profile) || profiles[0];
  const initialBalance = profileConfig?.initialBalance || 0;
  const profileColor   = profileConfig?.color || '#22c55e';
  const profileTrades  = trades.filter(t => (t.profile || 'Rafael') === profile);

  // Resumen: filtered by date + strategy + session + symbol
  const resumeTrades = profileTrades.filter(t => {
    if (resumeStrategy && t.strategy !== resumeStrategy) return false;
    if (resumeSession  && t.session  !== resumeSession)  return false;
    if (resumeSymbol   && t.market   !== resumeSymbol)   return false;
    if (dateFilter !== 'ALL') {
      if (parseToDate(t.date) < getDateCutoff(dateFilter)) return false;
    }
    return true;
  });

  // Trades that count for stats (no_stats === false/null)
  const statTrades = resumeTrades.filter(t => !t.no_stats);

  // Trades tab: uses existing filter panel
  const filteredTrades = profileTrades.filter(t => {
    if (filters.session  && t.session  !== filters.session)  return false;
    if (filters.strategy && t.strategy !== filters.strategy) return false;
    if (filters.quality  && t.quality  !== filters.quality)  return false;
    if (filters.dateFrom && parseToDate(t.date) < parseToDate(filters.dateFrom)) return false;
    if (filters.dateTo   && parseToDate(t.date) > parseToDate(filters.dateTo))   return false;
    return true;
  });

  const sortedTrades = [...filteredTrades].sort(
    (a, b) => parseToDate(b.date).getTime() - parseToDate(a.date).getTime()
  );

  // Resumen metrics — only stat trades count for stats, but all resumeTrades count for PnL/equity
  const totalPnL   = resumeTrades.reduce((a, t) => a + t.pnl, 0);
  const wins       = statTrades.filter(t => t.pnl > 0);
  const losses     = statTrades.filter(t => t.pnl < 0);
  const breakEvens = statTrades.filter(t => t.pnl === 0);
  const winRate    = statTrades.length ? (wins.length / statTrades.length) * 100 : 0;
  const avgRR      = wins.length ? wins.reduce((a, t) => a + t.rr, 0) / wins.length : 0;
  const best       = resumeTrades.length ? Math.max(...resumeTrades.map(t => t.pnl)) : 0;
  const worst      = resumeTrades.length ? Math.min(...resumeTrades.map(t => t.pnl)) : 0;
  const avgWin     = wins.length   ? wins.reduce((a, t) => a + t.pnl, 0)   / wins.length   : 0;
  const avgLoss    = losses.length ? losses.reduce((a, t) => a + t.pnl, 0) / losses.length : 0;

  // Header equity: all trades (no_stats included for balance, stats excluded for rates)
  const totalPnLAll = profileTrades.reduce((a, t) => a + t.pnl, 0);

  const statsByStrategy = STRATEGIES.map(strat => {
    const st = statTrades.filter(t => t.strategy === strat);
    const sw = st.filter(t => t.pnl > 0);
    return {
      strategy: strat,
      totalPnl: st.reduce((a, t) => a + t.pnl, 0),
      winRate:  st.length ? sw.length / st.length * 100 : 0,
      avgRR:    sw.length ? sw.reduce((a, t) => a + t.rr, 0) / sw.length : 0,
      count:    st.length,
    };
  }).filter(s => s.count > 0);

  const statsByQuality = QUALITY_ORDER.map(q => {
    const qt = statTrades.filter(t => t.quality === q);
    const qw = qt.filter(t => t.pnl > 0);
    return {
      quality:  q,
      totalPnl: qt.reduce((a, t) => a + t.pnl, 0),
      winRate:  qt.length ? qw.length / qt.length * 100 : 0,
      count:    qt.length,
    };
  }).filter(q => q.count > 0);

  /* ── EQUITY CURVE (uses all resumeTrades including no_stats) ── */
  const W   = 700;
  const H   = 300;
  const PAD = { top: 20, right: 20, bottom: 44, left: 68 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top  - PAD.bottom;

  const equityData = [...resumeTrades].sort(
    (a, b) => parseToDate(a.date).getTime() - parseToDate(b.date).getTime()
  );
  let equity: number[] = [initialBalance];
  let runSum = initialBalance;
  equityData.forEach(t => { runSum += t.pnl; equity.push(runSum); });

  const eqMax   = Math.max(...equity);
  const eqMin   = Math.min(...equity);
  const eqPad   = (eqMax - eqMin) * 0.1 || eqMax * 0.05 || 500;
  const eqMaxP  = eqMax + eqPad;
  const eqMinP  = eqMin - eqPad;
  const eqRange = eqMaxP - eqMinP;

  const sx = (i: number) => PAD.left + (i / Math.max(equity.length - 1, 1)) * innerW;
  const sy = (v: number) => PAD.top  + ((eqMaxP - v) / eqRange) * innerH;

  function smoothPath(pts: { x: number; y: number }[]): string {
    if (pts.length < 2) return '';
    let d = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1]; const c = pts[i];
      d += ` C ${p.x + (c.x - p.x) / 3},${p.y} ${c.x - (c.x - p.x) / 3},${c.y} ${c.x},${c.y}`;
    }
    return d;
  }

  const equityPoints = equity.map((v, i) => ({ x: sx(i), y: sy(v) }));
  const pathD = smoothPath(equityPoints);
  const fillD = pathD
    ? `${pathD} L ${equityPoints[equityPoints.length - 1].x},${PAD.top + innerH} L ${PAD.left},${PAD.top + innerH} Z`
    : '';

  const yTicks      = 5;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => eqMinP + (eqRange / yTicks) * i);

  const xLabelCount = Math.min(6, Math.max(2, equityData.length));
  const xLabels = equityData.length === 0 ? [] : Array.from({ length: xLabelCount }, (_, i) => {
    const tradeIdx = equityData.length === 1 ? 0 : Math.round(i * (equityData.length - 1) / (xLabelCount - 1));
    const eqIdx    = tradeIdx + 1;
    return { x: sx(eqIdx), label: formatDateShort(equityData[tradeIdx]?.date || '') };
  });

  function handleSvgMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const relX    = (e.clientX - rect.left) * (W / rect.width) - PAD.left;
    const idx     = Math.round((relX / innerW) * (equity.length - 1));
    const clamped = Math.max(0, Math.min(equity.length - 1, idx));
    setHover({ x: equityPoints[clamped].x, y: equityPoints[clamped].y, idx: clamped });
  }

  /* ── CALENDAR ── */
  const firstDay    = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  const monthTrades  = profileTrades.filter(t => {
    const d = parseToDate(t.date);
    return d.getMonth() === calMonth && d.getFullYear() === calYear;
  });
  const monthPnL    = monthTrades.reduce((a, t) => a + t.pnl, 0);
  const monthWins   = monthTrades.filter(t => t.pnl > 0).length;
  const monthLosses = monthTrades.filter(t => t.pnl < 0).length;
  const monthBEs    = monthTrades.filter(t => t.pnl === 0).length;

  function tradesByDay(d: number): Trade[] {
    const key = `${calYear}-${String(calMonth + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    return profileTrades.filter(t => normalizeDate(t.date) === key);
  }

  const activeFiltersCount = Object.values(filters).filter(v => v !== '').length;

  /* ── Shared pill button style factory ── */
  function pillBtn(active: boolean, activeColor = '#818cf8') {
    return {
      padding: '6px 14px',
      borderRadius: 8,
      border: 'none',
      background: active ? '#1a1d2e' : 'transparent',
      color: active ? activeColor : '#6b7280',
      fontWeight: active ? 700 : 500,
      fontSize: 13,
      cursor: 'pointer',
      transition: 'all 0.15s',
    } as React.CSSProperties;
  }

  return (
    <div style={S.page}>
      <div style={S.container}>

        {/* ── HEADER ── */}
        <div style={S.header}>
          <div>
            <h1 style={S.headerTitle}>Trading Journal</h1>
            <p style={S.headerSub}>Track your edge. Own your process.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={S.profileSwitcher}>
              {profiles.map(p => (
                <button key={p.name} onClick={() => setProfile(p.name)} style={{
                  ...S.profileBtn,
                  background: profile === p.name ? p.color : 'transparent',
                  color:      profile === p.name ? '#000'  : p.color,
                  border:     `1.5px solid ${p.color}`,
                }}>
                  {p.name}
                </button>
              ))}
              <button onClick={() => setShowProfileManager(true)} style={{
                ...S.profileBtn, background: 'transparent', color: '#4b5563', border: '1.5px dashed #374151',
              }}>
                + Perfiles
              </button>
            </div>
            <div style={S.headerBalance}>
              <span style={S.balanceLabel}>Equity</span>
              <span style={{ ...S.balanceValue, color: totalPnLAll >= 0 ? profileColor : '#ef4444' }}>
                ${(initialBalance + totalPnLAll).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* ── NAV ── */}
        <div style={S.nav}>
          {(['resumen', 'trades', 'calendario'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ ...S.navBtn, ...(tab === t ? { ...S.navBtnActive, borderBottomColor: profileColor } : {}) }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* ══════════ RESUMEN ══════════ */}
        {tab === 'resumen' && (
          <div>

            {/* ── Filter bar ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>

              {/* Date filter pills */}
              <div style={{ display: 'flex', gap: 2, background: '#0b0f1a', borderRadius: 10, padding: 4, border: '1px solid #111827' }}>
                {DATE_FILTERS.map(f => (
                  <button key={f} onClick={() => setDateFilter(f)} style={pillBtn(dateFilter === f)}>
                    {f}
                  </button>
                ))}
              </div>

              {/* Dropdown filters */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                <DropdownFilter
                  label="Estrategias"
                  options={[...STRATEGIES, 'Otras']}
                  selected={resumeStrategy}
                  onSelect={setResumeStrategy}
                  profileColor={profileColor}
                />
                <DropdownFilter
                  label="Sesiones"
                  options={SESSIONS}
                  selected={resumeSession}
                  onSelect={setResumeSession}
                  profileColor={profileColor}
                />
                <DropdownFilter
                  label="Símbolo"
                  options={SYMBOLS}
                  selected={resumeSymbol}
                  onSelect={setResumeSymbol}
                  profileColor={profileColor}
                />
              </div>
            </div>

            {/* ── Chart view selector + chart ── */}
            <div style={{ background: '#0b0f1a', border: '1px solid #111827', borderRadius: 16, padding: '20px 24px', marginBottom: 20 }}>
              {/* Selector */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  Trading Statistics
                </h2>
                <div style={{ display: 'flex', gap: 2, background: '#111827', borderRadius: 8, padding: 3, border: '1px solid #1f2937' }}>
                  <button
                    onClick={() => setChartView('lineal')}
                    style={pillBtn(chartView === 'lineal', profileColor)}
                  >
                    Lineal
                  </button>
                  <button
                    onClick={() => setChartView('circular')}
                    style={pillBtn(chartView === 'circular', profileColor)}
                  >
                    Circular
                  </button>
                </div>
              </div>

              {/* Chart content */}
              {chartView === 'lineal' ? (
                <TradingStatistics
                  wins={wins.length}
                  losses={losses.length}
                  bes={breakEvens.length}
                  total={statTrades.length}
                  profileColor={profileColor}
                />
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 24 }}>
                  <div>
                    <p style={{ ...S.metricLabel, marginBottom: 16 }}>Total Trades — {profile}</p>
                    <PieChart
                      wins={wins.length}
                      losses={losses.length}
                      bes={breakEvens.length}
                      total={statTrades.length}
                      profileColor={profileColor}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 24 }}>
                    <div style={S.wlbeCard}>
                      <div style={{ ...S.wlbeLabel, color: profileColor }}>W</div>
                      <div style={{ ...S.wlbeNum, color: profileColor }}>{wins.length}</div>
                      <div style={S.wlbeSub}>Wins</div>
                    </div>
                    <div style={S.wlbeCard}>
                      <div style={{ ...S.wlbeLabel, color: '#ef4444' }}>L</div>
                      <div style={{ ...S.wlbeNum, color: '#ef4444' }}>{losses.length}</div>
                      <div style={S.wlbeSub}>Losses</div>
                    </div>
                    <div style={S.wlbeCard}>
                      <div style={{ ...S.wlbeLabel, color: '#6366f1' }}>BE</div>
                      <div style={{ ...S.wlbeNum, color: '#6366f1' }}>{breakEvens.length}</div>
                      <div style={S.wlbeSub}>Break Even</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Metrics grid */}
            <div style={S.metricsGrid}>
              <MetricCard label="Total P&L"   value={`$${totalPnL.toLocaleString()}`} color={totalPnL >= 0 ? profileColor : '#ef4444'} />
              <MetricCard label="Win Rate"    value={`${winRate.toFixed(1)}%`}         color={winRate >= 50 ? profileColor : '#ef4444'} />
              <MetricCard label="Avg RR"      value={avgRR.toFixed(2)}                 color={avgRR >= 1 ? profileColor : '#ef4444'} />
              <MetricCard label="Trades"      value={String(resumeTrades.length)}      color="white" />
              <MetricCard label="Best Trade"  value={`$${best.toLocaleString()}`}      color={profileColor} />
              <MetricCard label="Worst Trade" value={`$${worst.toLocaleString()}`}     color="#ef4444" />
              <MetricCard label="Avg Win"     value={`$${avgWin.toFixed(0)}`}          color={profileColor} />
              <MetricCard label="Avg Loss"    value={`$${avgLoss.toFixed(0)}`}         color="#ef4444" />
            </div>

            {/* Equity Curve */}
            <div style={S.section}>
              <div style={S.sectionHeader}>
                <h2 style={S.sectionTitle}>Equity Curve — {profile}</h2>
                {hover && <span style={S.hoverLabel}>${equity[hover.idx]?.toLocaleString()} · Trade {hover.idx}</span>}
              </div>
              <svg ref={svgRef} width="100%" viewBox={`0 0 ${W} ${H}`}
                style={{ display: 'block' }} onMouseMove={handleSvgMouseMove} onMouseLeave={() => setHover(null)}>
                <defs>
                  <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={profileColor} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={profileColor} stopOpacity="0" />
                  </linearGradient>
                </defs>
                {yTickValues.map((v, i) => (
                  <g key={i}>
                    <line x1={PAD.left} y1={sy(v)} x2={PAD.left + innerW} y2={sy(v)} stroke="#1f2937" strokeWidth="1" />
                    <text x={PAD.left - 8} y={sy(v) + 4} textAnchor="end" fill="#4b5563" fontSize="11">
                      {v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`}
                    </text>
                  </g>
                ))}
                <line x1={PAD.left} y1={PAD.top + innerH} x2={PAD.left + innerW} y2={PAD.top + innerH} stroke="#1f2937" strokeWidth="1" />
                {xLabels.map((lbl, i) => (
                  <g key={`xl-${i}`}>
                    <line x1={lbl.x} y1={PAD.top + innerH} x2={lbl.x} y2={PAD.top + innerH + 5} stroke="#374151" strokeWidth="1" />
                    <text x={lbl.x} y={PAD.top + innerH + 18} textAnchor="middle" fill="#4b5563" fontSize="10">{lbl.label}</text>
                  </g>
                ))}
                {fillD && <path d={fillD} fill="url(#eqGrad)" />}
                {pathD && <path d={pathD} fill="none" stroke={profileColor} strokeWidth="2.5" strokeLinecap="round" />}
                {hover && (
                  <>
                    <line x1={hover.x} y1={PAD.top} x2={hover.x} y2={PAD.top + innerH} stroke="#ffffff22" strokeWidth="1" strokeDasharray="4 3" />
                    <circle cx={hover.x} cy={hover.y} r="5" fill={profileColor} stroke="#0b0f1a" strokeWidth="2" />
                    <rect x={Math.min(hover.x + 10, W - 140)} y={hover.y - 30} width="130" height="24" rx="6" fill="#111827" stroke="#1f2937" />
                    <text x={Math.min(hover.x + 75, W - 75)} y={hover.y - 14} textAnchor="middle" fill="white" fontSize="12">
                      ${equity[hover.idx]?.toLocaleString()}
                    </text>
                  </>
                )}
              </svg>
            </div>

            {/* Performance por Estrategia */}
            {statsByStrategy.length > 0 && (
              <div style={S.section}>
                <h2 style={S.sectionTitle}>Performance por Estrategia</h2>
                <div style={S.tableWrap}>
                  <table style={S.table}>
                    <thead>
                      <tr>{['Estrategia','Trades','Total P&L','Win Rate','Avg RR'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {statsByStrategy.map(s => (
                        <tr key={s.strategy} style={S.tr}>
                          <td style={S.td}><span style={S.stratBadge}>{s.strategy}</span></td>
                          <td style={S.td}>{s.count}</td>
                          <td style={{ ...S.td, color: s.totalPnl >= 0 ? profileColor : '#ef4444' }}>${s.totalPnl.toLocaleString()}</td>
                          <td style={S.td}>{s.winRate.toFixed(1)}%</td>
                          <td style={S.td}>{s.avgRR.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Performance por Calidad */}
            {statsByQuality.length > 0 && (
              <div style={S.section}>
                <h2 style={S.sectionTitle}>Performance por Calidad</h2>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' as const }}>
                  {statsByQuality.map(q => (
                    <div key={q.quality} style={{ ...S.qualityCard, borderTop: `3px solid ${QUALITY_COLORS[q.quality] || '#6b7280'}` }}>
                      <span style={{ ...S.qualityBadge, background: QUALITY_COLORS[q.quality] || '#6b7280' }}>{q.quality}</span>
                      <p style={S.qualityPnl}><span style={{ color: q.totalPnl >= 0 ? profileColor : '#ef4444' }}>${q.totalPnl.toLocaleString()}</span></p>
                      <p style={S.qualitySub}>{q.count} trade{q.count !== 1 ? 's' : ''} · {q.winRate.toFixed(0)}% WR</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════ TRADES ══════════ */}
        {tab === 'trades' && (
          <>
            <div style={S.tradesToolbar}>
              <button style={{ ...S.btn, background: profileColor }} onClick={() => setShowAdd(true)}>+ Add Trade</button>
              <button
                style={{ ...S.btnSecondary, ...(activeFiltersCount > 0 ? { borderColor: profileColor, color: profileColor } : {}) }}
                onClick={() => setShowFilters(v => !v)}
              >
                Filters {activeFiltersCount > 0 ? `(${activeFiltersCount})` : ''}
              </button>
              {activeFiltersCount > 0 && (
                <button style={S.btnGhost} onClick={() => setFilters({ session: '', strategy: '', quality: '', dateFrom: '', dateTo: '' })}>Clear</button>
              )}
            </div>

            {showFilters && (
              <div style={S.filterPanel}>
                <div style={S.filterGrid}>
                  <div>
                    <label style={S.filterLabel}>Session</label>
                    <select style={S.select} value={filters.session} onChange={e => setFilters(f => ({ ...f, session: e.target.value }))}>
                      <option value="">All</option>
                      <option>New York</option><option>London</option><option>Asia</option>
                    </select>
                  </div>
                  <div>
                    <label style={S.filterLabel}>Strategy</label>
                    <select style={S.select} value={filters.strategy} onChange={e => setFilters(f => ({ ...f, strategy: e.target.value }))}>
                      <option value="">All</option>
                      {STRATEGIES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={S.filterLabel}>Quality</label>
                    <select style={S.select} value={filters.quality} onChange={e => setFilters(f => ({ ...f, quality: e.target.value }))}>
                      <option value="">All</option>
                      {QUALITY_ORDER.map(q => <option key={q}>{q}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={S.filterLabel}>Date From (d/m/yyyy)</label>
                    <input style={S.input} placeholder="1/1/2026" value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} />
                  </div>
                  <div>
                    <label style={S.filterLabel}>Date To (d/m/yyyy)</label>
                    <input style={S.input} placeholder="31/12/2026" value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} />
                  </div>
                </div>
              </div>
            )}

            <div style={S.tradesGrid}>
              {sortedTrades.map(t => (
                <TradeCard key={t.id} trade={t} profileColor={profileColor} onClick={() => setViewTrade(t)} />
              ))}
              {sortedTrades.length === 0 && <div style={S.empty}>No hay trades para este perfil o filtro.</div>}
            </div>
          </>
        )}

        {/* ══════════ CALENDARIO ══════════ */}
        {tab === 'calendario' && (
          <div>
            <div style={{ ...S.section, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, padding: '20px 28px', flexWrap: 'wrap', gap: 20 }}>
              <div>
                <p style={{ ...S.metricLabel, margin: '0 0 6px' }}>Total Month P&L</p>
                <h2 style={{ fontSize: 32, fontWeight: 800, margin: 0, color: monthPnL >= 0 ? profileColor : '#ef4444', letterSpacing: '-1px' }}>
                  {monthPnL >= 0 ? '+' : ''}${monthPnL.toLocaleString()}
                </h2>
                <p style={{ fontSize: 13, color: '#4b5563', margin: '6px 0 0' }}>
                  {MONTH_NAMES[calMonth]} {calYear} · {profile}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 24 }}>
                {[
                  { label: 'Trades', val: monthTrades.length, color: 'white' },
                  { label: 'Wins',   val: monthWins,          color: profileColor },
                  { label: 'Losses', val: monthLosses,        color: '#ef4444' },
                  { label: 'BE',     val: monthBEs,           color: '#6366f1' },
                ].map(item => (
                  <div key={item.label} style={{ textAlign: 'center' as const }}>
                    <p style={{ ...S.metricLabel, margin: '0 0 4px' }}>{item.label}</p>
                    <p style={{ fontSize: 22, fontWeight: 700, margin: 0, color: item.color }}>{item.val}</p>
                  </div>
                ))}
              </div>
            </div>

            <div style={S.section}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <button style={S.btnSecondary} onClick={() => {
                  if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
                  else setCalMonth(m => m - 1);
                }}>← Anterior</button>
                <h2 style={{ ...S.sectionTitle, margin: 0 }}>{MONTH_NAMES[calMonth]} {calYear} — {profile}</h2>
                <button style={S.btnSecondary} onClick={() => {
                  if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
                  else setCalMonth(m => m + 1);
                }}>Siguiente →</button>
              </div>

              <div style={S.calGrid}>
                {['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map(d => (
                  <div key={d} style={S.calDayHeader}>{d}</div>
                ))}
                {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const d         = i + 1;
                  const dayTrades = tradesByDay(d);
                  const dayPnl    = dayTrades.reduce((a, t) => a + t.pnl, 0);
                  const hasData   = dayTrades.length > 0;
                  const today     = new Date();
                  const isToday   = today.getDate() === d && today.getMonth() === calMonth && today.getFullYear() === calYear;

                  let cellBg      = '#0b0f1a';
                  let borderColor = isToday ? profileColor : '#1f2937';
                  if (hasData && dayPnl > 0)       { cellBg = 'rgba(34,197,94,0.13)';  borderColor = isToday ? profileColor : 'rgba(34,197,94,0.4)'; }
                  else if (hasData && dayPnl < 0)  { cellBg = 'rgba(239,68,68,0.13)';  borderColor = isToday ? profileColor : 'rgba(239,68,68,0.4)'; }
                  else if (hasData)                { cellBg = 'rgba(99,102,241,0.1)';   borderColor = 'rgba(99,102,241,0.4)'; }

                  return (
                    <div key={d} style={{ ...S.calCell, background: cellBg, border: `1.5px solid ${borderColor}` }}>
                      <span style={{ ...S.calDayNum, color: isToday ? profileColor : hasData ? '#e5e7eb' : '#374151' }}>{d}</span>
                      {hasData && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
                          <span style={{ fontSize: 15, fontWeight: 800, color: dayPnl > 0 ? '#22c55e' : dayPnl < 0 ? '#ef4444' : '#6366f1', lineHeight: 1, letterSpacing: '-0.3px' }}>
                            {dayPnl > 0 ? '+' : ''}${dayPnl.toLocaleString()}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 500, color: dayPnl > 0 ? 'rgba(34,197,94,0.65)' : dayPnl < 0 ? 'rgba(239,68,68,0.65)' : 'rgba(99,102,241,0.65)' }}>
                            {dayTrades.length} trade{dayTrades.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ══════════ VIEW TRADE MODAL ══════════ */}
        {viewTrade && (
          <div style={S.modalOverlay} onClick={() => { setViewTrade(null); cancelEdit(); }}>
            <div style={S.modalLarge} onClick={e => e.stopPropagation()}>

              {/* ── Header ── */}
              <div style={S.modalHeader}>
                <h3 style={{ ...S.modalTitle, margin: 0 }}>
                  {isEditing ? '✏️ Editar Trade' : 'Trade Detail'}
                </h3>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {!isEditing && viewTrade.no_stats && (
                    <span style={{ ...S.qualityBadge, background: '#78350f', color: '#fbbf24', fontSize: 12, padding: '4px 10px' }}>No Stats</span>
                  )}
                  {!isEditing && viewTrade.pnl === 0 && (
                    <span style={{ ...S.qualityBadge, background: '#6366f1', fontSize: 13, padding: '4px 12px' }}>BE</span>
                  )}
                  {!isEditing && (
                    <span style={{ ...S.qualityBadge, background: QUALITY_COLORS[viewTrade.quality || 'B'] || '#6b7280', fontSize: 14, padding: '4px 12px' }}>
                      {viewTrade.quality}
                    </span>
                  )}
                  {/* Edit / Cancel button */}
                  {!isEditing ? (
                    <button
                      onClick={() => openEdit(viewTrade)}
                      style={{
                        padding: '6px 16px', borderRadius: 8, border: `1.5px solid ${profileColor}`,
                        background: 'transparent', color: profileColor, fontWeight: 600,
                        fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      ✏️ Editar
                    </button>
                  ) : (
                    <button
                      onClick={cancelEdit}
                      style={{
                        padding: '6px 16px', borderRadius: 8, border: '1.5px solid #374151',
                        background: 'transparent', color: '#6b7280', fontWeight: 600,
                        fontSize: 13, cursor: 'pointer',
                      }}
                    >
                      × Cancelar
                    </button>
                  )}
                </div>
              </div>

              {/* ── VIEW mode ── */}
              {!isEditing && (
                <div style={S.split}>
                  <div style={S.left}>
                    <InfoRow label="Date"      value={formatDate(viewTrade.date)} />
                    <InfoRow label="Session"   value={viewTrade.session} />
                    <InfoRow label="Strategy"  value={viewTrade.strategy} />
                    <InfoRow label="Operation" value={viewTrade.operation} />
                    <InfoRow label="Market"    value={viewTrade.market} />
                    <InfoRow label="P&L"       value={viewTrade.pnl === 0 ? 'Break Even ($0)' : `$${viewTrade.pnl.toLocaleString()}`}
                      color={viewTrade.pnl > 0 ? profileColor : viewTrade.pnl < 0 ? '#ef4444' : '#6366f1'} />
                    <InfoRow label="R:R"       value={String(viewTrade.rr)} />

                    {viewTrade.notes && (
                      <div style={{ marginTop: 16, padding: '14px 16px', background: '#111827', borderRadius: 12, border: '1px solid #1f2937' }}>
                        <p style={{ fontSize: 11, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px' }}>Notas</p>
                        <p style={{ fontSize: 14, color: '#d1d5db', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{viewTrade.notes}</p>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                      <button style={S.btnDanger}    onClick={() => deleteTrade(viewTrade.id)}>Delete</button>
                      <button style={S.btnSecondary} onClick={() => { setViewTrade(null); cancelEdit(); }}>Close</button>
                    </div>
                  </div>
                  <div style={S.imagePanel}>
                    {viewTrade.image_url
                      ? <img src={viewTrade.image_url} style={S.image} alt="Trade chart" />
                      : <div style={S.placeholder}>No image attached</div>
                    }
                  </div>
                </div>
              )}

              {/* ── EDIT mode ── */}
              {isEditing && (
                <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' as const }}>

                  {/* Left: fields */}
                  <div style={{ flex: 1, minWidth: 260 }}>
                    <div style={S.form}>

                      {/* Date */}
                      <label style={S.filterLabel}>Fecha</label>
                      <div style={S.dateRow}>
                        <select style={S.select} value={editDay} onChange={e => setEditDay(e.target.value)}>
                          {Array.from({ length: 31 }).map((_, i) => <option key={i}>{i + 1}</option>)}
                        </select>
                        <select style={S.select} value={editMonth} onChange={e => setEditMonth(e.target.value)}>
                          {Array.from({ length: 12 }).map((_, i) => <option key={i}>{i + 1}</option>)}
                        </select>
                        <select style={S.select} value={editYear} onChange={e => setEditYear(e.target.value)}>
                          {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map(y => <option key={y}>{y}</option>)}
                        </select>
                      </div>

                      {/* P&L */}
                      <label style={S.filterLabel}>P&L ($)</label>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          style={{ ...S.input, opacity: editIsBreakEven ? 0.4 : 1, flex: 1 }}
                          placeholder="e.g. 250 o -150"
                          value={editIsBreakEven ? '0' : editPnl}
                          disabled={editIsBreakEven}
                          onChange={e => setEditPnl(e.target.value)}
                        />
                        <button
                          onClick={() => { const next = !editIsBreakEven; setEditIsBreakEven(next); if (next) setEditPnl('0'); }}
                          style={{
                            padding: '10px 14px', borderRadius: 10,
                            border: `1.5px solid ${editIsBreakEven ? '#6366f1' : '#1f2937'}`,
                            background: editIsBreakEven ? 'rgba(99,102,241,0.15)' : 'transparent',
                            color: editIsBreakEven ? '#818cf8' : '#6b7280',
                            cursor: 'pointer', fontWeight: 700, fontSize: 13,
                            whiteSpace: 'nowrap' as const, transition: 'all 0.15s',
                          }}
                        >BE</button>
                        <button
                          onClick={() => setEditNoStats(v => !v)}
                          style={{
                            padding: '10px 12px', borderRadius: 10,
                            border: `1.5px solid ${editNoStats ? '#f59e0b' : '#1f2937'}`,
                            background: editNoStats ? 'rgba(245,158,11,0.12)' : 'transparent',
                            color: editNoStats ? '#fbbf24' : '#6b7280',
                            cursor: 'pointer', fontWeight: 700, fontSize: 11,
                            whiteSpace: 'nowrap' as const, transition: 'all 0.15s',
                          }}
                        >No stats</button>
                      </div>
                      {editIsBreakEven && <p style={{ fontSize: 12, color: '#6366f1', margin: '2px 0 0' }}>Break Even — se guardará como $0</p>}
                      {editNoStats && <p style={{ fontSize: 12, color: '#f59e0b', margin: '2px 0 0' }}>⚠ Contará para balance, no para estadísticas</p>}

                      {/* R:R */}
                      <label style={S.filterLabel}>R:R</label>
                      <input style={S.input} placeholder="e.g. 2.5" value={editRr} onChange={e => setEditRr(e.target.value)} />

                      {/* Quality */}
                      <label style={S.filterLabel}>Quality</label>
                      <select style={S.select} value={editQuality} onChange={e => setEditQuality(e.target.value)}>
                        {QUALITY_ORDER.map(q => <option key={q}>{q}</option>)}
                      </select>

                      {/* Session */}
                      <label style={S.filterLabel}>Session</label>
                      <select style={S.select} value={editSession} onChange={e => setEditSession(e.target.value)}>
                        <option>New York</option><option>London</option><option>Asia</option>
                      </select>

                      {/* Strategy */}
                      <label style={S.filterLabel}>Strategy</label>
                      <select style={S.select} value={editStrategy} onChange={e => setEditStrategy(e.target.value)}>
                        {STRATEGIES.map(s => <option key={s}>{s}</option>)}
                      </select>

                      {/* Operation */}
                      <label style={S.filterLabel}>Operation</label>
                      <select style={S.select} value={editOperation} onChange={e => setEditOperation(e.target.value)}>
                        <option>Long</option><option>Short</option>
                      </select>

                      {/* Market */}
                      <label style={S.filterLabel}>Market</label>
                      <select style={S.select} value={editMarket} onChange={e => setEditMarket(e.target.value)}>
                        <option>MNQ</option><option>MCL</option><option>MGC</option>
                      </select>

                      {/* Notes */}
                      <label style={S.filterLabel}>Notas</label>
                      <textarea
                        style={{ ...S.input, resize: 'vertical' as const, minHeight: 80, lineHeight: 1.5, fontFamily: 'inherit' }}
                        placeholder="¿Cómo te sentiste? ¿Qué salió bien o mal?"
                        value={editNotes}
                        onChange={e => setEditNotes(e.target.value)}
                      />

                      {/* Save / Delete */}
                      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                        <button
                          style={{ ...S.btn, background: profileColor, opacity: editUploading ? 0.6 : 1 }}
                          onClick={saveTrade}
                          disabled={editUploading}
                        >
                          {editUploading ? 'Guardando...' : '💾 Guardar cambios'}
                        </button>
                        <button style={S.btnDanger} onClick={() => deleteTrade(viewTrade.id)}>Delete</button>
                      </div>

                    </div>
                  </div>

                  {/* Right: image editor */}
                  <div style={{ flex: 1.2, minWidth: 260, display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                    <label style={S.filterLabel}>Imagen del Chart</label>

                    {/* Current / preview image */}
                    {editImagePreview && !editRemoveImage ? (
                      <div style={{ position: 'relative' as const, borderRadius: 12, overflow: 'hidden', background: '#111827', border: '1px solid #1f2937' }}>
                        <img src={editImagePreview} style={{ width: '100%', maxHeight: 280, objectFit: 'contain', display: 'block' }} alt="Preview" />
                        <button
                          onClick={() => { setEditRemoveImage(true); setEditImagePreview(null); setEditImageFile(null); }}
                          style={{
                            position: 'absolute' as const, top: 10, right: 10,
                            background: 'rgba(239,68,68,0.85)', border: 'none', borderRadius: 8,
                            color: 'white', padding: '6px 12px', fontSize: 12, fontWeight: 700,
                            cursor: 'pointer', backdropFilter: 'blur(4px)',
                          }}
                        >
                          🗑 Eliminar imagen
                        </button>
                      </div>
                    ) : (
                      <div
                        style={{
                          ...S.dropZone,
                          borderColor: editIsDragging ? profileColor : editRemoveImage ? '#ef4444' : '#1f2937',
                          background: editIsDragging ? `rgba(34,197,94,0.05)` : '#111827',
                          minHeight: 160,
                        }}
                        onDragOver={e => { e.preventDefault(); setEditIsDragging(true); }}
                        onDragLeave={() => setEditIsDragging(false)}
                        onDrop={handleEditDrop}
                        onClick={() => document.getElementById('editFileInput')?.click()}
                      >
                        <span style={{ fontSize: 28, marginBottom: 6 }}>🖼</span>
                        <span style={{ fontSize: 13, color: '#6b7280' }}>
                          {editRemoveImage ? 'Imagen eliminada — arrastra o click para agregar nueva' : 'Arrastra una imagen aquí'}
                        </span>
                        <span style={{ fontSize: 12, color: '#374151' }}>o haz click para elegir archivo</span>
                      </div>
                    )}
                    <input id="editFileInput" type="file" accept="image/*" style={{ display: 'none' }} onChange={handleEditFileChange} />

                    {editRemoveImage && (
                      <button
                        style={{ ...S.btnSecondary, fontSize: 12, padding: '8px 14px' }}
                        onClick={() => { setEditRemoveImage(false); setEditImagePreview(viewTrade.image_url || null); }}
                      >
                        ↩ Restaurar imagen original
                      </button>
                    )}
                  </div>

                </div>
              )}

            </div>
          </div>
        )}

        {/* ══════════ ADD TRADE MODAL ══════════ */}
        {showAdd && (
          <div style={S.modalOverlay} onClick={() => { setShowAdd(false); resetAddForm(); }}>
            <div style={S.modal} onClick={e => e.stopPropagation()}>
              <h3 style={S.modalTitle}>Add Trade — {profile}</h3>
              <div style={S.form}>

                <label style={S.filterLabel}>Date</label>
                <div style={S.dateRow}>
                  <select style={S.select} value={day} onChange={e => setDay(e.target.value)}>
                    {Array.from({ length: 31 }).map((_, i) => <option key={i}>{i + 1}</option>)}
                  </select>
                  <select style={S.select} value={month} onChange={e => setMonth(e.target.value)}>
                    {Array.from({ length: 12 }).map((_, i) => <option key={i}>{i + 1}</option>)}
                  </select>
                  <select style={S.select} value={year} onChange={e => setYear(e.target.value)}>
                    {[2026, 2027, 2028, 2029, 2030].map(y => <option key={y}>{y}</option>)}
                  </select>
                </div>

                {/* P&L + BE + No Stats */}
                <label style={S.filterLabel}>P&L ($)</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    style={{ ...S.input, opacity: isBreakEven ? 0.4 : 1, flex: 1 }}
                    placeholder="e.g. 250 o -150"
                    value={isBreakEven ? '0' : pnl}
                    disabled={isBreakEven}
                    onChange={e => setPnl(e.target.value)}
                  />
                  {/* BE toggle */}
                  <button
                    onClick={() => { const next = !isBreakEven; setIsBreakEven(next); if (next) setPnl('0'); }}
                    style={{
                      padding: '10px 14px', borderRadius: 10,
                      border: `1.5px solid ${isBreakEven ? '#6366f1' : '#1f2937'}`,
                      background: isBreakEven ? 'rgba(99,102,241,0.15)' : 'transparent',
                      color: isBreakEven ? '#818cf8' : '#6b7280',
                      cursor: 'pointer', fontWeight: 700, fontSize: 13,
                      whiteSpace: 'nowrap' as const, transition: 'all 0.15s',
                    }}
                  >
                    BE
                  </button>
                  {/* No Stats toggle */}
                  <button
                    onClick={() => setNoStats(v => !v)}
                    style={{
                      padding: '10px 12px', borderRadius: 10,
                      border: `1.5px solid ${noStats ? '#f59e0b' : '#1f2937'}`,
                      background: noStats ? 'rgba(245,158,11,0.12)' : 'transparent',
                      color: noStats ? '#fbbf24' : '#6b7280',
                      cursor: 'pointer', fontWeight: 700, fontSize: 11,
                      whiteSpace: 'nowrap' as const, transition: 'all 0.15s',
                    }}
                    title="Este trade contará para el balance pero no para estadísticas"
                  >
                    No stats
                  </button>
                </div>

                {isBreakEven && (
                  <p style={{ fontSize: 12, color: '#6366f1', margin: '2px 0 0' }}>Break Even — se guardará como $0</p>
                )}
                {noStats && (
                  <p style={{ fontSize: 12, color: '#f59e0b', margin: '2px 0 0' }}>
                    ⚠ Este trade contará para el balance pero NO para WR, RR ni estadísticas
                  </p>
                )}

                <label style={S.filterLabel}>R:R</label>
                <input style={S.input} placeholder="e.g. 2.5" value={rr} onChange={e => setRR(e.target.value)} />

                <label style={S.filterLabel}>Quality</label>
                <select style={S.select} value={quality} onChange={e => setQuality(e.target.value)}>
                  {QUALITY_ORDER.map(q => <option key={q}>{q}</option>)}
                </select>

                <label style={S.filterLabel}>Session</label>
                <select style={S.select} value={session} onChange={e => setSession(e.target.value)}>
                  <option>New York</option><option>London</option><option>Asia</option>
                </select>

                <label style={S.filterLabel}>Strategy</label>
                <select style={S.select} value={strategy} onChange={e => setStrategy(e.target.value)}>
                  {STRATEGIES.map(s => <option key={s}>{s}</option>)}
                </select>

                <label style={S.filterLabel}>Operation</label>
                <select style={S.select} value={operation} onChange={e => setOperation(e.target.value)}>
                  <option>Long</option><option>Short</option>
                </select>

                <label style={S.filterLabel}>Market</label>
                <select style={S.select} value={market} onChange={e => setMarket(e.target.value)}>
                  <option>MNQ</option><option>MCL</option><option>MGC</option>
                </select>

                {/* Notes field */}
                <label style={S.filterLabel}>Notas</label>
                <textarea
                  style={{
                    ...S.input,
                    resize: 'vertical' as const,
                    minHeight: 80,
                    lineHeight: 1.5,
                    fontFamily: 'inherit',
                  }}
                  placeholder="¿Cómo te sentiste? ¿Qué salió bien o mal? Cualquier observación..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />

                <label style={S.filterLabel}>Chart Image</label>
                <div
                  style={{ ...S.dropZone, borderColor: isDragging ? profileColor : '#1f2937', background: isDragging ? 'rgba(34,197,94,0.05)' : '#111827' }}
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById('fileInput')?.click()}
                >
                  {imagePreview
                    ? <img src={imagePreview} style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 8, objectFit: 'contain' }} alt="Preview" />
                    : <>
                        <span style={{ fontSize: 28, marginBottom: 6 }}>🖼</span>
                        <span style={{ fontSize: 13, color: '#6b7280' }}>Arrastra una imagen aquí</span>
                        <span style={{ fontSize: 12, color: '#374151' }}>o haz click para elegir archivo</span>
                      </>
                  }
                </div>
                <input id="fileInput" type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
                {imagePreview && (
                  <button style={{ ...S.btnGhost, fontSize: 12, marginTop: 2 }} onClick={() => { setImagePreview(null); setImageFile(null); }}>
                    × Quitar imagen
                  </button>
                )}

                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                  <button
                    style={{ ...S.btn, background: profileColor, opacity: uploading ? 0.6 : 1 }}
                    onClick={addTrade}
                    disabled={uploading}
                  >
                    {uploading ? 'Guardando...' : 'Guardar Trade'}
                  </button>
                  <button style={S.btnSecondary} onClick={() => { setShowAdd(false); resetAddForm(); }}>Cancelar</button>
                </div>

              </div>
            </div>
          </div>
        )}

        {/* ══════════ PROFILE MANAGER ══════════ */}
        {showProfileManager && (
          <div style={S.modalOverlay} onClick={() => setShowProfileManager(false)}>
            <div style={{ ...S.modal, width: 480 }} onClick={e => e.stopPropagation()}>
              <h3 style={S.modalTitle}>Gestionar Perfiles</h3>
              <div style={{ marginBottom: 24 }}>
                {profiles.map(p => (
                  <div key={p.name} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 14px', borderRadius: 10, marginBottom: 8,
                    background: '#111827', border: `1px solid ${p.name === profile ? p.color : '#1f2937'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 12, height: 12, borderRadius: '50%', background: p.color }} />
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</span>
                      <span style={{ fontSize: 12, color: '#4b5563' }}>${p.initialBalance.toLocaleString()}</span>
                    </div>
                    {profiles.length > 1 && (
                      <button style={{ ...S.btnDanger, padding: '4px 12px', fontSize: 12 }} onClick={() => deleteProfile(p.name)}>Borrar</button>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ borderTop: '1px solid #1f2937', paddingTop: 20 }}>
                <p style={{ ...S.filterLabel, fontSize: 12, marginBottom: 14 }}>NUEVO PERFIL</p>
                <div style={S.form}>
                  <label style={S.filterLabel}>Nombre</label>
                  <input style={S.input} placeholder="Ej: Hermano" value={newProfileName} onChange={e => setNewProfileName(e.target.value)} />
                  <label style={S.filterLabel}>Balance inicial ($)</label>
                  <input style={S.input} placeholder="Ej: 10000" value={newProfileBalance} onChange={e => setNewProfileBalance(e.target.value)} />
                  <label style={S.filterLabel}>Color</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                    {PROFILE_COLORS.map(c => (
                      <div key={c} onClick={() => setNewProfileColor(c)} style={{
                        width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer',
                        border: newProfileColor === c ? '3px solid white' : '3px solid transparent',
                        transition: 'border 0.15s',
                      }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                    <button style={{ ...S.btn, background: newProfileColor }}
                      onClick={addProfile} disabled={!newProfileName.trim() || !newProfileBalance}>
                      Crear Perfil
                    </button>
                    <button style={S.btnSecondary} onClick={() => setShowProfileManager(false)}>Cerrar</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

/* ── TRADE CARD ── */
function TradeCard({ trade, profileColor, onClick }: { trade: Trade; profileColor: string; onClick: () => void; }) {
  const [hovered, setHovered] = useState(false);
  const isBE = trade.pnl === 0;
  return (
    <div
      style={{
        ...S.tradeCard,
        transform: hovered ? 'translateY(-3px)' : 'none',
        boxShadow: hovered ? '0 12px 40px rgba(0,0,0,0.55)' : '0 2px 8px rgba(0,0,0,0.2)',
        transition: 'transform 0.18s ease, box-shadow 0.18s ease',
        overflow: 'hidden',
      }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {trade.image_url && (
        <div style={{ width: '100%', height: 200, overflow: 'hidden', borderRadius: '12px 12px 0 0', background: '#0b0f1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={trade.image_url} alt="chart" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
      )}
      <div style={{ padding: '12px 14px' }}>
        <div style={S.tradeCardTop}>
          <span style={S.tradeDate}>{formatDate(trade.date)}</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {trade.no_stats && <span style={{ ...S.qualityBadge, background: '#78350f', color: '#fbbf24', fontSize: 10 }}>No stats</span>}
            {isBE && <span style={{ ...S.qualityBadge, background: '#6366f1', fontSize: 11 }}>BE</span>}
            <span style={{ ...S.qualityBadge, background: QUALITY_COLORS[trade.quality || 'B'] || '#6b7280' }}>{trade.quality}</span>
          </div>
        </div>
        <div style={{ ...S.tradePnl, color: trade.pnl > 0 ? profileColor : trade.pnl < 0 ? '#ef4444' : '#6366f1' }}>
          {isBE ? 'Break Even' : `${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toLocaleString()}`}
        </div>
        <div style={S.tradeMeta}>
          <span>{trade.session}</span><span>·</span><span>{trade.strategy}</span><span>·</span><span>{trade.market}</span>
        </div>
        {trade.notes && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
            📝 {trade.notes}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={S.metricCard}>
      <p style={S.metricLabel}>{label}</p>
      <h2 style={{ ...S.metricValue, color }}>{value}</h2>
    </div>
  );
}

function InfoRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={S.infoRow}>
      <span style={S.infoLabel}>{label}</span>
      <span style={{ ...S.infoValue, ...(color ? { color } : {}) }}>{value}</span>
    </div>
  );
}

const S: any = {
  page:      { background: '#050810', color: 'white', minHeight: '100vh', padding: '32px 24px', fontFamily: "'DM Sans', system-ui, sans-serif" },
  container: { maxWidth: 1200, margin: '0 auto' },
  header:        { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 },
  headerTitle:   { fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: '-0.5px' },
  headerSub:     { fontSize: 13, color: '#4b5563', margin: '4px 0 0' },
  headerBalance: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 },
  balanceLabel:  { fontSize: 12, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.08em' },
  balanceValue:  { fontSize: 24, fontWeight: 700 },
  profileSwitcher: { display: 'flex', gap: 8, flexWrap: 'wrap' as const },
  profileBtn:      { padding: '7px 18px', borderRadius: 20, cursor: 'pointer', fontWeight: 600, fontSize: 14, transition: 'all 0.15s' },
  nav:          { display: 'flex', gap: 8, marginBottom: 28, borderBottom: '1px solid #111827' },
  navBtn:       { background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: 14, fontWeight: 500, padding: '10px 16px', borderBottom: '2px solid transparent', transition: 'all 0.15s' },
  navBtnActive: { color: 'white', borderBottom: '2px solid #22c55e' },
  metricsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 28 },
  metricCard:  { background: '#0b0f1a', padding: '18px 20px', borderRadius: 14, border: '1px solid #111827' },
  metricLabel: { fontSize: 12, color: '#4b5563', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.07em' },
  metricValue: { fontSize: 24, fontWeight: 700, margin: 0 },
  wlbeCard:  { background: '#111827', borderRadius: 14, padding: '16px 20px', minWidth: 90, textAlign: 'center' as const, border: '1px solid #1f2937' },
  wlbeLabel: { fontSize: 22, fontWeight: 900, letterSpacing: '-0.5px' },
  wlbeNum:   { fontSize: 32, fontWeight: 800, lineHeight: 1, margin: '4px 0' },
  wlbeSub:   { fontSize: 11, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.07em' },
  section:       { background: '#0b0f1a', borderRadius: 16, padding: 24, marginBottom: 24, border: '1px solid #111827' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle:  { fontSize: 16, fontWeight: 600, margin: 0 },
  hoverLabel:    { fontSize: 13, color: '#9ca3af' },
  tableWrap:  { overflowX: 'auto' as const },
  table:      { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 },
  th:         { textAlign: 'left' as const, padding: '10px 14px', color: '#4b5563', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid #111827' },
  tr:         { borderBottom: '1px solid #0f1520' },
  td:         { padding: '12px 14px', color: '#d1d5db' },
  stratBadge: { background: '#1f2937', padding: '3px 10px', borderRadius: 6, fontSize: 12, color: '#9ca3af' },
  qualityCard:  { background: '#111827', borderRadius: 14, padding: '16px 20px', minWidth: 120, border: '1px solid #1f2937' },
  qualityBadge: { display: 'inline-block', padding: '2px 9px', borderRadius: 6, fontSize: 12, fontWeight: 700, color: 'white' },
  qualityPnl:   { fontSize: 18, fontWeight: 700, margin: '8px 0 4px' },
  qualitySub:   { fontSize: 12, color: '#4b5563', margin: 0 },
  tradesToolbar: { display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' },
  filterPanel:   { background: '#0b0f1a', border: '1px solid #1f2937', borderRadius: 14, padding: 20, marginBottom: 20 },
  filterGrid:    { display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 14 },
  filterLabel:   { display: 'block', fontSize: 11, color: '#4b5563', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' },
  tradesGrid:   { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 },
  tradeCard:    { background: '#0b0f1a', borderRadius: 14, cursor: 'pointer', border: '1px solid #111827' },
  tradeCardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  tradeDate:    { fontSize: 13, color: '#6b7280' },
  tradePnl:     { fontSize: 22, fontWeight: 700, marginBottom: 6 },
  tradeMeta:    { display: 'flex', gap: 6, fontSize: 12, color: '#4b5563' },
  empty:        { color: '#4b5563', gridColumn: '1 / -1', padding: 40, textAlign: 'center' as const },
  calGrid:      { display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 },
  calDayHeader: { textAlign: 'center' as const, fontSize: 11, color: '#4b5563', padding: '6px 0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' },
  calCell:      { borderRadius: 10, padding: '10px 10px 8px', minHeight: 90, display: 'flex', flexDirection: 'column' as const, justifyContent: 'space-between' },
  calDayNum:    { fontSize: 12, fontWeight: 700, lineHeight: 1 },
  modalOverlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' },
  modal:        { background: '#0b0f1a', border: '1px solid #1f2937', padding: 28, borderRadius: 20, width: 520, maxHeight: '90vh', overflowY: 'auto' as const },
  modalLarge:   { background: '#0b0f1a', border: '1px solid #1f2937', padding: 28, borderRadius: 20, width: 960, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' as const },
  modalHeader:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle:   { fontSize: 18, fontWeight: 700, margin: '0 0 16px' },
  split:       { display: 'flex', gap: 24 },
  left:        { flex: 1 },
  infoRow:     { display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #111827' },
  infoLabel:   { fontSize: 13, color: '#6b7280' },
  infoValue:   { fontSize: 14, fontWeight: 500 },
  imagePanel:  { flex: 1.4, background: '#111827', borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 },
  image:       { width: '100%', borderRadius: 10, objectFit: 'contain' as const },
  placeholder: { color: '#374151', fontSize: 14 },
  dropZone: { border: '2px dashed #1f2937', borderRadius: 12, padding: '24px 16px', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 6, cursor: 'pointer', transition: 'all 0.2s', minHeight: 100, justifyContent: 'center' },
  form:    { display: 'flex', flexDirection: 'column' as const, gap: 6 },
  dateRow: { display: 'flex', gap: 10 },
  input:   { background: '#111827', color: 'white', padding: '10px 14px', borderRadius: 10, border: '1px solid #1f2937', fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' as const },
  select:  { background: '#111827', color: 'white', padding: '10px 14px', borderRadius: 10, border: '1px solid #1f2937', fontSize: 14, width: '100%', boxSizing: 'border-box' as const },
  btn:          { padding: '10px 20px', background: '#22c55e', borderRadius: 10, cursor: 'pointer', color: 'black', border: 'none', fontWeight: 600, fontSize: 14 },
  btnSecondary: { padding: '10px 20px', background: '#111827', border: '1px solid #1f2937', borderRadius: 10, cursor: 'pointer', color: 'white', fontWeight: 500, fontSize: 14 },
  btnGhost:     { padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 14 },
  btnDanger:    { padding: '10px 20px', background: '#1f0a0a', border: '1px solid #7f1d1d', borderRadius: 10, cursor: 'pointer', color: '#ef4444', fontWeight: 500, fontSize: 14 },
};
