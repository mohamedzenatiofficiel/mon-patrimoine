import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { getExpenses, addExpense, deleteExpense, updateExpense, getBudgetStatus } from '../services/api'

function fmt(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n ?? 0)
}

const CATEGORY_TREE = {
  'Vie quotidienne': ['Courses', 'Restaurants', 'Livraison repas', 'Café / Snacks'],
  'Investissement mensuel': ['Crypto', 'PEA', 'Assurance-vie', 'Livret A / LEP', 'SCPI', 'Actions'],
  'Abonnement': ['Sport / Salle', 'Streaming', 'Téléphone', 'Internet', 'Autres abonnements'],
  'Logement': ['Loyer', 'Charges', 'Assurance habitation', 'Travaux'],
  'Transport': ['Carburant', 'Transport en commun', 'Taxi / VTC', 'Parking', 'Entretien véhicule'],
  'Santé': ['Médecin', 'Pharmacie', 'Mutuelle', 'Optique'],
  'Loisirs': ['Voyage', 'Shopping', 'Cinéma / Sorties', 'Jeux vidéo', 'Livres / Culture'],
  'Famille': ['Enfants', 'Cadeaux', 'Aide familiale'],
  'Autre': ['Autre'],
}

const CATEGORIES = Object.keys(CATEGORY_TREE)

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

const WEEK_DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

const DEFAULT_CATEGORY = CATEGORIES[0]
const DEFAULT_SUBCATEGORY = CATEGORY_TREE[DEFAULT_CATEGORY][0]

const EMPTY_FORM = {
  category: DEFAULT_CATEGORY,
  subcategory: DEFAULT_SUBCATEGORY,
  amount: '',
  date: new Date().toISOString().split('T')[0],
  description: ''
}

