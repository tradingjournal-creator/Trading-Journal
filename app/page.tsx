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
};

type Filters = {
  session: string;
  strategy: string;
  quality: string;
  dateFrom: string;
  dateTo: string;
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

const PROFILES = [
  { name: 'Rafael', initialBalance: 50000, color: '#22c55e' },
  { name: 'Papá',   initialBalance: 25000, color: '#60a5fa' },
];

function formatDate(raw: string): string {
  if (!raw) return '';
  const clean = raw.split('T')[0]; // ← fix: elimina timestamp si existe
  if (clean.includes('-')) {
    const [y, m, d] = clean.split('-');
    return `${parseInt(d)}/${parseInt(m)}/${y}`;
  }
  return raw;
}

function parseToDate(raw: string): Date {
  if (!raw) return new Date(0);
  const clean = raw.split('T')[0]; // ← fix
  if (clean.includes('-')) return new Date(clean);
  const [d, m, y] = clean.split('/').map(Number);
  return new Date(y, m - 1, d);
}

export default function Home() {
  const [trades, setTrades]       = useState<Trade[]>([]);
  const [tab, setTab]             = useState<'resumen' | 'trades' | 'calendario'>('resumen');
  const [profile, setProfile]     = useState<string>('Rafael');

  const [showAdd, setShowAdd]     = useState(false);
  const [viewTrade, setViewTrade] = useState<Trade | null>(null);

  const [hover, setHover]         = useState<{ x: number; y: number; idx: number } | null>(null);
  const svgRef                    = useRef<SVGSVGElement>(null);

  const [filters, setFilters]     = useState<Filters>({ session: '', strategy: '', quality: '', dateFrom: '', dateTo: '' });
  const [showFilters, setShowFilters] = useState(false);

  const [calMonth, setCalMonth]   = useState(new Date().getMonth());
  const [calYear, setCalYear]     = useState(new Date().getFullYear());

  const [pnl, setPnl]           = useState('');
  const [rr, setRR]             = useState('');
  const [session, setSession]   = useState('New York');
  const [strategy, setStrategy] = useState('Heikin Ashi');
  const [operation, setOperation] = useState('Long');
  const [market, setMarket]     = useState('MNQ');
  const [quality, setQuality]   = useState('B');
  const [day, setDay]           = useState('1');
  const [month, setMonth]       = useState(String(new Date().getMonth() + 1));
  const [year, setYear]         = useState('2026');
  const [imageFile, setImageFile]       = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging]     = useState(false);
  const [uploading, setUploading]       = useState(false);

  useEffect(() => { fetchTrades(); }, []);

  async function fetchTrades() {
    const { data } = await supabase.from('trades').select('*').order('date', { ascending: true });
    setTrades(data || []);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) { setImageFile(file); setImagePreview(URL.createObjectURL(file)); }
  }

  async function uploadImage(file: File): Promise<string | null> {
    try {
      const ext = file.name.split('.').pop();
      const fileName = `trade_${Date.now()}.${ext}`;
      const { data, error } = await supabase.storage
        .from('trade-images')
        .upload(fileName, file, { contentType: file.type });
      if (error) { console.warn('Image upload failed:', error.message); return null; }
      const { data: urlData } = supabase.storage
        .from('trade-images')
        .getPublicUrl(data.path);
      return urlData?.publicUrl || null;
    } catch (err) { console.warn('Upload exception:', err); return null; }
  }

  async function addTrade() {
    setUploading(true);
    let finalImageUrl: string | null = null;
    if (imageFile) { finalImageUrl = await uploadImage(imageFile); }

    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const { data, error } = await supabase.from('trades').insert([{
      pnl: Number(pnl), rr: Number(rr), session, strategy, operation,
      market, date, image_url: finalImageUrl, quality, profile,
    }]).select();

    if (error) {
      console.error('Insert trade error:', error.message, error.details, error.hint);
      setUploading(false);
      return;
    }
    if (data?.[0]) setTrades(prev => [...prev, data[0]]);

    setUploading(false);
    setShowAdd(false);
    setPnl(''); setRR('');
    setSession('New York'); setStrategy('Heikin Ashi');
    setOperation('Long'); setMarket('MNQ'); setQuality('B');
    setDay('1'); setMonth(String(new Date().getMonth() + 1)); setYear('2026');
    setImagePreview(null); setImageFile(null);
  }

  async function deleteTrade(id: string) {
    await supabase.from('trades').delete().eq('id', id);
    setTrades(prev => prev.filter(t => t.id !== id));
    setViewTrade(null);
  }

  const profileConfig  = PROFILES.find(p => p.name === profile) || PROFILES[0];
  const initialBalance = profileConfig.initialBalance;
  const profileColor   = profileConfig.color;

  const profileTrades = trades.filter(t => (t.profile || 'Rafael') === profile);

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

  const totalPnL = filteredTrades.reduce((a, t) => a + t.pnl, 0);
  const wins     = filteredTrades.filter(t => t.pnl > 0);
  const losses   = filteredTrades.filter(t => t.pnl < 0);
  const winRate  = filteredTrades.length ? (wins.length / filteredTrades.length) * 100 : 0;
  const avgRR    = wins.length ? wins.reduce((a, t) => a + t.rr, 0) / wins.length : 0;
  const best     = filteredTrades.length ? Math.max(...filteredTrades.map(t => t.pnl)) : 0;
  const worst    = filteredTrades.length ? Math.min(...filteredTrades.map(t => t.pnl)) : 0;
  const avgWin   = wins.length   ? wins.reduce((a, t) => a + t.pnl, 0)   / wins.length   : 0;
  const avgLoss  = losses.length ? losses.reduce((a, t) => a + t.pnl, 0) / losses.length : 0;

  const strategies = [...new Set(profileTrades.map(t => t.strategy))];
  const statsByStrategy = strategies.map(strat => {
    const st = filteredTrades.filter(t => t.strategy === strat);
    const sw = st.filter(t => t.pnl > 0);
    return {
      strategy: strat,
      totalPnl: st.reduce((a, t) => a + t.pnl, 0),
      winRate:  st.length ? sw.length / st.length * 100 : 0,
      avgRR:    sw.length ? sw.reduce((a, t) => a + t.rr, 0) / sw.length : 0,
      count:    st.length,
    };
  });

  const statsByQuality = QUALITY_ORDER.map(q => {
    const qt = filteredTrades.filter(t => t.quality === q);
    const qw = qt.filter(t => t.pnl > 0);
    return {
      quality:  q,
      totalPnl: qt.reduce((a, t) => a + t.pnl, 0),
      winRate:  qt.length ? qw.length / qt.length * 100 : 0,
      count:    qt.length,
    };
  }).filter(q => q.count > 0);

  /* EQUITY CURVE */
  const W = 700; const H = 280;
  const PAD = { top: 20, right: 20, bottom: 30, left: 68 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top  - PAD.bottom;

  const equityData = [...filteredTrades].sort(
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

  function handleSvgMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const relX    = (e.clientX - rect.left) * (W / rect.width) - PAD.left;
    const idx     = Math.round((relX / innerW) * (equity.length - 1));
    const clamped = Math.max(0, Math.min(equity.length - 1, idx));
    setHover({ x: equityPoints[clamped].x, y: equityPoints[clamped].y, idx: clamped });
  }

  /* CALENDAR — fix principal */
  // Normaliza cualquier fecha de Supabase a YYYY-MM-DD
  function normalizeDate(raw: string): string {
    if (!raw) return '';
    return raw.split('T')[0]; // elimina timestamp si existe
  }

  const MONTH_NAMES = [
    'Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
  ];
  const firstDay    = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  function tradesByDay(d: number): Trade[] {
    const key = `${calYear}-${String(calMonth + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    return profileTrades.filter(t => normalizeDate(t.date) === key); // ← fix aquí
  }

  const activeFiltersCount = Object.values(filters).filter(v => v !== '').length;

  return (
    <div style={S.page}>
      <div style={S.container}>

        {/* HEADER */}
        <div style={S.header}>
          <div>
            <h1 style={S.headerTitle}>Trading Journal</h1>
            <p style={S.headerSub}>Track your edge. Own your process.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={S.profileSwitcher}>
              {PROFILES.map(p => (
                <button key={p.name} onClick={() => setProfile(p.name)} style={{
                  ...S.profileBtn,
                  background: profile === p.name ? p.color : 'transparent',
                  color:      profile === p.name ? '#000'  : p.color,
                  border:     `1.5px solid ${p.color}`,
                }}>
                  {p.name}
                </button>
              ))}
            </div>
            <div style={S.headerBalance}>
              <span style={S.balanceLabel}>Equity</span>
              <span style={{ ...S.balanceValue, color: totalPnL >= 0 ? profileColor : '#ef4444' }}>
                ${(initialBalance + totalPnL).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* NAV */}
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
            <div style={S.metricsGrid}>
              <MetricCard label="Total P&L"   value={`$${totalPnL.toLocaleString()}`} color={totalPnL >= 0 ? profileColor : '#ef4444'} />
              <MetricCard label="Win Rate"    value={`${winRate.toFixed(1)}%`}         color={winRate >= 50 ? profileColor : '#ef4444'} />
              <MetricCard label="Avg RR"      value={avgRR.toFixed(2)}                 color={avgRR >= 1 ? profileColor : '#ef4444'} />
              <MetricCard label="Trades"      value={String(filteredTrades.length)}    color="white" />
              <MetricCard label="Best Trade"  value={`$${best.toLocaleString()}`}      color={profileColor} />
              <MetricCard label="Worst Trade" value={`$${worst.toLocaleString()}`}     color="#ef4444" />
              <MetricCard label="Avg Win"     value={`$${avgWin.toFixed(0)}`}          color={profileColor} />
              <MetricCard label="Avg Loss"    value={`$${avgLoss.toFixed(0)}`}         color="#ef4444" />
            </div>

            {/* EQUITY CURVE */}
            <div style={S.section}>
              <div style={S.sectionHeader}>
                <h2 style={S.sectionTitle}>Equity Curve — {profile}</h2>
                {hover && (
                  <span style={S.hoverLabel}>
                    ${equity[hover.idx]?.toLocaleString()} · Trade {hover.idx}
                  </span>
                )}
              </div>
              <svg ref={svgRef} width="100%" viewBox={`0 0 ${W} ${H}`}
                style={{ display: 'block' }}
                onMouseMove={handleSvgMouseMove}
                onMouseLeave={() => setHover(null)}
              >
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
                {fillD && <path d={fillD} fill="url(#eqGrad)" />}
                {pathD && (
                  <path d={pathD} fill="none" stroke={profileColor} strokeWidth="2.5" strokeLinecap="round" />
                )}
                {hover && (
                  <>
                    <line x1={hover.x} y1={PAD.top} x2={hover.x} y2={PAD.top + innerH}
                      stroke="#ffffff22" strokeWidth="1" strokeDasharray="4 3" />
                    <circle cx={hover.x} cy={hover.y} r="5"
                      fill={profileColor} stroke="#0b0f1a" strokeWidth="2" />
                    <rect
                      x={Math.min(hover.x + 10, W - 140)} y={hover.y - 30}
                      width="130" height="24" rx="6" fill="#111827" stroke="#1f2937"
                    />
                    <text
                      x={Math.min(hover.x + 75, W - 75)} y={hover.y - 14}
                      textAnchor="middle" fill="white" fontSize="12"
                    >
                      ${equity[hover.idx]?.toLocaleString()}
                    </text>
                  </>
                )}
              </svg>
            </div>

            {/* STATS BY STRATEGY */}
            {statsByStrategy.length > 0 && (
              <div style={S.section}>
                <h2 style={S.sectionTitle}>Performance por Estrategia</h2>
                <div style={S.tableWrap}>
                  <table style={S.table}>
                    <thead>
                      <tr>
                        {['Estrategia','Trades','Total P&L','Win Rate','Avg RR'].map(h => (
                          <th key={h} style={S.th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {statsByStrategy.map(s => (
                        <tr key={s.strategy} style={S.tr}>
                          <td style={S.td}><span style={S.stratBadge}>{s.strategy}</span></td>
                          <td style={S.td}>{s.count}</td>
                          <td style={{ ...S.td, color: s.totalPnl >= 0 ? profileColor : '#ef4444' }}>
                            ${s.totalPnl.toLocaleString()}
                          </td>
                          <td style={S.td}>{s.winRate.toFixed(1)}%</td>
                          <td style={S.td}>{s.avgRR.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* STATS BY QUALITY */}
            {statsByQuality.length > 0 && (
              <div style={S.section}>
                <h2 style={S.sectionTitle}>Performance por Calidad</h2>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' as const }}>
                  {statsByQuality.map(q => (
                    <div key={q.quality} style={{
                      ...S.qualityCard,
                      borderTop: `3px solid ${QUALITY_COLORS[q.quality] || '#6b7280'}`,
                    }}>
                      <span style={{
                        ...S.qualityBadge,
                        background: QUALITY_COLORS[q.quality] || '#6b7280',
                      }}>
                        {q.quality}
                      </span>
                      <p style={S.qualityPnl}>
                        <span style={{ color: q.totalPnl >= 0 ? profileColor : '#ef4444' }}>
                          ${q.totalPnl.toLocaleString()}
                        </span>
                      </p>
                      <p style={S.qualitySub}>
                        {q.count} trade{q.count !== 1 ? 's' : ''} · {q.winRate.toFixed(0)}% WR
                      </p>
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
              <button style={{ ...S.btn, background: profileColor }} onClick={() => setShowAdd(true)}>
                + Add Trade
              </button>
              <button
                style={{ ...S.btnSecondary, ...(activeFiltersCount > 0 ? { borderColor: profileColor, color: profileColor } : {}) }}
                onClick={() => setShowFilters(v => !v)}
              >
                Filters {activeFiltersCount > 0 ? `(${activeFiltersCount})` : ''}
              </button>
              {activeFiltersCount > 0 && (
                <button style={S.btnGhost}
                  onClick={() => setFilters({ session: '', strategy: '', quality: '', dateFrom: '', dateTo: '' })}>
                  Clear
                </button>
              )}
            </div>

            {showFilters && (
              <div style={S.filterPanel}>
                <div style={S.filterGrid}>
                  <div>
                    <label style={S.filterLabel}>Session</label>
                    <select style={S.select} value={filters.session}
                      onChange={e => setFilters(f => ({ ...f, session: e.target.value }))}>
                      <option value="">All</option>
                      <option>New York</option><option>London</option><option>Asia</option>
                    </select>
                  </div>
                  <div>
                    <label style={S.filterLabel}>Strategy</label>
                    <select style={S.select} value={filters.strategy}
                      onChange={e => setFilters(f => ({ ...f, strategy: e.target.value }))}>
                      <option value="">All</option>
                      <option>Heikin Ashi</option><option>Zero Lag</option>
                    </select>
                  </div>
                  <div>
                    <label style={S.filterLabel}>Quality</label>
                    <select style={S.select} value={filters.quality}
                      onChange={e => setFilters(f => ({ ...f, quality: e.target.value }))}>
                      <option value="">All</option>
                      {QUALITY_ORDER.map(q => <option key={q}>{q}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={S.filterLabel}>Date From (d/m/yyyy)</label>
                    <input style={S.input} placeholder="1/1/2026" value={filters.dateFrom}
                      onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} />
                  </div>
                  <div>
                    <label style={S.filterLabel}>Date To (d/m/yyyy)</label>
                    <input style={S.input} placeholder="31/12/2026" value={filters.dateTo}
                      onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} />
                  </div>
                </div>
              </div>
            )}

            <div style={S.tradesGrid}>
              {sortedTrades.map(t => (
                <TradeCard key={t.id} trade={t} profileColor={profileColor} onClick={() => setViewTrade(t)} />
              ))}
              {sortedTrades.length === 0 && (
                <div style={S.empty}>No hay trades para este perfil o filtro.</div>
              )}
            </div>
          </>
        )}

        {/* ══════════ CALENDARIO ══════════ */}
        {tab === 'calendario' && (
          <div style={S.section}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <button style={S.btnSecondary} onClick={() => {
                if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
                else setCalMonth(m => m - 1);
              }}>← Anterior</button>
              <h2 style={{ ...S.sectionTitle, margin: 0 }}>
                {MONTH_NAMES[calMonth]} {calYear} — {profile}
              </h2>
              <button style={S.btnSecondary} onClick={() => {
                if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
                else setCalMonth(m => m + 1);
              }}>Siguiente →</button>
            </div>

            <div style={S.calGrid}>
              {['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map(d => (
                <div key={d} style={S.calDayHeader}>{d}</div>
              ))}

              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`e${i}`} />
              ))}

              {Array.from({ length: daysInMonth }).map((_, i) => {
                const d          = i + 1;
                const dayTrades  = tradesByDay(d);
                const dayPnl     = dayTrades.reduce((a, t) => a + t.pnl, 0);
                const hasData    = dayTrades.length > 0;
                const today      = new Date();
                const isToday    = today.getDate() === d
                  && today.getMonth()    === calMonth
                  && today.getFullYear() === calYear;

                let cellBg      = '#0b0f1a';
                let borderColor = isToday ? profileColor : '#1f2937';

                if (hasData && dayPnl > 0) {
                  cellBg      = 'rgba(34,197,94,0.13)';
                  borderColor = isToday ? profileColor : 'rgba(34,197,94,0.4)';
                } else if (hasData && dayPnl < 0) {
                  cellBg      = 'rgba(239,68,68,0.13)';
                  borderColor = isToday ? profileColor : 'rgba(239,68,68,0.4)';
                } else if (hasData) {
                  cellBg = 'rgba(107,114,128,0.13)';
                }

                const pnlColor = dayPnl >= 0 ? '#22c55e' : '#ef4444';

                return (
                  <div key={d} style={{
                    ...S.calCell,
                    background: cellBg,
                    border: `1.5px solid ${borderColor}`,
                  }}>
                    <span style={{
                      ...S.calDayNum,
                      color: isToday ? profileColor : hasData ? '#e5e7eb' : '#374151',
                    }}>
                      {d}
                    </span>

                    {hasData && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
                        <span style={{
                          fontSize: 15,
                          fontWeight: 800,
                          color: pnlColor,
                          lineHeight: 1,
                          letterSpacing: '-0.3px',
                        }}>
                          {dayPnl >= 0 ? '+' : ''}${dayPnl.toLocaleString()}
                        </span>
                        <span style={{
                          fontSize: 11,
                          fontWeight: 500,
                          color: dayPnl >= 0
                            ? 'rgba(34,197,94,0.65)'
                            : 'rgba(239,68,68,0.65)',
                        }}>
                          {dayTrades.length} trade{dayTrades.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══════════ VIEW TRADE MODAL ══════════ */}
        {viewTrade && (
          <div style={S.modalOverlay} onClick={() => setViewTrade(null)}>
            <div style={S.modalLarge} onClick={e => e.stopPropagation()}>
              <div style={S.modalHeader}>
                <h3 style={S.modalTitle}>Trade Detail</h3>
                <span style={{
                  ...S.qualityBadge,
                  background: QUALITY_COLORS[viewTrade.quality || 'B'] || '#6b7280',
                  fontSize: 14, padding: '4px 12px',
                }}>
                  {viewTrade.quality}
                </span>
              </div>
              <div style={S.split}>
                <div style={S.left}>
                  <InfoRow label="Date"      value={formatDate(viewTrade.date)} />
                  <InfoRow label="Session"   value={viewTrade.session} />
                  <InfoRow label="Strategy"  value={viewTrade.strategy} />
                  <InfoRow label="Operation" value={viewTrade.operation} />
                  <InfoRow label="Market"    value={viewTrade.market} />
                  <InfoRow label="P&L"       value={`$${viewTrade.pnl.toLocaleString()}`}
                    color={viewTrade.pnl >= 0 ? profileColor : '#ef4444'} />
                  <InfoRow label="R:R"       value={String(viewTrade.rr)} />
                  <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                    <button style={S.btnDanger} onClick={() => deleteTrade(viewTrade.id)}>Delete</button>
                    <button style={S.btnSecondary} onClick={() => setViewTrade(null)}>Close</button>
                  </div>
                </div>
                <div style={S.imagePanel}>
                  {viewTrade.image_url
                    ? <img src={viewTrade.image_url} style={S.image} alt="Trade chart" />
                    : <div style={S.placeholder}>No image attached</div>
                  }
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════ ADD TRADE MODAL ══════════ */}
        {showAdd && (
          <div style={S.modalOverlay} onClick={() => setShowAdd(false)}>
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

                <label style={S.filterLabel}>P&L ($)</label>
                <input style={S.input} placeholder="e.g. 250"
                  value={pnl} onChange={e => setPnl(e.target.value)} />

                <label style={S.filterLabel}>R:R</label>
                <input style={S.input} placeholder="e.g. 2.5"
                  value={rr} onChange={e => setRR(e.target.value)} />

                <label style={S.filterLabel}>Quality</label>
                <select style={S.select} value={quality} onChange={e => setQuality(e.target.value)}>
                  {QUALITY_ORDER.map(q => <option key={q}>{q}</option>)}
                </select>

                <label style={S.filterLabel}>Session</label>
                <select style={S.select} value={session} onChange={e => setSession(e.target.value)}>
                  <option>New York</option><option>London</option><option>Asia</option>
                </select>

                <label style={S.filterLabel}>Strategy</label>
                <select style={S.select}
                  value={strategy === 'Heikin Ashi' || strategy === 'Zero Lag' ? strategy : 'Otro'}
                  onChange={e => {
                    if (e.target.value !== 'Otro') setStrategy(e.target.value);
                    else setStrategy('');
                  }}>
                  <option>Heikin Ashi</option>
                  <option>Zero Lag</option>
                  <option>Otro</option>
                </select>
                {strategy !== 'Heikin Ashi' && strategy !== 'Zero Lag' && (
                  <input style={{ ...S.input, marginTop: 6 }}
                    placeholder="Escribe la estrategia..."
                    value={strategy} onChange={e => setStrategy(e.target.value)} />
                )}

                <label style={S.filterLabel}>Operation</label>
                <select style={S.select} value={operation} onChange={e => setOperation(e.target.value)}>
                  <option>Long</option><option>Short</option>
                </select>

                <label style={S.filterLabel}>Market</label>
                <select style={S.select} value={market} onChange={e => setMarket(e.target.value)}>
                  <option>MNQ</option><option>MCL</option><option>MGC</option>
                </select>

                <label style={S.filterLabel}>Chart Image</label>
                <div
                  style={{
                    ...S.dropZone,
                    borderColor: isDragging ? profileColor : '#1f2937',
                    background:  isDragging ? 'rgba(34,197,94,0.05)' : '#111827',
                  }}
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById('fileInput')?.click()}
                >
                  {imagePreview
                    ? <img src={imagePreview}
                        style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 8, objectFit: 'contain' }}
                        alt="Preview" />
                    : <>
                        <span style={{ fontSize: 28, marginBottom: 6 }}>🖼</span>
                        <span style={{ fontSize: 13, color: '#6b7280' }}>Arrastra una imagen aquí</span>
                        <span style={{ fontSize: 12, color: '#374151' }}>o haz click para elegir archivo</span>
                      </>
                  }
                </div>
                <input id="fileInput" type="file" accept="image/*"
                  style={{ display: 'none' }} onChange={handleFileChange} />
                {imagePreview && (
                  <button style={{ ...S.btnGhost, fontSize: 12, marginTop: 2 }}
                    onClick={() => { setImagePreview(null); setImageFile(null); }}>
                    × Quitar imagen
                  </button>
                )}

                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                  <button
                    style={{ ...S.btn, background: profileColor, opacity: uploading ? 0.6 : 1 }}
                    onClick={addTrade} disabled={uploading}>
                    {uploading ? 'Guardando...' : 'Guardar Trade'}
                  </button>
                  <button style={S.btnSecondary} onClick={() => setShowAdd(false)}>Cancelar</button>
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
function TradeCard({ trade, profileColor, onClick }: {
  trade: Trade; profileColor: string; onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{
        ...S.tradeCard,
        transform:  hovered ? 'translateY(-3px)' : 'none',
        boxShadow:  hovered ? '0 12px 40px rgba(0,0,0,0.55)' : '0 2px 8px rgba(0,0,0,0.2)',
        transition: 'transform 0.18s ease, box-shadow 0.18s ease',
        overflow:   'hidden',
      }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {trade.image_url && (
        <div style={{
          width: '100%', height: 200, overflow: 'hidden',
          borderRadius: '12px 12px 0 0', background: '#0b0f1a',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <img src={trade.image_url} alt="chart"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
      )}
      <div style={{ padding: '12px 14px' }}>
        <div style={S.tradeCardTop}>
          <span style={S.tradeDate}>{formatDate(trade.date)}</span>
          <span style={{ ...S.qualityBadge, background: QUALITY_COLORS[trade.quality || 'B'] || '#6b7280' }}>
            {trade.quality}
          </span>
        </div>
        <div style={{ ...S.tradePnl, color: trade.pnl >= 0 ? profileColor : '#ef4444' }}>
          {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toLocaleString()}
        </div>
        <div style={S.tradeMeta}>
          <span>{trade.session}</span><span>·</span>
          <span>{trade.strategy}</span><span>·</span>
          <span>{trade.market}</span>
        </div>
      </div>
    </div>
  );
}

/* ── METRIC CARD ── */
function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={S.metricCard}>
      <p style={S.metricLabel}>{label}</p>
      <h2 style={{ ...S.metricValue, color }}>{value}</h2>
    </div>
  );
}

/* ── INFO ROW ── */
function InfoRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={S.infoRow}>
      <span style={S.infoLabel}>{label}</span>
      <span style={{ ...S.infoValue, ...(color ? { color } : {}) }}>{value}</span>
    </div>
  );
}

/* ── STYLES ── */
const S: any = {
  page:      { background: '#050810', color: 'white', minHeight: '100vh', padding: '32px 24px', fontFamily: "'DM Sans', system-ui, sans-serif" },
  container: { maxWidth: 1200, margin: '0 auto' },

  header:        { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 },
  headerTitle:   { fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: '-0.5px' },
  headerSub:     { fontSize: 13, color: '#4b5563', margin: '4px 0 0' },
  headerBalance: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 },
  balanceLabel:  { fontSize: 12, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.08em' },
  balanceValue:  { fontSize: 24, fontWeight: 700 },

  profileSwitcher: { display: 'flex', gap: 8 },
  profileBtn:      { padding: '7px 18px', borderRadius: 20, cursor: 'pointer', fontWeight: 600, fontSize: 14, transition: 'all 0.15s' },

  nav:          { display: 'flex', gap: 8, marginBottom: 28, borderBottom: '1px solid #111827' },
  navBtn:       { background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: 14, fontWeight: 500, padding: '10px 16px', borderBottom: '2px solid transparent', transition: 'all 0.15s' },
  navBtnActive: { color: 'white', borderBottom: '2px solid #22c55e' },

  metricsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 28 },
  metricCard:  { background: '#0b0f1a', padding: '18px 20px', borderRadius: 14, border: '1px solid #111827' },
  metricLabel: { fontSize: 12, color: '#4b5563', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.07em' },
  metricValue: { fontSize: 24, fontWeight: 700, margin: 0 },

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