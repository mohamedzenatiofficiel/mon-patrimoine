import { useEffect, useState } from 'react'
import {
  getBudgets, upsertBudget, deleteBudget, getBudgetStatus,
  getMonthlyIncome, upsertMonthlyIncome,
} from '../services/api'

function fmt(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n ?? 0)
}

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

const CATEGORIES = [
  'Vie quotidienne', 'Investissement mensuel', 'Abonnement', 'Logement',
  'Transport', 'Santé', 'Loisirs', 'Famille', 'Autre',
]

function statusColor(percent) {
  if (percent >= 100) return 'var(--red)'
  if (percent >= 80)  return 'var(--yellow)'
  return 'var(--green)'
}

function BudgetBar({ percent }) {
  const clamped = Math.min(percent, 100)
  return (
    <div style={{ background: 'var(--bg3)', borderRadius: 6, height: 8, overflow: 'hidden', flexShrink: 0, width: '100%' }}>
      <div style={{
        height: '100%',
        width: `${clamped}%`,
        background: statusColor(percent),
        borderRadius: 6,
        transition: 'width 0.4s ease',
      }} />
    </div>
  )
}

function StatusBadge({ percent }) {
  const color = statusColor(percent)
  let label = 'OK'
  if (percent >= 100) label = 'Dépassé'
  else if (percent >= 80) label = 'Alerte'
  return (
    <span style={{
      fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px',
      borderRadius: 12, background: `${color}22`, color, border: `1px solid ${color}55`,
    }}>
      {label}
    </span>
  )
}

