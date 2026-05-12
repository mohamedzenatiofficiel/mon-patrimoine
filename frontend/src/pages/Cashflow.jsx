import { useEffect, useState, useRef } from 'react'
import { getIncome, addIncome, updateIncome, deleteIncome, getCashflow, getBudgets, upsertBudget, deleteBudget, getBudgetStatus, importPayslip, getExpenses } from '../services/api'
import CashflowSankey from '../components/CashflowSankey'

function fmt(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n ?? 0)
}

const SOURCE_TYPES = [
  { value: 'salary',          label: 'Salaire net',      description: 'Revenu mensuel net' },
  { value: 'compte_courant',  label: 'Compte courant',   description: 'Solde du compte courant' },
  { value: 'livret_a',        label: 'Livret A',         description: 'Épargne mensuelle Livret A' },
  { value: 'ldd',             label: 'LDD',              description: 'Épargne mensuelle LDD' },
]

const TYPE_MAP = Object.fromEntries(SOURCE_TYPES.map(t => [t.value, t]))

const EMPTY_FORM = { label: 'Salaire net', source_type: 'salary', amount: '', balance: '' }

const isSavings = (type) => type === 'livret_a' || type === 'ldd' || type === 'compte_courant'

const CATEGORIES = [
  'Vie quotidienne', 'Investissement mensuel', 'Abonnement', 'Logement',
  'Transport', 'Santé', 'Loisirs', 'Famille', 'Autre',
]

const CAT_COLORS_LIST = [
  '#c084fc', '#fb923c', '#818cf8', '#2dd4bf',
  '#f472b6', '#60a5fa', '#fbbf24', '#4ade80',
  '#f87171', '#38bdf8',
]

function budgetColor(percent) {
  if (percent > 100) return 'var(--red)'
  return 'var(--green)'
}

