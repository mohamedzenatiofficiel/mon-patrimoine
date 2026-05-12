import { useEffect, useState, useCallback, useRef } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  XAxis, YAxis, CartesianGrid, Area, AreaChart,
} from 'recharts'
import { getDashboard, getSnapshots, createSnapshot, getEnvelopes, getStrategyGoal, getStrategyPhases } from '../services/api'

const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#38bdf8']
const BAR_COLORS = ['#6366f1','#8b5cf6','#10b981','#f59e0b','#ef4444','#38bdf8','#f472b6','#fb923c']

function fmt(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n ?? 0)
}
function fmtShort(n) {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M€'
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + 'k€'
  return n.toFixed(0) + '€'
}
function fmtDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

const PERIODS = [
  { key: '1m', label: '1M' },
  { key: '3m', label: '3M' },
  { key: '1y', label: '1A' },
  { key: 'all', label: 'Tout' },
]

function StatCard({ label, value, sub, accent = '#6366f1', badge, badgeType }) {
  return (
    <div className="stat-card" style={{ borderTop: `2px solid ${accent}22` }}>
      <div className="label">{label}</div>
      <div className="value" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}99)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
        {value}
      </div>
      {sub && <div className="sub">{sub}</div>}
      {badge && <span className={`badge ${badgeType || 'blue'}`}>{badge}</span>}
    </div>
  )
}