export default function BudgetPage() {
  const now = new Date()
  const [year,   setYear]   = useState(now.getFullYear())
  const [month,  setMonth]  = useState(now.getMonth() + 1)

  const [budgets,  setBudgets]  = useState([])
  const [statuses, setStatuses] = useState([])
  const [income,   setIncome]   = useState(null)

  const [budgetForm, setBudgetForm] = useState({ category: CATEGORIES[0], monthly_limit: '' })
  const [showBudgetForm, setShowBudgetForm] = useState(false)

  const [incomeForm, setIncomeForm] = useState({ amount: '', savings_target: 30 })
  const [incomeEditing, setIncomeEditing] = useState(false)

  useEffect(() => { fetchAll() }, [year, month])

  async function fetchAll() {
    const [b, s, i] = await Promise.all([
      getBudgets(),
      getBudgetStatus(year, month),
      getMonthlyIncome(year, month),
    ])
    setBudgets(b.data)
    setStatuses(s.data)
    const inc = i.data
    setIncome(inc)
    if (inc) {
      setIncomeForm({ amount: inc.amount, savings_target: inc.savings_target })
    } else {
      setIncomeForm({ amount: '', savings_target: 30 })
    }
  }

  async function handleAddBudget(e) {
    e.preventDefault()
    await upsertBudget({ category: budgetForm.category, monthly_limit: parseFloat(budgetForm.monthly_limit) })
    setBudgetForm({ category: CATEGORIES[0], monthly_limit: '' })
    setShowBudgetForm(false)
    await fetchAll()
  }

  async function handleDeleteBudget(id) {
    if (!confirm('Supprimer ce budget ?')) return
    await deleteBudget(id)
    await fetchAll()
  }

  async function handleSaveIncome(e) {
    e.preventDefault()
    await upsertMonthlyIncome({
      year, month,
      amount: parseFloat(incomeForm.amount),
      savings_target: parseFloat(incomeForm.savings_target),
    })
    setIncomeEditing(false)
    await fetchAll()
  }

  // Compute total spending from budget statuses
  const totalSpent = statuses.reduce((s, st) => s + st.spent, 0)
  const incomeAmount = income?.amount || 0
  const savingsTarget = income?.savings_target || 30
  const actualSavings = incomeAmount > 0 ? incomeAmount - totalSpent : null
  const actualSavingsRate = incomeAmount > 0 ? (actualSavings / incomeAmount) * 100 : null
  const savingsGap = actualSavingsRate !== null ? actualSavingsRate - savingsTarget : null

  // Alerts: categories exceeding 80%
  const alerts = statuses.filter(s => s.percent >= 80)

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Budget</h1>
          <p>Plafonds mensuels par catégorie et suivi de l'épargne</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowBudgetForm(v => !v)}>
          {showBudgetForm ? '✕ Fermer' : '+ Ajouter un budget'}
        </button>
      </div>

      {/* Month selector */}
      <div className="card" style={{ marginBottom: 20, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--text2)', fontSize: '0.875rem' }}>Période :</span>
        <select value={month} onChange={e => setMonth(Number(e.target.value))}
          style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', color: 'var(--text)' }}>
          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', color: 'var(--text)' }}>
          {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div style={{
          marginBottom: 20, padding: '14px 18px', borderRadius: 12,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--red)' }}>
            ⚠ {alerts.length} catégorie{alerts.length > 1 ? 's' : ''} proche{alerts.length > 1 ? 's' : ''} du plafond ou dépassée{alerts.length > 1 ? 's' : ''}
          </span>
          {alerts.map(a => (
            <span key={a.category} style={{ fontSize: '0.82rem', color: 'var(--text2)' }}>
              <span style={{ color: statusColor(a.percent), fontWeight: 600 }}>{a.category}</span>
              {' — '}{fmt(a.spent)} / {fmt(a.monthly_limit)} ({a.percent}%)
            </span>
          ))}
        </div>
      )}

      {/* Add budget form */}
      {showBudgetForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 16, fontSize: '0.95rem' }}>Définir un plafond mensuel</h3>
          <form onSubmit={handleAddBudget}>
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <div className="form-group">
                <label>Catégorie</label>
                <select value={budgetForm.category} onChange={e => setBudgetForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Plafond mensuel (€)</label>
                <input required type="number" step="1" min="1" placeholder="ex: 200"
                  value={budgetForm.monthly_limit}
                  onChange={e => setBudgetForm(f => ({ ...f, monthly_limit: e.target.value }))} />
              </div>
            </div>
            <button className="btn btn-primary" type="submit">Enregistrer</button>
          </form>
        </div>
      )}

      <div className="grid-2">
        {/* Budget status by category */}
        <div className="card">
          <h3 style={{ marginBottom: 16, fontSize: '0.95rem', color: 'var(--text2)' }}>Budgets par catégorie</h3>
          {statuses.length === 0 && budgets.length === 0 ? (
            <div className="empty">Aucun budget défini — cliquez sur "+ Ajouter un budget"</div>
          ) : statuses.length === 0 ? (
            <div className="empty">Aucune dépense ce mois pour les catégories budgétées</div>
          ) : null}

          {statuses.map(st => (
            <div key={st.category} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{st.category}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <StatusBadge percent={st.percent} />
                  <span style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>
                    {fmt(st.spent)} / {fmt(st.monthly_limit)}
                  </span>
                  <button className="btn btn-danger btn-sm" style={{ padding: '2px 7px', fontSize: '0.7rem' }}
                    onClick={() => handleDeleteBudget(st.budget_id)}>✕</button>
                </div>
              </div>
              <BudgetBar percent={st.percent} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>
                  Reste : {fmt(Math.max(0, st.monthly_limit - st.spent))}
                </span>
                <span style={{ fontSize: '0.72rem', color: statusColor(st.percent), fontWeight: 600 }}>
                  {st.percent}%
                </span>
              </div>
            </div>
          ))}

          {/* Budgets with no spending this month */}
          {budgets
            .filter(b => !statuses.find(s => s.category === b.category))
            .map(b => (
              <div key={b.category} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{b.category}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 12,
                      background: 'rgba(16,185,129,0.12)', color: 'var(--green)', border: '1px solid rgba(16,185,129,0.3)' }}>
                      OK
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>
                      {fmt(0)} / {fmt(b.monthly_limit)}
                    </span>
                    <button className="btn btn-danger btn-sm" style={{ padding: '2px 7px', fontSize: '0.7rem' }}
                      onClick={() => handleDeleteBudget(b.id)}>✕</button>
                  </div>
                </div>
                <BudgetBar percent={0} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>Reste : {fmt(b.monthly_limit)}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--green)', fontWeight: 600 }}>0%</span>
                </div>
              </div>
            ))}
        </div>

        {/* Income & savings tracking */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: '0.95rem', color: 'var(--text2)' }}>Revenu & épargne — {MONTHS[month - 1]} {year}</h3>
            <button className="btn btn-secondary btn-sm" onClick={() => setIncomeEditing(v => !v)}>
              {incomeEditing ? '✕' : income ? 'Modifier' : '+ Saisir revenu'}
            </button>
          </div>

          {incomeEditing && (
            <form onSubmit={handleSaveIncome} style={{ marginBottom: 20 }}>
              <div className="form-grid" style={{ marginBottom: 14 }}>
                <div className="form-group">
                  <label>Revenu du mois (€)</label>
                  <input required type="number" step="1" min="0" placeholder="ex: 3000"
                    value={incomeForm.amount}
                    onChange={e => setIncomeForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Taux d'épargne cible (%)</label>
                  <input required type="number" step="1" min="0" max="100" placeholder="30"
                    value={incomeForm.savings_target}
                    onChange={e => setIncomeForm(f => ({ ...f, savings_target: e.target.value }))} />
                </div>
              </div>
              <button className="btn btn-primary" type="submit">Enregistrer</button>
            </form>
          )}

          {!income && !incomeEditing && (
            <div className="empty">Aucun revenu saisi pour ce mois — cliquez sur "+ Saisir revenu"</div>
          )}

          {income && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                <div className="stat-card">
                  <div className="stat-label">Revenu</div>
                  <div className="stat-value">{fmt(incomeAmount)}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Dépenses (catégories suivies)</div>
                  <div className="stat-value" style={{ color: 'var(--red)' }}>{fmt(totalSpent)}</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-label">Épargne estimée</div>
                <div className="stat-value" style={{ color: actualSavings >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {fmt(actualSavings)}
                </div>
                <div className="stat-sub" style={{ color: 'var(--text3)', fontSize: '0.78rem' }}>
                  Taux réel : {actualSavingsRate !== null ? actualSavingsRate.toFixed(1) : '—'}%
                </div>
              </div>

              {/* Savings rate progress */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.82rem' }}>
                  <span style={{ color: 'var(--text2)' }}>Taux d'épargne</span>
                  <span style={{ color: 'var(--text2)', fontWeight: 600 }}>
                    Cible : {savingsTarget}%
                  </span>
                </div>
                <div style={{ background: 'var(--bg3)', borderRadius: 6, height: 10, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(Math.max(actualSavingsRate ?? 0, 0), 100)}%`,
                    background: (actualSavingsRate ?? 0) >= savingsTarget ? 'var(--green)' : 'var(--yellow)',
                    borderRadius: 6,
                    transition: 'width 0.4s ease',
                  }} />
                </div>
                {savingsGap !== null && (
                  <div style={{ marginTop: 6, fontSize: '0.78rem', color: savingsGap >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {savingsGap >= 0
                      ? `✓ Objectif atteint (+${savingsGap.toFixed(1)}%)`
                      : `✗ Écart par rapport à l'objectif : ${savingsGap.toFixed(1)}%`}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
