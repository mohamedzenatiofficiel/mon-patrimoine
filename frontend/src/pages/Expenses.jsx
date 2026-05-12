import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { getExpenses, getRecurringExpenses, addExpense, deleteExpense, deleteAllExpenses, getBudgetStatus } from '../services/api'
import ImportModal from '../components/ImportModal'

function fmt(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n ?? 0)
}

const CATEGORY_TREE = {
  'Vie quotidienne': ['Courses', 'Restaurants', 'Livraison repas', 'Café / Snacks', 'Retrait'],
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

const CAT_COLORS_LIST = [
  '#c084fc', '#fb923c', '#818cf8', '#2dd4bf',
  '#f472b6', '#60a5fa', '#fbbf24', '#4ade80',
  '#f87171', '#38bdf8',
]
const CAT_COLOR_MAP = Object.fromEntries(CATEGORIES.map((c, i) => [c, CAT_COLORS_LIST[i % CAT_COLORS_LIST.length]]))

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

const WEEK_DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

const DEFAULT_CATEGORY = CATEGORIES[0]
const DEFAULT_SUBCATEGORY = CATEGORY_TREE[DEFAULT_CATEGORY][0]

const EMPTY_FORM = {
  category: DEFAULT_CATEGORY,
  subcategory: DEFAULT_SUBCATEGORY,
  amount: '',
  date: new Date().toISOString().split('T')[0],
  description: '',
  is_recurring: false,
  recurring_day: new Date().getDate(),
}

function buildCalendarDays(year, month) {
  const firstDay = new Date(year, month - 1, 1)
  const daysInMonth = new Date(year, month, 0).getDate()
  const firstDow = (firstDay.getDay() + 6) % 7
  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function ExpenseCalendar({ year, month, expenses, onDelete }) {
  const [selectedDay, setSelectedDay] = useState(null)

  useEffect(() => { setSelectedDay(null) }, [year, month])

  const now = new Date()
  const isCurrentMonth = now.getFullYear() === year && (now.getMonth() + 1) === month
  const today = now.getDate()

  const byDay = {}
  expenses.forEach(exp => {
    let day
    if (exp.is_recurring && exp.recurring_day) {
      day = exp.recurring_day
    } else {
      const dayStr = (exp.date || '').split('T')[0]
      day = parseInt(dayStr.split('-')[2], 10)
    }
    if (!isNaN(day) && day >= 1 && day <= 31) {
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 14, marginBottom: 12 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: 'var(--text3)' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(99,102,241,0.5)', display: 'inline-block' }} />
            Dépense
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: '#f59e0b' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(245,158,11,0.6)', display: 'inline-block' }} />
            Prélèvement
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {WEEK_DAYS.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text3)', padding: '4px 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {d}
            </div>
          ))}

          {(() => {
            const maxDay = Math.max(...Object.keys(byDay).map(Number), 1)
            const maxTotal = Math.max(...Object.keys(byDay).map(d => byDay[d].reduce((s, e) => s + e.amount, 0)), 1)
            return cells.map((day, idx) => {
              if (day === null) {
                return <div key={idx} style={{ minHeight: 80, borderRadius: 8, background: 'rgba(255,255,255,0.02)' }} />
              }

              const dayExps = byDay[day]
              const hasExps = Boolean(dayExps && dayExps.length > 0)
              const isToday = isCurrentMonth && day === today
              const isSelected = selectedDay === day
              const dayTotal = hasExps ? dayExps.reduce((s, e) => s + e.amount, 0) : 0
              const regularCount  = hasExps ? dayExps.filter(e => !e.is_recurring).length : 0
              const recurringCount = hasExps ? dayExps.filter(e => e.is_recurring).length : 0
              const intensity = hasExps ? Math.min(dayTotal / maxTotal, 1) : 0

              let bg, border
              if (isSelected) {
                bg = 'rgba(139,92,246,0.28)'
                border = '1.5px solid rgba(139,92,246,0.75)'
              } else if (hasExps) {
                const alpha = (0.06 + intensity * 0.26).toFixed(2)
                bg = `rgba(99,102,241,${alpha})`
                border = `1px solid rgba(139,92,246,${(0.12 + intensity * 0.3).toFixed(2)})`
              } else {
                bg = 'rgba(255,255,255,0.025)'
                border = '1px solid transparent'
              }

              return (
                <div key={idx} style={{
                  minHeight: 80, borderRadius: 8, padding: '7px 8px', position: 'relative',
                  cursor: hasExps ? 'pointer' : 'default', border, background: bg, transition: 'all 0.15s',
                  outline: isToday ? '2px solid var(--accent)' : 'none', outlineOffset: '-2px',
                }} onClick={() => handleDayClick(day)}>
                  <span style={{ fontSize: '0.82rem', fontWeight: isToday ? 700 : 500, color: isToday ? 'var(--accent)' : hasExps ? 'var(--text)' : 'var(--text3)' }}>
                    {day}
                  </span>
                  {hasExps && (
                    <>
                      <div style={{ position: 'absolute', bottom: 7, left: 8, right: 8 }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>
                          {dayTotal >= 1000 ? `${(dayTotal/1000).toFixed(1)}k` : Math.round(dayTotal)} €
                        </div>
                        <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
                          {regularCount > 0 && (
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(139,92,246,0.8)', display: 'inline-block', flexShrink: 0 }} title={`${regularCount} dép.`} />
                          )}
                          {recurringCount > 0 && (
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', display: 'inline-block', flexShrink: 0 }} title={`${recurringCount} prél.`} />
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )
            })
          })()}
        </div>
      </div>

      {selectedDay && selectedExpenses.length > 0 && (
        <div className="card" style={{ marginBottom: 20, borderColor: 'rgba(139,92,246,0.35)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: '0.9rem', color: 'var(--text2)' }}>
              Dépenses du {selectedDay} {MONTHS[month - 1]} {year}
            </h3>
            <button className="btn btn-sm btn-secondary" onClick={() => setSelectedDay(null)}>✕</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {selectedExpenses.map((exp, idx) => (
              <div key={exp.id ?? `v-${idx}`} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                background: exp.is_recurring ? 'rgba(245,158,11,0.08)' : 'var(--bg3)',
                borderRadius: 10,
                border: exp.is_recurring ? '1px solid rgba(245,158,11,0.25)' : '1px solid transparent',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{exp.category}</span>
                    {exp.subcategory && (
                      <span style={{ color: 'var(--accent)', fontSize: '0.78rem' }}>› {exp.subcategory}</span>
                    )}
                    {exp.is_recurring && (
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, background: 'rgba(245,158,11,0.2)', color: '#f59e0b', borderRadius: 4, padding: '1px 6px' }}>
                        prélèvement
                      </span>
                    )}
                  </div>
                  {exp.description && (
                    <span style={{ color: 'var(--text3)', fontSize: '0.8rem' }}>{exp.description}</span>
                  )}
                </div>
                <span style={{ fontWeight: 700, color: 'var(--accent2)', flexShrink: 0 }}>{fmt(exp.amount)}</span>
                {!exp.is_virtual && (
                  <button className="btn btn-danger btn-sm" onClick={() => onDelete(exp.id)}>✕</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

function CollapsibleExpenses({ expenses, onDelete }) {
  const [openCats, setOpenCats] = useState(new Set())
  const [openSubs, setOpenSubs] = useState(new Set())

  // Build category → subcategory → [expenses] tree
  const tree = {}
  ;[...expenses].sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(exp => {
    const cat = exp.category || 'Autre'
    const sub = exp.subcategory || '—'
    if (!tree[cat]) tree[cat] = {}
    if (!tree[cat][sub]) tree[cat][sub] = []
    tree[cat][sub].push(exp)
  })

  // Sort categories by total desc
  const sortedCats = Object.entries(tree).sort(
    (a, b) => Object.values(b[1]).flat().reduce((s, e) => s + e.amount, 0)
           - Object.values(a[1]).flat().reduce((s, e) => s + e.amount, 0)
  )

  function toggleCat(cat) {
    setOpenCats(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n })
  }
  function toggleSub(key) {
    setOpenSubs(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  if (expenses.length === 0) return <div className="empty">Aucune dépense enregistrée pour cette période</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {sortedCats.map(([cat, subs]) => {
        const allExps  = Object.values(subs).flat()
        const catTotal = allExps.reduce((s, e) => s + e.amount, 0)
        const isOpen   = openCats.has(cat)

        return (
          <div key={cat}>
            {/* ── Category row ── */}
            <div
              onClick={() => toggleCat(cat)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '11px 16px', borderRadius: 10, cursor: 'pointer',
                background: isOpen ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isOpen ? 'rgba(99,102,241,0.3)' : 'var(--border)'}`,
                transition: 'background 0.15s, border 0.15s',
                userSelect: 'none',
              }}
            >
              <span style={{
                fontSize: '0.65rem', color: 'var(--accent)',
                transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s', display: 'inline-block',
              }}>▶</span>
              <span style={{ fontWeight: 700, flex: 1, fontSize: '0.9rem' }}>{cat}</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text3)', marginRight: 4 }}>
                {allExps.length} dép.
              </span>
              <span style={{ fontWeight: 700, color: 'var(--accent2)', minWidth: 70, textAlign: 'right' }}>
                {fmt(catTotal)}
              </span>
            </div>

            {/* ── Subcategory rows ── */}
            {isOpen && (
              <div style={{ marginLeft: 20, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {Object.entries(subs)
                  .sort((a, b) => b[1].reduce((s, e) => s + e.amount, 0) - a[1].reduce((s, e) => s + e.amount, 0))
                  .map(([sub, exps]) => {
                    const subTotal = exps.reduce((s, e) => s + e.amount, 0)
                    const subKey   = `${cat}::${sub}`
                    const isSubOpen = openSubs.has(subKey)

                    return (
                      <div key={sub}>
                        <div
                          onClick={() => toggleSub(subKey)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                            background: isSubOpen ? 'rgba(99,102,241,0.06)' : 'rgba(255,255,255,0.02)',
                            border: `1px solid ${isSubOpen ? 'rgba(99,102,241,0.18)' : 'transparent'}`,
                            transition: 'background 0.15s',
                            userSelect: 'none',
                          }}
                        >
                          <span style={{
                            fontSize: '0.6rem', color: 'var(--text3)',
                            transform: isSubOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s', display: 'inline-block',
                          }}>▶</span>
                          <span style={{ fontSize: '0.85rem', flex: 1, color: 'var(--text2)' }}>
                            {sub}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text3)', marginRight: 4 }}>
                            {exps.length} dép.
                          </span>
                          <span style={{ fontWeight: 600, fontSize: '0.875rem', minWidth: 70, textAlign: 'right' }}>
                            {fmt(subTotal)}
                          </span>
                        </div>

                        {/* ── Expense rows ── */}
                        {isSubOpen && (
                          <div style={{ marginLeft: 20, marginTop: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {exps.map((exp, i) => (
                              <div key={exp.id ?? `v-${i}`} style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '7px 12px', borderRadius: 7,
                                background: exp.is_recurring
                                  ? 'rgba(245,158,11,0.06)' : 'var(--bg3)',
                                border: exp.is_recurring
                                  ? '1px solid rgba(245,158,11,0.2)' : '1px solid transparent',
                              }}>
                                <span style={{
                                  fontSize: '0.75rem', color: 'var(--text3)',
                                  minWidth: 52, fontVariantNumeric: 'tabular-nums',
                                }}>
                                  {new Date(exp.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                                </span>
                                {exp.is_recurring && (
                                  <span style={{
                                    fontSize: '0.6rem', background: 'rgba(245,158,11,0.2)',
                                    color: '#f59e0b', borderRadius: 3, padding: '1px 5px',
                                    fontWeight: 700, flexShrink: 0,
                                  }}>prél.</span>
                                )}
                                <span style={{
                                  flex: 1, fontSize: '0.82rem',
                                  color: exp.description ? 'var(--text2)' : 'var(--text3)',
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                  {exp.description || '—'}
                                </span>
                                <span style={{ fontWeight: 600, fontSize: '0.875rem', flexShrink: 0 }}>
                                  {fmt(exp.amount)}
                                </span>
                                {!exp.is_virtual && (
                                  <button
                                    className="btn btn-danger btn-sm"
                                    onClick={e => { e.stopPropagation(); onDelete(exp.id) }}
                                  >✕</button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function budgetColor(percent) {
  if (percent === undefined) return undefined
  if (percent > 100) return 'var(--red)'
  return 'var(--green)'
}

export default function Expenses() {
  const now = new Date()
  const [year,      setYear]      = useState(now.getFullYear())
  const [month,     setMonth]     = useState(now.getMonth() + 1)
  const [tab,       setTab]       = useState('calendar')
  const [expenses,  setExpenses]  = useState([])
  const [recurring, setRecurring] = useState([])
  const [budgetMap, setBudgetMap] = useState({})
  const [form,      setForm]      = useState(EMPTY_FORM)
  const [showForm,       setShowForm]       = useState(false)
  const [showImport,     setShowImport]     = useState(false)
  const [loading,        setLoading]        = useState(false)
  const [confirmClear,   setConfirmClear]   = useState(false)

  useEffect(() => { fetchAll() }, [year, month])

  async function fetchAll() {
    const [expRes, budRes, recRes] = await Promise.all([
      getExpenses(year, month),
      getBudgetStatus(year, month).catch(() => ({ data: [] })),
      getRecurringExpenses(),
    ])
    setExpenses(expRes.data)
    const map = {}
    for (const s of budRes.data) map[s.category] = s
    setBudgetMap(map)
    setRecurring(recRes.data)
  }

  async function handleAdd(e) {
    e.preventDefault()
    setLoading(true)
    try {
      let payload = { ...form, amount: parseFloat(form.amount) }
      if (form.is_recurring) {
        const day = parseInt(form.recurring_day) || now.getDate()
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
        const actualDay = Math.min(day, daysInMonth)
        const y = now.getFullYear()
        const m = String(now.getMonth() + 1).padStart(2, '0')
        const d = String(actualDay).padStart(2, '0')
        payload.date = `${y}-${m}-${d}`
        payload.recurring_day = day
      }
      await addExpense(payload)
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

  async function handleClearAll() {
    await deleteAllExpenses()
    setConfirmClear(false)
    await fetchAll()
  }

  function handleCategoryChange(cat) {
    setForm(f => ({ ...f, category: cat, subcategory: CATEGORY_TREE[cat]?.[0] || '' }))
  }

  function openForm(isRecurring) {
    setForm(f => ({ ...EMPTY_FORM, is_recurring: isRecurring }))
    setShowForm(true)
  }

  const total = expenses.reduce((s, e) => s + e.amount, 0)

  const byCategory = CATEGORIES.map(cat => ({
    name: cat,
    montant: expenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0)
  })).filter(c => c.montant > 0)

  const summaryTree = {}
  expenses.forEach(exp => {
    if (!summaryTree[exp.category]) summaryTree[exp.category] = {}
    const sub = exp.subcategory || '—'
    summaryTree[exp.category][sub] = (summaryTree[exp.category][sub] || 0) + exp.amount
  })

  const subcats = CATEGORY_TREE[form.category] || []

  const recurringTotal = recurring.reduce((s, e) => s + e.amount, 0)

  return (
    <div>
      {/* Page header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Dépenses</h1>
          <p>Suivi mensuel de tes dépenses</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {confirmClear ? (
            <>
              <span style={{ fontSize: '0.8rem', color: 'var(--text3)' }}>Supprimer tout ?</span>
              <button
                className="btn btn-danger btn-sm"
                onClick={handleClearAll}
              >
                Confirmer
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setConfirmClear(false)}>
                Annuler
              </button>
            </>
          ) : (
            <button
              className="btn btn-secondary btn-sm"
              style={{ color: 'var(--red)', borderColor: 'rgba(239,68,68,0.3)' }}
              onClick={() => setConfirmClear(true)}
            >
              🗑 Tout vider
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => setShowImport(true)}>
            ↑ Importer un relevé
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              const isRecurringTab = tab === 'recurring'
              if (showForm) { setShowForm(false) } else { openForm(isRecurringTab) }
            }}
          >
            {showForm ? '✕ Fermer' : tab === 'recurring' ? '+ Nouveau prélèvement' : '+ Ajouter'}
          </button>
        </div>
      </div>

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImported={() => { fetchAll(); setShowImport(false) }}
        />
      )}

      {/* Add form — above tabs, always accessible */}
      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 16, fontSize: '0.95rem' }}>
            {form.is_recurring ? 'Nouveau prélèvement' : 'Nouvelle dépense'}
          </h3>

          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            {[
              { value: false, label: 'Dépense' },
              { value: true,  label: 'Prélèvement' },
            ].map(({ value, label }) => (
              <button key={label} type="button"
                onClick={() => setForm(f => ({ ...f, is_recurring: value }))}
                style={{
                  padding: '6px 18px', borderRadius: 8, border: '1px solid',
                  fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                  background: form.is_recurring === value ? 'var(--accent)' : 'var(--bg3)',
                  borderColor: form.is_recurring === value ? 'var(--accent)' : 'var(--border)',
                  color: form.is_recurring === value ? '#fff' : 'var(--text2)',
                }}>
                {label}
              </button>
            ))}
          </div>

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
                <input required type="number" step="0.01" min="0" placeholder="ex: 150.00"
                  value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
              </div>

              {form.is_recurring ? (
                <div className="form-group">
                  <label>Jour du mois</label>
                  <input required type="number" min="1" max="31" placeholder="ex: 27"
                    value={form.recurring_day}
                    onChange={e => setForm(f => ({ ...f, recurring_day: e.target.value }))} />
                </div>
              ) : (
                <div className="form-group">
                  <label>Date</label>
                  <input required type="date" value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                </div>
              )}

              <div className="form-group">
                <label>Description (optionnel)</label>
                <input placeholder="ex: Netflix, Orange..." value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Ajout...' : form.is_recurring ? '+ Ajouter le prélèvement' : '+ Ajouter la dépense'}
            </button>
          </form>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 20 }}>
        <button className={`tab${tab === 'calendar' ? ' active' : ''}`} onClick={() => setTab('calendar')}>
          Calendrier
        </button>
        <button className={`tab${tab === 'analysis' ? ' active' : ''}`} onClick={() => setTab('analysis')}>
          Analyse
        </button>
        <button className={`tab${tab === 'recurring' ? ' active' : ''}`} onClick={() => setTab('recurring')}>
          Prélèvements
          {recurring.length > 0 && (
            <span style={{ marginLeft: 6, fontSize: '0.68rem', background: 'rgba(99,102,241,0.25)', color: 'var(--accent)', borderRadius: 10, padding: '1px 6px', fontWeight: 700 }}>
              {recurring.length}
            </span>
          )}
        </button>
      </div>

      {/* ── TAB: Calendrier ── */}
      {tab === 'calendar' && (
        <>
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
            <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: '1.1rem' }}>{fmt(total)}</span>
          </div>

          <ExpenseCalendar year={year} month={month} expenses={expenses} onDelete={handleDelete} />
        </>
      )}

      {/* ── TAB: Analyse ── */}
      {tab === 'analysis' && (
        <>
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

          <div className="grid-2">
            {/* Chart */}
            <div className="card">
              <h3 style={{ marginBottom: 16, fontSize: '0.95rem', color: 'var(--text2)' }}>Par catégorie</h3>
              {byCategory.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(180, byCategory.length * 44)}>
                  <BarChart data={[...byCategory].sort((a, b) => b.montant - a.montant)} layout="vertical" margin={{ top: 0, right: 55, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: 'var(--text3)', fontSize: 10 }} tickFormatter={v => `${v}€`} />
                    <YAxis type="category" dataKey="name" tick={{ fill: 'var(--text2)', fontSize: 11 }} width={130} />
                    <Tooltip formatter={v => fmt(v)} contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8 }} />
                    <Bar dataKey="montant" radius={[0,4,4,0]} label={{ position: 'right', formatter: v => `${Math.round(v)}€`, fill: 'var(--text3)', fontSize: 10 }}>
                      {byCategory.map((entry, i) => (
                        <Cell key={i} fill={CAT_COLOR_MAP[entry.name] ?? 'var(--accent)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty">Aucune dépense ce mois</div>
              )}
            </div>

            {/* Summary with budget progress */}
            <div className="card">
              <h3 style={{ marginBottom: 16, fontSize: '0.95rem', color: 'var(--text2)' }}>Résumé</h3>
              {Object.keys(summaryTree).length === 0 ? (
                <div className="empty">Aucune dépense ce mois</div>
              ) : (
                Object.entries(summaryTree).map(([cat, subs]) => {
                  const catTotal = Object.values(subs).reduce((s, v) => s + v, 0)
                  const bst = budgetMap[cat]
                  const statusColor = bst ? budgetColor(bst.percent) : undefined
                  const catColor = CAT_COLOR_MAP[cat] ?? '#94a3b8'
                  return (
                    <div key={cat} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.875rem', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: catColor, flexShrink: 0 }} />
                          <span style={{ fontWeight: 600 }}>{cat}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {bst && (
                            <span style={{
                              fontSize: '0.7rem', fontWeight: 700, padding: '1px 7px', borderRadius: 10,
                              background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}55`,
                            }}>
                              {bst.percent}% ({fmt(bst.monthly_limit)})
                            </span>
                          )}
                          <span style={{ fontWeight: 700 }}>{fmt(catTotal)}</span>
                        </div>
                      </div>
                      {bst && (
                        <div style={{ background: `${catColor}22`, borderRadius: 4, height: 4, overflow: 'hidden', margin: '4px 0 6px' }}>
                          <div style={{ height: '100%', width: `${Math.min(bst.percent, 100)}%`, background: bst.percent > 100 ? '#ef4444' : catColor, borderRadius: 4, transition: 'width 0.4s' }} />
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

          {/* Collapsible expense tree */}
          <div className="card" style={{ marginTop: 20 }}>
            <h3 style={{ marginBottom: 16, fontSize: '0.95rem', color: 'var(--text2)' }}>
              Détail — {MONTHS[month - 1]} {year}
            </h3>
            <CollapsibleExpenses expenses={expenses} onDelete={handleDelete} />
          </div>
        </>
      )}

      {/* ── TAB: Prélèvements ── */}
      {tab === 'recurring' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: '0.95rem', color: 'var(--text2)', margin: 0 }}>Prélèvements automatiques</h3>
              <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: 'var(--text3)' }}>
                Dépenses récurrentes prélevées chaque mois
              </p>
            </div>
            {recurring.length > 0 && (
              <span style={{ fontWeight: 700, color: 'var(--accent2)' }}>
                {fmt(recurringTotal)} / mois
              </span>
            )}
          </div>

          {recurring.length === 0 ? (
            <div className="empty">
              Aucun prélèvement — cliquez sur "+ Nouveau prélèvement" pour en ajouter un
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Jour</th>
                    <th>Catégorie</th>
                    <th>Sous-catégorie</th>
                    <th>Description</th>
                    <th style={{ textAlign: 'right' }}>Montant / mois</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {recurring.map(exp => (
                    <tr key={exp.id}>
                      <td style={{ fontWeight: 600, color: 'var(--accent)' }}>
                        {exp.recurring_day ? `Le ${exp.recurring_day}` : '—'}
                      </td>
                      <td>{exp.category}</td>
                      <td className="muted">{exp.subcategory || '—'}</td>
                      <td className="muted">{exp.description || '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(exp.amount)}</td>
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
      )}
    </div>
  )
}