function DonutCenter({ total }) {
  return (
    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', pointerEvents: 'none' }}>
      <div style={{ fontSize: '0.65rem', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Total</div>
      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>{fmtShort(total)}</div>
    </div>
  )
}

export default function Dashboard() {
  const [data,       setData]      = useState(null)
  const [loading,    setLoading]   = useState(true)
  const [snapshots,  setSnapshots] = useState([])
  const [period,     setPeriod]    = useState('3m')
  const [snapping,   setSnapping]  = useState(false)
  const [snapMsg,    setSnapMsg]   = useState(null)
  const [snapMsgType, setSnapMsgType] = useState(null)
  const [envelopes,  setEnvelopes] = useState([])
  const [goal,       setGoal]      = useState(null)
  const [phases,     setPhases]    = useState([])
  const snapRef = useRef(null)

  const loadSnapshots = useCallback((p) => {
    getSnapshots(p).then(r => setSnapshots(r.data)).catch(() => setSnapshots([]))
  }, [])

  useEffect(() => {
    Promise.all([
      getDashboard(),
      getEnvelopes().catch(() => ({ data: [] })),
      getStrategyGoal().catch(() => ({ data: null })),
      getStrategyPhases().catch(() => ({ data: [] })),
    ]).then(([d, e, g, p]) => {
      setData(d.data)
      setEnvelopes(e.data)
      setGoal(g.data)
      setPhases(p.data)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadSnapshots(period) }, [period, loadSnapshots])
  useEffect(() => () => { if (snapRef.current) clearTimeout(snapRef.current) }, [])

  const handleSnapshot = async () => {
    setSnapping(true); setSnapMsg(null)
    try {
      await createSnapshot()
      setSnapMsg('Snapshot enregistré !'); setSnapMsgType('success')
      loadSnapshots(period)
    } catch {
      setSnapMsg('Erreur'); setSnapMsgType('error')
    } finally {
      setSnapping(false)
      snapRef.current = setTimeout(() => { setSnapMsg(null) }, 3000)
    }
  }

  if (loading) return <div className="empty">Chargement...</div>

  const total           = data?.total_patrimony  ?? 0
  const pea             = data?.pea_value        ?? 0
  const crypto          = data?.crypto_value     ?? 0
  const savingsTotal    = data?.savings_total    ?? 0
  const savingsAccounts = data?.savings_accounts ?? []
  const expenses        = data?.monthly_expenses ?? 0

  const checkingAcc = savingsAccounts.find(s => s.source_type === 'compte_courant')
  const savingsOnly = savingsAccounts.filter(s => s.source_type !== 'compte_courant')

  const accentFor = (type) => type === 'compte_courant' ? '#34d399' : '#38bdf8'

  const pieData = [
    { name: 'PEA',     value: pea,    color: '#10b981' },
    { name: 'Cryptos', value: crypto, color: '#f59e0b' },
    ...savingsAccounts.filter(s => s.balance > 0).map(s => ({
      name: s.label, value: s.balance, color: accentFor(s.source_type),
    })),
  ].filter(d => d.value > 0)

  const totalSub = [
    'PEA', 'Crypto',
    ...savingsOnly.map(s => s.label),
    ...(checkingAcc ? ['Compte courant'] : []),
  ].join(' · ')

  const expenseBreakdown = data?.expense_breakdown ?? []
  const maxExpense = Math.max(...expenseBreakdown.map(e => e.amount), 1)

  const chartData = snapshots.map(s => ({
    label: fmtDate(s.date),
    total: s.total_value,
    pea: s.pea_value,
    crypto: s.crypto_value,
  }))

  const firstVal = chartData[0]?.total ?? 0
  const lastVal  = chartData[chartData.length - 1]?.total ?? 0
  const perfPct  = firstVal > 0 ? ((lastVal - firstVal) / firstVal * 100).toFixed(2) : null
  const perfPos  = perfPct !== null && parseFloat(perfPct) >= 0

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Vue d'ensemble de ton patrimoine</p>
      </div>

      {/* Stat cards */}
      <div className="stat-grid">
        <StatCard
          label="Patrimoine total"
          value={fmt(total)}
          sub={totalSub}
          accent="#6366f1"
          badge={perfPct !== null ? `${perfPos ? '+' : ''}${perfPct}%` : null}
          badgeType={perfPos ? 'green' : 'red'}
        />
        <StatCard
          label="PEA · Trade Republic"
          value={fmt(pea)}
          sub={total > 0 ? `${((pea / total) * 100).toFixed(1)}% du patrimoine` : 'ETF'}
          accent="#10b981"
        />
        <StatCard
          label="Cryptos · Binance"
          value={fmt(crypto)}
          sub={total > 0 ? `${((crypto / total) * 100).toFixed(1)}% du patrimoine` : 'Portefeuille crypto'}
          accent="#f59e0b"
        />
        {savingsAccounts.map(s => (
          <StatCard
            key={s.source_type}
            label={s.label}
            value={fmt(s.balance)}
            sub={s.source_type === 'compte_courant'
              ? 'Solde disponible'
              : total > 0 ? `${((s.balance / total) * 100).toFixed(1)}% du patrimoine` : 'Épargne'}
            accent={accentFor(s.source_type)}
          />
        ))}
        <StatCard
          label="Dépenses ce mois"
          value={fmt(expenses)}
          sub="Mois en cours"
          accent="#ef4444"
        />
      </div>

      {/* Evolution chart */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text3)', fontWeight: 600, marginBottom: 4 }}>Évolution du patrimoine</div>
            {perfPct !== null && (
              <span style={{ fontSize: '1.1rem', fontWeight: 700, letterSpacing: '-0.02em', color: perfPos ? 'var(--green)' : 'var(--red)' }}>
                {perfPos ? '+' : ''}{perfPct}%
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 3, background: 'rgba(255,255,255,0.04)', borderRadius: 9, padding: 3, border: '1px solid var(--border)' }}>
              {PERIODS.map(({ key, label }) => (
                <button key={key} onClick={() => setPeriod(key)} style={{
                  padding: '4px 12px', borderRadius: 7, border: period === key ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
                  background: period === key ? 'rgba(99,102,241,0.15)' : 'transparent',
                  color: period === key ? 'var(--text)' : 'var(--text3)',
                  fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                }}>
                  {label}
                </button>
              ))}
            </div>
            <button onClick={handleSnapshot} disabled={snapping} style={{
              padding: '5px 14px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'rgba(255,255,255,0.04)', color: 'var(--text2)',
              fontSize: '0.78rem', fontWeight: 600,
            }}>
              {snapping ? '...' : '📸 Snapshot'}
            </button>
            {snapMsg && <span style={{ fontSize: '0.78rem', color: snapMsgType === 'error' ? 'var(--red)' : 'var(--green)' }}>{snapMsg}</span>}
          </div>
        </div>

        {chartData.length < 2 ? (
          <div className="empty" style={{ padding: '40px 0' }}>
            Pas encore assez de données — clique sur 📸 Snapshot pour enregistrer la valeur actuelle
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gPea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gCrypto" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: 'var(--text3)' }} width={56} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v, name) => [fmt(v), name === 'total' ? 'Total' : name === 'pea' ? 'PEA' : 'Crypto']}
                contentStyle={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: '0.85rem' }}
                labelStyle={{ color: 'var(--text)', fontWeight: 600, marginBottom: 4 }}
                cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }}
              />
              <Area type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2} fill="url(#gTotal)" dot={false} activeDot={{ r: 4, fill: '#6366f1' }} />
              <Area type="monotone" dataKey="pea" stroke="#10b981" strokeWidth={1.5} fill="url(#gPea)" dot={false} activeDot={{ r: 3, fill: '#10b981' }} />
              <Area type="monotone" dataKey="crypto" stroke="#f59e0b" strokeWidth={1.5} fill="url(#gCrypto)" dot={false} activeDot={{ r: 3, fill: '#f59e0b' }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Passive income widget ── */}
      {(() => {
        const swr = (goal?.swr ?? 4) / 100
        const targetPassive = goal?.target_monthly_passive ?? 500
        const currentPassive = Math.round(pea * swr / 12)
        const progressPct = Math.min((currentPassive / targetPassive) * 100, 100)
        const now = new Date()
        const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`
        const currentPhase = phases.find(p => p.start_date <= todayStr && (!p.end_date || p.end_date >= todayStr)) ?? phases[phases.length - 1]
        const monthlyInvest = currentPhase?.monthly_total ?? 0

        function projectPassive(addYears) {
          const r = 0.10 / 12
          let cap = pea
          for (let m = 0; m < addYears * 12; m++) cap = cap * (1 + r) + monthlyInvest
          return Math.round(cap * swr / 12)
        }

        return (
          <div className="card" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                  Revenus passifs estimés
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: '1.8rem', fontWeight: 800, color: currentPassive >= targetPassive ? '#10b981' : 'var(--accent)', letterSpacing: '-0.04em' }}>
                    {currentPassive.toLocaleString('fr-FR')} €/mois
                  </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text3)' }}>actuellement</span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>Objectif {targetPassive}€/mois</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: progressPct >= 100 ? '#10b981' : 'var(--accent)' }}>
                  {progressPct.toFixed(1)}%
                </div>
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 99, height: 8, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{
                height: '100%', borderRadius: 99, transition: 'width 0.8s',
                width: `${progressPct}%`,
                background: progressPct >= 100 ? 'linear-gradient(90deg,#10b981,#34d399)' : 'linear-gradient(90deg,#6366f1,#8b5cf6)',
              }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {[
                { label: 'Dans 1 an', passive: projectPassive(1) },
                { label: 'Dans 3 ans', passive: projectPassive(3) },
                { label: 'Dans 5 ans', passive: projectPassive(5) },
              ].map(p => (
                <div key={p.label} style={{ padding: '10px 12px', background: 'var(--bg3)', borderRadius: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text3)', marginBottom: 4 }}>{p.label}</div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: p.passive >= targetPassive ? '#10b981' : 'var(--text)' }}>
                    {p.passive.toLocaleString('fr-FR')} €/mois
                  </div>
                  {p.passive >= targetPassive && (
                    <div style={{ fontSize: '0.65rem', color: '#10b981', marginTop: 2 }}>✅ Objectif</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* ── Envelopes ── */}
      {envelopes.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16 }}>
            Mes enveloppes fiscales
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {envelopes.map(env => {
              const isActive = env.status === 'active'
              const typeColor = { PEA: '#10b981', CTO: '#6366f1', AV: '#f59e0b', SCPI: '#8b5cf6' }[env.type] ?? '#94a3b8'
              const openYear = env.open_date ? new Date(env.open_date).getFullYear() : null
              const fiscalMaturity = openYear ? openYear + 5 : null
              const yearsLeft = fiscalMaturity ? fiscalMaturity - new Date().getFullYear() : null

              return (
                <div key={env.id} style={{
                  padding: '14px 16px', borderRadius: 12,
                  background: isActive ? `${typeColor}0a` : 'var(--bg3)',
                  border: `1px solid ${isActive ? `${typeColor}33` : 'var(--border)'}`,
                  opacity: isActive ? 1 : 0.7,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: `${typeColor}22`, color: typeColor }}>
                        {env.type}
                      </span>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', marginTop: 6 }}>{env.label}</div>
                    </div>
                    <span style={{
                      fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                      background: isActive ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.1)',
                      color: isActive ? '#10b981' : '#f59e0b',
                    }}>
                      {isActive ? 'Actif' : 'Planifié'}
                    </span>
                  </div>

                  {isActive ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {env.etf_name && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text2)' }}>{env.etf_name}</div>
                      )}
                      {env.broker && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>via {env.broker}</div>
                      )}
                      {env.monthly_amount > 0 && (
                        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: typeColor }}>
                          {env.monthly_amount.toLocaleString('fr-FR')} €/mois
                        </div>
                      )}
                      {fiscalMaturity && (
                        <div style={{ fontSize: '0.7rem', color: yearsLeft <= 0 ? '#10b981' : 'var(--text3)', marginTop: 2 }}>
                          {yearsLeft <= 0
                            ? '✓ Avantage fiscal actif'
                            : `Avantage fiscal dans ${yearsLeft} an${yearsLeft > 1 ? 's' : ''} (${fiscalMaturity})`}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text3)' }}>
                      Ouverture prévue : {env.planned_open_date
                        ? new Date(env.planned_open_date).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
                        : '—'}
                      {env.etf_name && (
                        <div style={{ marginTop: 4, color: 'var(--text2)' }}>ETF prévu : {env.etf_name}</div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Bottom grid */}
      <div className="grid-2">
        {/* Donut chart */}
        <div className="card">
          <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text3)', fontWeight: 600, marginBottom: 16 }}>Répartition du patrimoine</div>
          {pieData.length > 0 ? (
            <>
              <div style={{ position: 'relative', height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%" cy="50%"
                      innerRadius={62} outerRadius={88}
                      dataKey="value" paddingAngle={3}
                      strokeWidth={0}
                    >
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color ?? PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip
                      formatter={(v, name) => [fmt(v), name]}
                      contentStyle={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: '0.85rem' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <DonutCenter total={total} />
              </div>
              {/* Legend */}
              <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginTop: 12 }}>
                {pieData.map((entry, i) => (
                  <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: entry.color ?? PIE_COLORS[i % PIE_COLORS.length], display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>{entry.name}</span>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)' }}>{total > 0 ? `${((entry.value / total) * 100).toFixed(0)}%` : '—'}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty">Aucun investissement</div>
          )}
        </div>

        {/* Expense breakdown */}
        <div className="card">
          <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text3)', fontWeight: 600, marginBottom: 16 }}>Dépenses ce mois</div>
          {expenseBreakdown.length === 0 ? (
            <div className="empty">Aucune dépense ce mois</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {expenseBreakdown.map(({ category, amount }, i) => (
                <div key={category}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: '0.83rem', color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: BAR_COLORS[i % BAR_COLORS.length], display: 'inline-block' }} />
                      {category}
                    </span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>{((amount / expenses) * 100).toFixed(0)}%</span>
                      <span style={{ fontSize: '0.83rem', fontWeight: 600 }}>{fmt(amount)}</span>
                    </div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 99, height: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(amount / maxExpense) * 100}%`, background: BAR_COLORS[i % BAR_COLORS.length], borderRadius: 99, transition: 'width 0.6s ease' }} />
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--border)', marginTop: 4 }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text3)' }}>Total</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>{fmt(expenses)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
