import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { getDashboard } from '../services/api'

function fmt(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n ?? 0)
}

// Projection simple : revenus passifs croissent linéairement
function buildProjection(current, objective, monthlyContrib = 200) {
  const points = []
  const now = new Date()
  let val = current
  for (let i = 0; i <= 36; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    points.push({
      mois: d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
      revenus: parseFloat(val.toFixed(2)),
      objectif: objective,
    })
    val += monthlyContrib * 0.004
  }
  return points
}

export default function Objectives() {
  const [data,     setData]     = useState(null)
  const [contrib,  setContrib]  = useState(200)
  const [goal,     setGoal]     = useState(500)

  useEffect(() => {
    getDashboard()
      .then(r => { setData(r.data); setGoal(r.data.objective ?? 500) })
      .catch(() => {})
  }, [])

  const current     = data?.monthly_passive ?? 0
  const total       = data?.total_patrimony ?? 0
  const progressPct = Math.min((current / goal) * 100, 100)

  const projection  = buildProjection(current, goal, contrib)
  const reachMonth  = projection.find(p => p.revenus >= goal)

  return (
    <div>
      <div className="page-header">
        <h1>Objectif</h1>
        <p>Progression vers {fmt(goal)} / mois de revenus passifs</p>
      </div>

      {/* Progress hero */}
      <div className="card" style={{ marginBottom: 24, textAlign: 'center', padding: 36 }}>
        <div style={{ fontSize: '0.8rem', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
          Revenus passifs mensuels actuels
        </div>
        <div style={{ fontSize: '3rem', fontWeight: 800, background: 'linear-gradient(135deg, var(--accent), var(--accent2))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
          {fmt(current)}
        </div>
        <div style={{ color: 'var(--text3)', marginBottom: 20 }}>sur {fmt(goal)} / mois</div>

        <div className="progress-wrap" style={{ height: 12, marginBottom: 10, maxWidth: 500, margin: '0 auto 10px' }}>
          <div className="progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <div style={{ color: 'var(--accent2)', fontWeight: 600 }}>{progressPct.toFixed(1)}%</div>
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="label">Patrimoine total</div>
          <div className="value">{fmt(total)}</div>
          <div className="sub">Investissements actuels</div>
        </div>
        <div className="stat-card">
          <div className="label">Il manque</div>
          <div className="value">{fmt(Math.max(goal - current, 0))}</div>
          <div className="sub">Pour atteindre l'objectif</div>
        </div>
      </div>

      {/* Projection */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <h3 style={{ fontSize: '0.95rem', color: 'var(--text2)' }}>Projection sur 3 ans</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.85rem' }}>
            <span className="muted">Contribution mensuelle :</span>
            <input
              type="number" min="0" step="50" value={contrib}
              onChange={e => setContrib(Number(e.target.value))}
              style={{ width: 80, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px', color: 'var(--text)' }}
            />
            <span className="muted">€</span>
          </div>
        </div>

        {reachMonth && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(99,102,241,.1)', border: '1px solid rgba(99,102,241,.3)', borderRadius: 10, fontSize: '0.875rem', color: 'var(--accent2)' }}>
            🎯 Avec {fmt(contrib)}/mois investis, tu atteindrais <strong>{fmt(goal)}/mois</strong> en <strong>{reachMonth.mois}</strong>
          </div>
        )}

        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={projection}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="mois" tick={{ fill: 'var(--text3)', fontSize: 11 }} interval={5} />
            <YAxis tick={{ fill: 'var(--text3)', fontSize: 11 }} tickFormatter={v => `${v}€`} />
            <Tooltip formatter={v => fmt(v)} contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8 }} />
            <ReferenceLine y={goal} stroke="var(--accent2)" strokeDasharray="4 4" label={{ value: 'Objectif', fill: 'var(--accent2)', fontSize: 11 }} />
            <Line type="monotone" dataKey="revenus" stroke="var(--accent)" strokeWidth={2} dot={false} name="Revenus passifs" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Modify objective */}
      <div className="card">
        <h3 style={{ marginBottom: 14, fontSize: '0.95rem', color: 'var(--text2)' }}>Modifier l'objectif</h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input
            type="number" min="0" step="50" value={goal}
            onChange={e => setGoal(Number(e.target.value))}
            style={{ width: 120, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--text)' }}
          />
          <span className="muted">€ / mois</span>
        </div>
      </div>
    </div>
  )
}
