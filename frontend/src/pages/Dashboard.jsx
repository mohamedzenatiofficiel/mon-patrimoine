import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { getDashboard, getCashflow } from '../services/api'
import CashflowSankey from '../components/CashflowSankey'

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

function fmt(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n)
}

function pct(a, b) {
  if (!b) return 0
  return ((a - b) / b * 100).toFixed(2)
}

export default function Dashboard() {
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(true)
  const [cashflowData, setCashflowData] = useState(null)

  useEffect(() => {
    getDashboard()
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
    getCashflow()
      .then(r => setCashflowData(r.data))
      .catch(() => setCashflowData(null))
  }, [])

  if (loading) return <div className="empty">Chargement...</div>

  const total           = data?.total_patrimony   ?? 0
  const pea             = data?.pea_value         ?? 0
  const crypto          = data?.crypto_value      ?? 0
  const monthlyExpenses = data?.monthly_expenses  ?? 0
  const monthlyPassive  = data?.monthly_passive   ?? 0
  const objective       = data?.objective         ?? 500
  const progressPct     = Math.min((monthlyPassive / objective) * 100, 100).toFixed(1)

  const pieData = [
    { name: 'PEA', value: pea },
    { name: 'Cryptos', value: crypto },
  ].filter(d => d.value > 0)

  const expenseBreakdown = data?.expense_breakdown ?? []

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