function buildCalendarDays(year, month) {
  const firstDay = new Date(year, month - 1, 1)
  const daysInMonth = new Date(year, month, 0).getDate()
  // Convert JS day (0=Sun) to Monday-first (0=Mon, 6=Sun)
  const firstDow = (firstDay.getDay() + 6) % 7
  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function ExpenseCalendar({ year, month, expenses, onDelete }) {
  const [selectedDay, setSelectedDay] = useState(null)

  // Reset selection when month/year changes
  useEffect(() => { setSelectedDay(null) }, [year, month])

  const now = new Date()
  const isCurrentMonth = now.getFullYear() === year && (now.getMonth() + 1) === month
  const today = now.getDate()

  // Group expenses by day number (parse date string directly to avoid timezone shifts)
  const byDay = {}
  expenses.forEach(exp => {
    const dayStr = (exp.date || '').split('T')[0]
    const day = parseInt(dayStr.split('-')[2], 10)
    if (!isNaN(day)) {
      if (!byDay[day]) byDay[day] = []
      byDay[day].push(exp)
    }
  })

  const cells = buildCalendarDays(year, month)

  function handleDayClick(day) {
    if (!byDay[day]) return
    setSelectedDay(prev => (prev === day ? null : day))
  }

  const selectedExpenses = selectedDay ? (byDay[selectedDay] || []) : []

  return (
    <>
      <div className="card" style={{ marginBottom: 20 }}>
        {/* Calendar grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {/* Week day headers */}
          {WEEK_DAYS.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text3)', padding: '4px 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {d}
            </div>
          ))}

          {/* Day cells */}
          {cells.map((day, idx) => {
            if (day === null) {
              return <div key={idx} style={{ minHeight: 62, borderRadius: 8, background: 'rgba(255,255,255,0.02)' }} />
            }

            const dayExps = byDay[day]
            const hasExps = Boolean(dayExps && dayExps.length > 0)
            const isToday = isCurrentMonth && day === today
            const isSelected = selectedDay === day

            const dayTotal = hasExps ? dayExps.reduce((s, e) => s + e.amount, 0) : 0
            const count = hasExps ? dayExps.length : 0

            let cellStyle = {
              minHeight: 62,
              borderRadius: 8,
              padding: '6px 7px',
              position: 'relative',
              cursor: hasExps ? 'pointer' : 'default',
              border: '1px solid transparent',
              transition: 'all 0.15s',
            }

            if (isSelected) {
              cellStyle.background = 'rgba(139,92,246,0.25)'
              cellStyle.border = '1px solid rgba(139,92,246,0.7)'
            } else if (hasExps) {
              cellStyle.background = 'rgba(99,102,241,0.12)'
              cellStyle.border = '1px solid rgba(139,92,246,0.25)'
            } else {
              cellStyle.background = 'rgba(255,255,255,0.03)'
            }

            if (isToday) {
              cellStyle.outline = '2px solid var(--accent)'
              cellStyle.outlineOffset = '-2px'
            }

            return (
              <div key={idx} style={cellStyle} onClick={() => handleDayClick(day)}>
                {/* Day number */}
                <span style={{
                  fontSize: '0.8rem',
                  fontWeight: isToday ? 700 : 400,
                  color: isToday ? 'var(--accent)' : 'var(--text2)',
                }}>
                  {day}
                </span>

                {hasExps && (
                  <>
                    {/* Total in top-right */}
                    <span style={{
                      position: 'absolute',
                      top: 5,
                      right: 6,
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      color: 'var(--accent2)',
                    }}>
                      {Math.round(dayTotal)} €
                    </span>
                    {/* Transaction count at bottom */}
                    <span style={{
                      position: 'absolute',
                      bottom: 5,
                      left: 7,
                      fontSize: '0.65rem',
                      color: 'var(--text3)',
                    }}>
                      {count} dépense{count > 1 ? 's' : ''}
                    </span>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Detail panel */}
      {selectedDay && selectedExpenses.length > 0 && (
        <div className="card" style={{ marginBottom: 20, borderColor: 'rgba(139,92,246,0.35)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: '0.9rem', color: 'var(--text2)' }}>
              Dépenses du {selectedDay} {MONTHS[month - 1]} {year}
            </h3>
            <button className="btn btn-sm btn-secondary" onClick={() => setSelectedDay(null)}>✕</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {selectedExpenses.map(exp => (
              <div key={exp.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--bg3)', borderRadius: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{exp.category}</span>
                  {exp.subcategory && (
                    <span style={{ color: 'var(--accent)', fontSize: '0.78rem', marginLeft: 6 }}>› {exp.subcategory}</span>
                  )}
                  {exp.description && (
                    <span style={{ color: 'var(--text3)', fontSize: '0.8rem', marginLeft: 8 }}>{exp.description}</span>
                  )}
                </div>
                <span style={{ fontWeight: 700, color: 'var(--accent2)', flexShrink: 0 }}>{fmt(exp.amount)}</span>
                <button className="btn btn-danger btn-sm" onClick={() => onDelete(exp.id)}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

function budgetColor(percent) {
  if (percent === undefined) return undefined
  if (percent >= 100) return 'var(--red)'
  if (percent >= 80)  return 'var(--yellow)'
  return 'var(--green)'
}

export default function Expenses() {
  const now = new Date()
  const [year,      setYear]      = useState(now.getFullYear())
  const [month,     setMonth]     = useState(now.getMonth() + 1)
  const [expenses,  setExpenses]  = useState([])
  const [budgetMap, setBudgetMap] = useState({})
  const [form,      setForm]      = useState(EMPTY_FORM)
  const [showForm,  setShowForm]  = useState(false)
  const [loading,   setLoading]   = useState(false)

  useEffect(() => { fetchAll() }, [year, month])

  async function fetchAll() {
    const [expRes, budRes] = await Promise.all([
      getExpenses(year, month),
      getBudgetStatus(year, month).catch(() => ({ data: [] })),
    ])
    setExpenses(expRes.data)
    const map = {}
    for (const s of budRes.data) map[s.category] = s
    setBudgetMap(map)
  }

  async function fetchExpenses() {
    const res = await getExpenses(year, month)
    setExpenses(res.data)
  }

  async function handleAdd(e) {
    e.preventDefault()
    setLoading(true)
    try {
      await addExpense({ ...form, amount: parseFloat(form.amount) })
      setForm(EMPTY_FORM)
      setShowForm(false)
      await fetchAll()
    } finally { setLoading(false) }
  }

  async function handleDelete(id) {
    if (!confirm('Supprimer cette dépense ?')) return
    await deleteExpense(id)
    await fetchAll()
  }

  function handleCategoryChange(cat) {
    setForm(f => ({ ...f, category: cat, subcategory: CATEGORY_TREE[cat]?.[0] || '' }))
  }

  const total = expenses.reduce((s, e) => s + e.amount, 0)

  // Group by main category for chart
  const byCategory = CATEGORIES.map(cat => ({
    name: cat,
    montant: expenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0)
  })).filter(c => c.montant > 0)

  // Group by category then subcategory for summary
  const summaryTree = {}
  expenses.forEach(exp => {
    if (!summaryTree[exp.category]) summaryTree[exp.category] = {}
    const sub = exp.subcategory || '—'
    summaryTree[exp.category][sub] = (summaryTree[exp.category][sub] || 0) + exp.amount
  })

  const subcats = CATEGORY_TREE[form.category] || []

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Dépenses</h1>
          <p>Suivi mensuel de tes dépenses</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(v => !v)}>
          {showForm ? '✕ Fermer' : '+ Ajouter'}
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
        <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: '1.1rem' }}>Total : {fmt(total)}</span>
      </div>

      {/* Calendar */}
      <ExpenseCalendar year={year} month={month} expenses={expenses} onDelete={handleDelete} />

      {/* Add form */}
      {showForm && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16, fontSize: '0.95rem' }}>Nouvelle dépense</h3>
          <form onSubmit={handleAdd}>
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <div className="form-group">
                <label>Catégorie</label>
                <select value={form.category} onChange={e => handleCategoryChange(e.target.value)}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Sous-catégorie</label>
                <select value={form.subcategory} onChange={e => setForm(f => ({ ...f, subcategory: e.target.value }))}>
                  {subcats.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Montant (€)</label>
                <input required type="number" step="0.01" min="0" placeholder="ex: 150.00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Date</label>
                <input required type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Description (optionnel)</label>
                <input placeholder="ex: Courses Carrefour" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Ajout...' : '+ Ajouter la dépense'}
            </button>
          </form>
        </div>
      )}

      <div className="grid-2">
        {/* Chart by main category */}
        <div className="card">
          <h3 style={{ marginBottom: 16, fontSize: '0.95rem', color: 'var(--text2)' }}>Par catégorie</h3>
          {byCategory.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byCategory} margin={{ top: 0, right: 0, bottom: 40, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fill: 'var(--text3)', fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
                <YAxis tick={{ fill: 'var(--text3)', fontSize: 11 }} tickFormatter={v => `${v}€`} />
                <Tooltip formatter={v => fmt(v)} contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8 }} />
                <Bar dataKey="montant" fill="var(--accent)" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty">Aucune dépense ce mois</div>
          )}
        </div>

        {/* Hierarchical summary by category > subcategory */}
        <div className="card">
          <h3 style={{ marginBottom: 16, fontSize: '0.95rem', color: 'var(--text2)' }}>Résumé</h3>
          {Object.keys(summaryTree).length === 0 ? (
            <div className="empty">Aucune dépense ce mois</div>
          ) : (
            Object.entries(summaryTree).map(([cat, subs]) => {
              const catTotal = Object.values(subs).reduce((s, v) => s + v, 0)
              const bst = budgetMap[cat]
              const color = bst ? budgetColor(bst.percent) : undefined
              return (
                <div key={cat} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.875rem', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600 }}>{cat}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {bst && (
                        <span style={{
                          fontSize: '0.7rem', fontWeight: 700, padding: '1px 7px', borderRadius: 10,
                          background: `${color}22`, color, border: `1px solid ${color}55`,
                        }}>
                          {bst.percent}% ({fmt(bst.monthly_limit)})
                        </span>
                      )}
                      <span style={{ fontWeight: 700, color: color || 'inherit' }}>{fmt(catTotal)}</span>
                    </div>
                  </div>
                  {bst && (
                    <div style={{ background: 'var(--bg3)', borderRadius: 4, height: 4, overflow: 'hidden', margin: '4px 0 6px' }}>
                      <div style={{
                        height: '100%', width: `${Math.min(bst.percent, 100)}%`,
                        background: color, borderRadius: 4, transition: 'width 0.4s',
                      }} />
                    </div>
                  )}
                  {Object.entries(subs).map(([sub, amount]) => (
                    <div key={sub} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0 4px 12px', fontSize: '0.82rem' }}>
                      <span className="muted">› {sub}</span>
                      <span style={{ color: 'var(--text2)' }}>{fmt(amount)}</span>
                    </div>
                  ))}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Expense list */}
      <div className="card" style={{ marginTop: 20 }}>
        <h3 style={{ marginBottom: 16, fontSize: '0.95rem', color: 'var(--text2)' }}>Détail des dépenses — {MONTHS[month - 1]} {year}</h3>
        {expenses.length === 0 ? (
          <div className="empty">Aucune dépense enregistrée pour cette période</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Catégorie</th>
                  <th>Sous-catégorie</th>
                  <th>Description</th>
                  <th>Montant</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {expenses.map(exp => (
                  <tr key={exp.id}>
                    <td className="muted">{new Date(exp.date).toLocaleDateString('fr-FR')}</td>
                    <td>{exp.category}</td>
                    <td className="muted">{exp.subcategory || '—'}</td>
                    <td className="muted">{exp.description || '—'}</td>
                    <td style={{ fontWeight: 600 }}>{fmt(exp.amount)}</td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(exp.id)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
