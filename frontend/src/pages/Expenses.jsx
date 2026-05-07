import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { getExpenses, addExpense, deleteExpense } from '../services/api'

function fmt(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n ?? 0)
}

const CATEGORIES = ['Loyer / Famille', 'Courses / Alimentation', 'Loisirs', 'Transport', 'Abonnements', 'Santé', 'Autre']

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

const EMPTY_FORM = { category: CATEGORIES[0], amount: '', date: new Date().toISOString().split('T')[0], description: '' }

export default function Expenses() {
  const now = new Date()
  const [year,      setYear]      = useState(now.getFullYear())
  const [month,     setMonth]     = useState(now.getMonth() + 1)
  const [expenses,  setExpenses]  = useState([])
  const [form,      setForm]      = useState(EMPTY_FORM)
  const [showForm,  setShowForm]  = useState(false)
  const [loading,   setLoading]   = useState(false)

  useEffect(() => { fetchExpenses() }, [year, month])

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
      await fetchExpenses()
    } finally { setLoading(false) }
  }

  async function handleDelete(id) {
    if (!confirm('Supprimer cette dépense ?')) return
    await deleteExpense(id)
    await fetchExpenses()
  }

  const total = expenses.reduce((s, e) => s + e.amount, 0)

  // Group by category for chart
  const byCategory = CATEGORIES.map(cat => ({
    name: cat.split('/')[0].trim(),
    montant: expenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0)
  })).filter(c => c.montant > 0)

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

      {/* Add form */}
      {showForm && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16, fontSize: '0.95rem' }}>Nouvelle dépense</h3>
          <form onSubmit={handleAdd}>
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <div className="form-group">
                <label>Catégorie</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
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
        {/* Chart */}
        <div className="card">
          <h3 style={{ marginBottom: 16, fontSize: '0.95rem', color: 'var(--text2)' }}>Par catégorie</h3>
          {byCategory.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byCategory} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fill: 'var(--text3)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--text3)', fontSize: 11 }} tickFormatter={v => `${v}€`} />
                <Tooltip formatter={v => fmt(v)} contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8 }} />
                <Bar dataKey="montant" fill="var(--accent)" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty">Aucune dépense ce mois</div>
          )}
        </div>

        {/* Summary by category */}
        <div className="card">
          <h3 style={{ marginBottom: 16, fontSize: '0.95rem', color: 'var(--text2)' }}>Résumé</h3>
          {byCategory.length === 0 ? (
            <div className="empty">Aucune dépense ce mois</div>
          ) : (
            byCategory.map(c => (
              <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>
                <span className="muted">{c.name}</span>
                <span style={{ fontWeight: 600 }}>{fmt(c.montant)}</span>
              </div>
            ))
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