export default function Cashflow() {
  const now = new Date()
  const [incomes,        setIncomes]        = useState([])
  const [cashflow,       setCashflow]       = useState(null)
  const [form,           setForm]           = useState(EMPTY_FORM)
  const [editingId,      setEditingId]      = useState(null)
  const [loading,        setLoading]        = useState(false)
  const [budgets,        setBudgets]        = useState([])
  const [budgetMap,      setBudgetMap]      = useState({})
  const [budgetForm,     setBudgetForm]     = useState({ category: CATEGORIES[0], monthly_limit: '' })
  const [showBudgetForm,  setShowBudgetForm]  = useState(false)
  const [showIncomeForm,  setShowIncomeForm]  = useState(false)
  const [showSection1,       setShowSection1]       = useState(false)
  const [showSection2,       setShowSection2]       = useState(false)
  const [monthExpenses,      setMonthExpenses]      = useState([])
  const [drillCategory,      setDrillCategory]      = useState(null)
  const [expandedUnplanned,  setExpandedUnplanned]  = useState(new Set())
  const [payslip,         setPayslip]         = useState(null)   // { net_pay, period_label, month, year }
  const [payslipLoading,  setPayslipLoading]  = useState(false)
  const [payslipError,    setPayslipError]    = useState(null)
  const payslipRef = useRef()

  async function loadAll() {
    const [incRes, cfRes, budRes, budStatusRes, expRes] = await Promise.all([
      getIncome(),
      getCashflow(),
      getBudgets().catch(() => ({ data: [] })),
      getBudgetStatus(now.getFullYear(), now.getMonth() + 1).catch(() => ({ data: [] })),
      getExpenses(now.getFullYear(), now.getMonth() + 1).catch(() => ({ data: [] })),
    ])
    setIncomes(incRes.data)
    setCashflow(cfRes.data)
    setBudgets(budRes.data)
    setMonthExpenses(expRes.data)
    const map = {}
    for (const s of budStatusRes.data) map[s.category] = s
    setBudgetMap(map)
  }

  useEffect(() => { loadAll() }, [])

  function startEdit(entry) {
    setEditingId(entry.id)
    setForm({ label: entry.label, source_type: entry.source_type, amount: String(entry.amount), balance: String(entry.balance ?? '') })
    setShowIncomeForm(true)
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowIncomeForm(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.label.trim() || !form.amount) return
    setLoading(true)
    const payload = {
      label: form.label.trim(),
      source_type: form.source_type,
      amount: parseFloat(form.amount),
      balance: isSavings(form.source_type) ? parseFloat(form.balance || 0) : 0,
    }
    try {
      if (editingId) {
        await updateIncome(editingId, payload)
      } else {
        await addIncome(payload)
      }
      cancelEdit()
      await loadAll()
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id) {
    await deleteIncome(id)
    await loadAll()
  }

  async function handlePayslipFile(e) {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''
    setPayslipLoading(true)
    setPayslipError(null)
    setPayslip(null)
    try {
      const res = await importPayslip(file)
      setPayslip(res.data)
    } catch (err) {
      setPayslipError(err?.response?.data?.detail || 'Impossible de lire ce fichier.')
    } finally {
      setPayslipLoading(false)
    }
  }

  async function handlePayslipConfirm() {
    if (!payslip) return
    setPayslipLoading(true)
    try {
      const payload = { label: 'Salaire net', source_type: 'salary', amount: payslip.net_pay, balance: 0 }
      if (salary) {
        await updateIncome(salary.id, payload)
      } else {
        await addIncome(payload)
      }
      setPayslip(null)
      await loadAll()
    } finally {
      setPayslipLoading(false)
    }
  }

  function handleTypeChange(type) {
    const meta = TYPE_MAP[type]
    setForm(f => ({ ...f, source_type: type, label: meta?.label || f.label, balance: isSavings(type) ? f.balance : '' }))
  }

  async function handleAddBudget(e) {
    e.preventDefault()
    await upsertBudget({ category: budgetForm.category, monthly_limit: parseFloat(budgetForm.monthly_limit) })
    setBudgetForm({ category: CATEGORIES[0], monthly_limit: '' })
    setShowBudgetForm(false)
    await loadAll()
  }

  async function handleDeleteBudget(id) {
    if (!confirm('Supprimer ce plafond ?')) return
    await deleteBudget(id)
    await loadAll()
  }

  const salary        = incomes.find(i => i.source_type === 'salary')
  const compteCourant = incomes.find(i => i.source_type === 'compte_courant')
  const livretA       = incomes.find(i => i.source_type === 'livret_a')
  const ldd           = incomes.find(i => i.source_type === 'ldd')
  const spent    = cashflow?.total ?? 0
  const isOver   = salary ? spent > salary.amount : false
  const delta    = salary ? Math.abs(salary.amount - spent) : null

  const comparisonRows = [...budgets]
    .sort((a, b) => b.monthly_limit - a.monthly_limit)
    .map((b, idx) => {
      const status = budgetMap[b.category]
      return {
        category: b.category,
        planned:  b.monthly_limit,
        real:     status?.spent ?? 0,
        color:    CAT_COLORS_LIST[idx % CAT_COLORS_LIST.length],
      }
    })
  const bTotalPlanned  = comparisonRows.reduce((s, r) => s + r.planned, 0)
  const totalRealAll   = cashflow?.total ?? 0
  const totalOverspend = Math.max(0, totalRealAll - bTotalPlanned)
  const hasSavings     = !!(livretA || ldd || compteCourant)

  const plannedSankeyData = salary && budgets.length ? (() => {
    const sorted = [...budgets].sort((a, b) => b.monthly_limit - a.monthly_limit)
    const tp     = sorted.reduce((s, b) => s + b.monthly_limit, 0)
    const nodes  = [{ name: 'Salaire' }, { name: 'Prévu' }]
    const links  = [{ source: 0, target: 1, value: Math.round(tp * 100) / 100 }]
    sorted.forEach((b, i) => {
      nodes.push({ name: b.category })
      links.push({ source: 1, target: 2 + i, value: Math.round(b.monthly_limit * 100) / 100 })
    })
    return { nodes, links, total: Math.round(tp * 100) / 100, salary: salary.amount }
  })() : null

  const hasSankey    = !!(cashflow?.nodes?.length || plannedSankeyData)
  const showSection3 = hasSankey || comparisonRows.length > 0

  const investRow      = comparisonRows.find(r => r.category === 'Investissement mensuel')
  const nonInvestRows  = comparisonRows.filter(r => r.category !== 'Investissement mensuel')
  const nonInvestPlan  = bTotalPlanned - (investRow?.planned ?? 0)
  const nonInvestReal  = totalRealAll  - (investRow?.real   ?? 0)
  const depOverspend   = nonInvestReal - nonInvestPlan
  const investOk       = investRow ? investRow.real >= investRow.planned * 0.95 : null
  const overBudgetRows = nonInvestRows.filter(r => r.real > r.planned)
  const totalSaveable  = overBudgetRows.reduce((s, r) => s + (r.real - r.planned), 0)
  const allGood        = overBudgetRows.length === 0 && investOk !== false

  const remaining = bTotalPlanned - totalRealAll
  const budgetedCats = new Set(budgets.map(b => b.category))
  const unplannedCatMap = {}
  monthExpenses.forEach(e => {
    if (!budgetedCats.has(e.category)) {
      unplannedCatMap[e.category] = (unplannedCatMap[e.category] ?? 0) + e.amount
    }
  })
  const unplannedCategories = Object.entries(unplannedCatMap).sort((a, b) => b[1] - a[1])
  const totalUnplanned = unplannedCategories.reduce((s, [, v]) => s + v, 0)

  const unplannedSubcatMap = {}
  monthExpenses.forEach(e => {
    if (!budgetedCats.has(e.category)) {
      if (!unplannedSubcatMap[e.category]) unplannedSubcatMap[e.category] = {}
      const sub = e.subcategory || '—'
      unplannedSubcatMap[e.category][sub] = (unplannedSubcatMap[e.category][sub] ?? 0) + e.amount
    }
  })
  const sortedCompRows = [...comparisonRows].sort((a, b) => {
    const aIsInvest = a.category === 'Investissement mensuel'
    const bIsInvest = b.category === 'Investissement mensuel'
    const aOver = !aIsInvest && a.real > a.planned
    const bOver = !bIsInvest && b.real > b.planned
    if (aOver && !bOver) return -1
    if (!aOver && bOver) return 1
    if (aOver && bOver) return (b.real - b.planned) - (a.real - a.planned)
    const aPct = a.planned > 0 ? a.real / a.planned : 0
    const bPct = b.planned > 0 ? b.real / b.planned : 0
    return bPct - aPct
  })

  const chartData = comparisonRows.map(r => ({
    name: r.category,
    Prévu: Math.round(r.planned * 100) / 100,
    Réel:  Math.round(r.real    * 100) / 100,
    color: r.color,
    over:  r.real > r.planned,
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="page-header">
        <h1>Budget</h1>
        <p>Gérez vos revenus, vos plafonds et visualisez votre flux mensuel</p>
      </div>

      {/* Summary stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
        {salary ? (
          <div className="stat-card" style={{ borderTop: '2px solid rgba(99,102,241,0.3)' }}>
            <div className="label">Salaire net</div>
            <div className="value" style={{ background: 'linear-gradient(135deg,#6366f1,#6366f199)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              {fmt(salary.amount)}
            </div>
            <div className="sub">Revenu mensuel</div>
          </div>
        ) : (
          <div className="stat-card" style={{ borderTop: '2px solid rgba(99,102,241,0.15)', opacity: 0.6 }}>
            <div className="label">Salaire net</div>
            <div className="value" style={{ color: 'var(--text3)', fontSize: '1rem' }}>Non renseigné</div>
          </div>
        )}

        <div className="stat-card" style={{ borderTop: '2px solid rgba(239,68,68,0.3)' }}>
          <div className="label">Dépenses ce mois</div>
          <div className="value" style={{ background: 'linear-gradient(135deg,#ef4444,#ef444499)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            {fmt(spent)}
          </div>
          <div className="sub">{budgets.length > 0 ? `${budgets.length} catégorie(s) avec plafond` : 'Mois en cours'}</div>
        </div>

        <div className="stat-card" style={{ borderTop: `2px solid ${isOver ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}` }}>
          <div className="label">{isOver ? 'Dépassement' : 'Reste à dépenser'}</div>
          <div className="value" style={{ color: isOver ? '#ef4444' : '#10b981' }}>
            {delta !== null ? fmt(delta) : '—'}
          </div>
          <div className="sub">
            {salary
              ? isOver
                ? `${fmt(delta)} de plus que votre salaire`
                : `${fmt(delta)} restant sur ${fmt(salary.amount)}`
              : 'Ajoutez votre salaire'}
          </div>
        </div>

      </div>

      {/* ── SECTION 1 : Revenus & Épargne ── */}
      <div className="card">
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: showSection1 && (payslip || payslipError) ? 12 : showSection1 ? 16 : 0 }}
          onClick={() => setShowSection1(v => !v)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text3)', transform: showSection1 ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block' }}>▶</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text2)' }}>Revenus & Épargne</h3>
              {!showSection1 && <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: 'var(--text3)' }}>{incomes.length} entrée{incomes.length !== 1 ? 's' : ''}</p>}
            </div>
          </div>
          {showSection1 && (
            <div style={{ display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
              <input ref={payslipRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handlePayslipFile} />
              <button
                className="btn btn-sm btn-secondary"
                disabled={payslipLoading}
                onClick={() => payslipRef.current?.click()}
                title="Importer une fiche de paie PDF pour mettre à jour le salaire net"
              >
                {payslipLoading ? '⟳ Lecture...' : '📄 Fiche de paie'}
              </button>
              <button className="btn btn-sm btn-secondary" onClick={() => { setShowIncomeForm(v => !v); if (editingId) cancelEdit() }}>
                {showIncomeForm ? '✕ Fermer' : '+ Ajouter'}
              </button>
            </div>
          )}
        </div>

        {!showSection1 && <input ref={payslipRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handlePayslipFile} />}
        {showSection1 && (
          <>

        {/* Payslip preview banner */}
        {payslipError && (
          <div style={{
            marginBottom: 16, padding: '10px 14px', borderRadius: 10,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: '0.85rem', color: '#ef4444' }}>{payslipError}</span>
            <button className="btn btn-sm btn-secondary" onClick={() => setPayslipError(null)}>✕</button>
          </div>
        )}

        {payslip && (
          <div style={{
            marginBottom: 16, padding: '14px 16px', borderRadius: 10,
            background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text3)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Fiche de paie détectée{payslip.period_label ? ` · ${payslip.period_label}` : ''}
                </div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--accent)' }}>
                  {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(payslip.net_pay)}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text3)', marginTop: 2 }}>
                  Net à payer au salarié
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={payslipLoading}
                  onClick={handlePayslipConfirm}
                >
                  {payslipLoading ? '...' : salary ? '↑ Mettre à jour le salaire' : '+ Enregistrer le salaire'}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setPayslip(null)}>Ignorer</button>
              </div>
            </div>
          </div>
        )}

        {incomes.length === 0 && !showIncomeForm && (
          <p style={{ color: 'var(--text3)', marginBottom: 0, fontSize: '0.875rem' }}>
            Ajoutez votre salaire et vos comptes d'épargne pour visualiser votre cashflow.
          </p>
        )}

        {incomes.length > 0 && (
          <div className="table-wrap" style={{ marginBottom: showIncomeForm ? 20 : 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Libellé</th>
                  <th style={{ textAlign: 'right' }}>Versement / mois</th>
                  <th style={{ textAlign: 'right' }}>Solde actuel</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {incomes.map(entry => (
                  <tr key={entry.id}>
                    <td style={{ color: 'var(--text3)', fontSize: '0.8rem' }}>
                      {TYPE_MAP[entry.source_type]?.label ?? entry.source_type}
                    </td>
                    <td style={{ fontWeight: 500 }}>{entry.label}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(entry.amount)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text2)' }}>
                      {isSavings(entry.source_type) ? fmt(entry.balance ?? 0) : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-sm btn-secondary" style={{ marginRight: 6 }} onClick={() => startEdit(entry)}>✏️</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(entry.id)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showIncomeForm && (
          <form onSubmit={handleSubmit}>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
              {editingId ? 'Modifier' : 'Nouveau revenu'}
            </div>
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <div className="form-group">
                <label>Type</label>
                <select value={form.source_type} onChange={e => handleTypeChange(e.target.value)}>
                  {SOURCE_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Libellé</label>
                <input
                  placeholder="Ex: Salaire net, Livret A..."
                  value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  required
                />
              </div>
              <div className="form-group">
                <label>Versement mensuel (€)</label>
                <input
                  type="number" min="0" step="0.01" placeholder="Ex: 2500"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  required
                />
              </div>
              {isSavings(form.source_type) && (
                <div className="form-group">
                  <label>Solde actuel (€)</label>
                  <input
                    type="number" min="0" step="0.01" placeholder="Ex: 20000"
                    value={form.balance}
                    onChange={e => setForm(f => ({ ...f, balance: e.target.value }))}
                  />
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? '...' : editingId ? 'Enregistrer' : '+ Ajouter'}
              </button>
              {editingId && (
                <button type="button" className="btn btn-secondary" onClick={cancelEdit}>Annuler</button>
              )}
            </div>
          </form>
        )}
          </>
        )}
      </div>

      {/* ── SECTION 2 : Plafonds budgétaires ── */}
      <div className="card">
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: showSection2 && (showBudgetForm || budgets.length > 0) ? 16 : 0 }}
          onClick={() => setShowSection2(v => !v)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text3)', transform: showSection2 ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block' }}>▶</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text2)' }}>Plafonds budgétaires</h3>
              {!showSection2 && (
                <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: 'var(--text3)' }}>
                  {budgets.length > 0 ? `${budgets.length} catégorie${budgets.length > 1 ? 's' : ''} avec plafond` : 'Fixez des limites de dépenses par catégorie'}
                </p>
              )}
            </div>
          </div>
          {showSection2 && (
            <button className="btn btn-sm btn-secondary" onClick={e => { e.stopPropagation(); setShowBudgetForm(v => !v) }}>
              {showBudgetForm ? '✕ Fermer' : '+ Ajouter un plafond'}
            </button>
          )}
        </div>

        {showSection2 && (
          <>

        {showBudgetForm && (
          <form onSubmit={handleAddBudget} style={{ marginBottom: budgets.length > 0 ? 20 : 0, paddingBottom: budgets.length > 0 ? 20 : 0, borderBottom: budgets.length > 0 ? '1px solid var(--border)' : 'none' }}>
            <div className="form-grid" style={{ marginBottom: 12 }}>
              <div className="form-group">
                <label>Catégorie</label>
                <select value={budgetForm.category} onChange={e => setBudgetForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Plafond mensuel (€)</label>
                <input
                  required type="number" min="1" step="0.01" placeholder="ex: 500"
                  value={budgetForm.monthly_limit}
                  onChange={e => setBudgetForm(f => ({ ...f, monthly_limit: e.target.value }))}
                />
              </div>
            </div>
            <button type="submit" className="btn btn-primary">Enregistrer</button>
          </form>
        )}

        {budgets.length === 0 && !showBudgetForm && (
          <p style={{ color: 'var(--text3)', fontSize: '0.875rem', margin: 0 }}>
            Aucun plafond défini — les dépenses s'affichent sans limite.
          </p>
        )}

        {budgets.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {budgets.map(b => {
              const bst = budgetMap[b.category]
              const pct = bst?.percent ?? 0
              const color = budgetColor(pct)
              return (
                <div key={b.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{b.category}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {bst && (
                        <span style={{ fontSize: '0.78rem', color: 'var(--text3)' }}>
                          {fmt(bst.spent)} / {fmt(b.monthly_limit)}
                        </span>
                      )}
                      <span style={{
                        fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                        background: `${color}22`, color, border: `1px solid ${color}55`,
                      }}>
                        {pct}%
                      </span>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteBudget(b.id)}>✕</button>
                    </div>
                  </div>
                  <div style={{ background: 'var(--bg3)', borderRadius: 99, height: 6, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${Math.min(pct, 100)}%`,
                      background: color, borderRadius: 99, transition: 'width 0.5s ease',
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
          </>
        )}
      </div>

      {/* ── SECTION 3 : Flux de trésorerie ── */}
      {showSection3 && (
        <div className="card">
          {/* Header */}
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text2)' }}>Flux de trésorerie</h3>
            <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: 'var(--text3)' }}>Réel et prévu côte à côte</p>
          </div>

          {/* Side-by-side Sankeys */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            {/* Réel */}
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                Réel — dépenses du mois
              </div>
              {cashflow?.nodes?.length > 0
                ? <CashflowSankey data={cashflow} height={480} />
                : <p style={{ color: 'var(--text3)', fontSize: '0.84rem', margin: 0 }}>Aucune dépense enregistrée ce mois.</p>
              }
            </div>
            {/* Prévu */}
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                Prévu — budget planifié
              </div>
              {plannedSankeyData
                ? <CashflowSankey data={plannedSankeyData} height={480} />
                : <p style={{ color: 'var(--text3)', fontSize: '0.84rem', margin: 0 }}>Ajoutez un salaire et des plafonds pour visualiser le budget prévu.</p>
              }
            </div>
          </div>

          {/* ── Analyse budgétaire ── */}
          {comparisonRows.length > 0 && (
            <div style={{ marginTop: hasSankey ? 32 : 0 }}>
              <div style={{ borderTop: '1px solid var(--border)', margin: '0 0 22px' }} />
              <div style={{ fontSize: '0.69rem', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
                Analyse budgétaire · {now.toLocaleString('fr-FR', { month: 'long', year: 'numeric' })}
              </div>

              {/* ── 1. 5 metric cards ── */}
              {(() => {
                const salaryAmt      = salary?.amount ?? null
                const diff1          = salaryAmt !== null ? salaryAmt - bTotalPlanned : null   // salaire - planifié
                const card = (label, value, sub, positive) => {
                  const isPos = value >= 0
                  const color = positive === null ? 'var(--text)' : (isPos === positive ? '#10b981' : '#ef4444')
                  const bg    = positive === null ? 'var(--bg3)' : (isPos === positive ? 'rgba(16,185,129,0.07)' : 'rgba(239,68,68,0.07)')
                  const bdr   = positive === null ? 'var(--border)' : (isPos === positive ? 'rgba(16,185,129,0.22)' : 'rgba(239,68,68,0.22)')
                  const sign  = value > 0 ? '+' : value < 0 ? '−' : ''
                  return (
                    <div style={{ padding: '12px 14px', borderRadius: 10, background: bg, border: `1px solid ${bdr}` }}>
                      <div style={{ fontSize: '0.63rem', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>{label}</div>
                      <div style={{ fontWeight: 700, fontSize: '1rem', color }}>{sign}{fmt(Math.abs(value))}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text3)', marginTop: 3 }}>{sub}</div>
                    </div>
                  )
                }
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: diff1 !== null ? 'repeat(2, 1fr)' : '1fr', gap: 10, marginBottom: 22 }}>
                    {card('Budget prévu planifié', bTotalPlanned, 'Somme des plafonds', null)}
                    {diff1 !== null && card('Salaire − Planifié', diff1, diff1 >= 0 ? 'Non alloué' : 'Plafonds > salaire', true)}
                  </div>
                )
              })()}

              {/* ── 2. Statut par catégorie ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: unplannedCategories.length > 0 ? 20 : 0 }}>
                {sortedCompRows.map(row => {
                  const pct = row.planned > 0 ? (row.real / row.planned) * 100 : 0
                  const isInvest = row.category === 'Investissement mensuel'
                  const over = !isInvest && row.real > row.planned
                  const reste = row.planned - row.real
                  const hasSpending = row.real > 0
                  return (
                    <div key={row.category} style={{
                      padding: '11px 14px', borderRadius: 10,
                      background: over ? 'rgba(239,68,68,0.04)' : !hasSpending ? 'var(--bg3)' : 'rgba(16,185,129,0.03)',
                      border: `1px solid ${over ? 'rgba(239,68,68,0.18)' : !hasSpending ? 'var(--border)' : 'rgba(16,185,129,0.14)'}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: hasSpending ? 8 : 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                          <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{row.category}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text3)' }}>
                            {hasSpending ? `${fmt(row.real)} / ${fmt(row.planned)}` : `Plafond : ${fmt(row.planned)}`}
                          </span>
                          <span style={{
                            fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: 99,
                            background: over ? 'rgba(239,68,68,0.1)' : !hasSpending ? 'var(--bg3)' : 'rgba(16,185,129,0.1)',
                            color: over ? '#ef4444' : !hasSpending ? 'var(--text3)' : '#10b981',
                            border: `1px solid ${over ? 'rgba(239,68,68,0.25)' : !hasSpending ? 'var(--border)' : 'rgba(16,185,129,0.25)'}`,
                            minWidth: 110, textAlign: 'center',
                          }}>
                            {over
                              ? `▲ +${fmt(Math.abs(reste))}`
                              : !hasSpending
                              ? '— Non commencé'
                              : isInvest
                              ? (row.real >= row.planned * 0.95 ? '✓ Objectif atteint' : `⚠ ${fmt(Math.abs(reste))} restant`)
                              : `✓ Reste ${fmt(reste)}`
                            }
                          </span>
                        </div>
                      </div>
                      {hasSpending && (
                        <div style={{ height: 5, background: `${row.color}22`, borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', width: `${Math.min(pct, 100)}%`,
                            background: over ? '#ef4444' : row.color,
                            borderRadius: 99, transition: 'width 0.4s',
                          }} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* ── 4. Dépenses hors budget ── */}
              {unplannedCategories.length > 0 && (
                <div style={{
                  padding: '14px 16px', borderRadius: 12,
                  background: 'rgba(245,158,11,0.05)',
                  border: '1px solid rgba(245,158,11,0.2)',
                }}>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#f59e0b' }}>Dépenses hors budget</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text3)', marginTop: 3 }}>
                      Ces catégories ont des dépenses sans plafond planifié · Total non planifié : {fmt(totalUnplanned)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {unplannedCategories.map(([cat, amount]) => {
                      const catColor  = CAT_COLORS_LIST[CATEGORIES.indexOf(cat) % CAT_COLORS_LIST.length] ?? '#94a3b8'
                      const subcats   = Object.entries(unplannedSubcatMap[cat] ?? {}).sort((a, b) => b[1] - a[1])
                      const isOpen    = expandedUnplanned.has(cat)
                      const hasSubcats = subcats.length > 1 || (subcats.length === 1 && subcats[0][0] !== '—')
                      return (
                        <div key={cat} style={{ borderRadius: 8, border: '1px solid rgba(245,158,11,0.12)', overflow: 'hidden' }}>
                          <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '9px 12px',
                            background: isOpen ? 'rgba(245,158,11,0.08)' : 'rgba(245,158,11,0.04)',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {hasSubcats && (
                                <button
                                  onClick={() => setExpandedUnplanned(prev => {
                                    const next = new Set(prev)
                                    next.has(cat) ? next.delete(cat) : next.add(cat)
                                    return next
                                  })}
                                  style={{
                                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                                    fontSize: '0.6rem', color: 'var(--text3)',
                                    transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                                    transition: 'transform 0.2s', display: 'inline-block', lineHeight: 1,
                                  }}
                                >▶</button>
                              )}
                              <div style={{ width: 9, height: 9, borderRadius: '50%', background: catColor, flexShrink: 0 }} />
                              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{cat}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: '0.84rem', fontWeight: 700 }}>{fmt(amount)}</span>
                              <span style={{
                                fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                                background: 'rgba(245,158,11,0.12)', color: '#f59e0b',
                                border: '1px solid rgba(245,158,11,0.25)',
                              }}>! Sans plafond</span>
                            </div>
                          </div>
                          {isOpen && hasSubcats && (
                            <div style={{ borderTop: '1px solid rgba(245,158,11,0.12)', padding: '6px 12px 6px 32px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {subcats.map(([sub, subAmt]) => (
                                <div key={sub} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', borderRadius: 6, background: 'rgba(245,158,11,0.03)' }}>
                                  <span style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>{sub}</span>
                                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)' }}>{fmt(subAmt)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
