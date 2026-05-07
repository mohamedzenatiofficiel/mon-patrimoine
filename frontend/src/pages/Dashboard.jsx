import { useEffect, useState, useCallback, useRef } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  XAxis, YAxis, CartesianGrid, Area, AreaChart,
} from 'recharts'
import { getDashboard, getSnapshots, createSnapshot, getCashflow } from '../services/api'
import CashflowSankey from '../components/CashflowSankey'

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

function fmt(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

function fmtShort(n) {
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + 'k €'
  return n.toFixed(0) + ' €'
}

function fmtDate(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

const PERIODS = [
  { key: '1m', label: '1 mois' },
  { key: '3m', label: '3 mois' },
  { key: '1y', label: '1 an' },
  { key: 'all', label: 'Tout' },
]

export default function Dashboard() {
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(true)
  const [cashflowData, setCashflowData] = useState(null)
  const [snapshots, setSnapshots] = useState([])
  const [period, setPeriod]       = useState('3m')
  const [snapping, setSnapping]   = useState(false)
  const [snapMsg, setSnapMsg]     = useState(null)
  const [snapMsgType, setSnapMsgType] = useState(null)
  const snapMsgTimeoutRef         = useRef(null)

  const loadSnapshots = useCallback((p) => {
    getSnapshots(p)
      .then(r => setSnapshots(r.data))
      .catch(() => setSnapshots([]))
  }, [])

  useEffect(() => {
    getDashboard()
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
    getCashflow()
      .then(r => setCashflowData(r.data))
      .catch(() => setCashflowData(null))
  }, [])

  useEffect(() => {
    loadSnapshots(period)
  }, [period, loadSnapshots])

  useEffect(() => () => {
    if (snapMsgTimeoutRef.current) clearTimeout(snapMsgTimeoutRef.current)
  }, [])

  const handleSnapshot = async () => {
    setSnapping(true)
    setSnapMsg(null)
    setSnapMsgType(null)
    try {
      await createSnapshot()
      setSnapMsg('Snapshot enregistré !')
      setSnapMsgType('success')
      loadSnapshots(period)
    } catch {
      setSnapMsg('Erreur lors du snapshot')
      setSnapMsgType('error')
    } finally {
      setSnapping(false)
      if (snapMsgTimeoutRef.current) clearTimeout(snapMsgTimeoutRef.current)
      snapMsgTimeoutRef.current = setTimeout(() => {
        setSnapMsg(null)
        setSnapMsgType(null)
      }, 3000)
    }
  }

  if (loading) return <div className="empty">Chargement...</div>

  const total           = data?.total_patrimony   ?? 0
  const pea             = data?.pea_value         ?? 0
  const crypto          = data?.crypto_value      ?? 0
  const monthlyExpenses = data?.monthly_expenses  ?? 0

  const pieData = [
    { name: 'PEA', value: pea },
    { name: 'Cryptos', value: crypto },
  ].filter(d => d.value > 0)

  const expenseBreakdown = data?.expense_breakdown ?? []

  const chartData = snapshots.map(s => ({
    date: s.date,
    label: fmtDate(s.date),
    total: s.total_value,
    pea: s.pea_value,
    crypto: s.crypto_value,
  }))

  const firstVal = chartData[0]?.total ?? 0
  const lastVal  = chartData[chartData.length - 1]?.total ?? 0
  const perfPct  = firstVal > 0 ? ((lastVal - firstVal) / firstVal * 100).toFixed(2) : null
  const perfPos  = perfPct === null ? null : parseFloat(perfPct) >= 0

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Vue d'ensemble de ton patrimoine</p>
      </div>

      {/* Stat cards */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Patrimoine total</div>
          <div className="value">{fmt(total)}</div>
          <div className="sub">PEA + Cryptos</div>
        </div>

        <div className="stat-card">
          <div className="label">PEA (Trade Republic)</div>
          <div className="value">{fmt(pea)}</div>
          <div className="sub">ETF S&amp;P 500</div>
        </div>

        <div className="stat-card">
          <div className="label">Cryptos (Binance)</div>
          <div className="value">{fmt(crypto)}</div>
          <div className="sub">Portefeuille crypto</div>
        </div>

        <div className="stat-card">
          <div className="label">Dépenses ce mois</div>
          <div className="value">{fmt(monthlyExpenses)}</div>
          <div className="sub">Mois en cours</div>
        </div>
      </div>

      {/* Historical evolution chart */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 style={{ fontSize: '0.95rem', color: 'var(--text2)', margin: 0 }}>Évolution du patrimoine</h3>
            {perfPct !== null && (
              <span style={{ fontSize: '0.8rem', color: perfPos ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                {perfPos ? '+' : ''}{perfPct}% sur la période
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {PERIODS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setPeriod(key)}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: period === key ? 'var(--accent)' : 'var(--bg2)',
                    color: period === key ? '#fff' : 'var(--text2)',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={handleSnapshot}
              disabled={snapping}
              style={{
                padding: '4px 14px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--bg2)',
                color: 'var(--text2)',
                cursor: snapping ? 'not-allowed' : 'pointer',
                fontSize: '0.8rem',
                fontWeight: 600,
                opacity: snapping ? 0.6 : 1,
              }}
            >
              {snapping ? '...' : '📸 Snapshot'}
            </button>
            {snapMsg && (
              <span style={{ fontSize: '0.8rem', color: snapMsgType === 'error' ? '#ef4444' : '#10b981' }}>
                {snapMsg}
              </span>
            )}
          </div>
        </div>

        {chartData.length < 2 ? (
          <div className="empty" style={{ padding: '40px 0' }}>
            Pas encore assez de données — clique sur 📸 Snapshot pour enregistrer la valeur d'aujourd'hui
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradPea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradCrypto" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text2)' }} />
              <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: 'var(--text2)' }} width={60} />
              <Tooltip
                formatter={(v, name) => [fmt(v), name === 'total' ? 'Total' : name === 'pea' ? 'PEA' : 'Crypto']}
                contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.85rem' }}
                labelStyle={{ color: 'var(--text)', fontWeight: 600 }}
              />
              <Legend formatter={(v) => v === 'total' ? 'Total' : v === 'pea' ? 'PEA' : 'Crypto'} />
              <Area type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2} fill="url(#gradTotal)" dot={false} />
              <Area type="monotone" dataKey="pea" stroke="#10b981" strokeWidth={1.5} fill="url(#gradPea)" dot={false} />
              <Area type="monotone" dataKey="crypto" stroke="#f59e0b" strokeWidth={1.5} fill="url(#gradCrypto)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Main grid */}
      <div className="grid-2">

        {/* Répartition */}
        <div className="card">
          <h3 style={{ marginBottom: 16, fontSize: '0.95rem', color: 'var(--text2)' }}>Répartition du patrimoine</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" paddingAngle={4}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8 }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty">Aucun investissement enregistré</div>
          )}
        </div>

        {/* Dépenses par catégorie */}
        <div className="card">
          <h3 style={{ marginBottom: 16, fontSize: '0.95rem', color: 'var(--text2)' }}>Dépenses ce mois — par catégorie</h3>
          {expenseBreakdown.length === 0 ? (
            <div className="empty">Aucune dépense ce mois</div>
          ) : (
            expenseBreakdown.map(({ category, amount }) => (
              <div key={category} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>
                <span className="muted">{category}</span>
                <span style={{ fontWeight: 600 }}>{fmt(amount)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Cashflow Sankey */}
      <div className="card" style={{ marginTop: 24 }}>
        <h3 style={{ marginBottom: 16, fontSize: '0.95rem', color: 'var(--text2)' }}>Cashflow mensuel</h3>
        {cashflowData && cashflowData.nodes.length > 1 ? (
          <CashflowSankey data={cashflowData} height={380} />
        ) : (
          <div className="empty">Aucune dépense ce mois</div>
        )}
      </div>
    </div>
  )
}
