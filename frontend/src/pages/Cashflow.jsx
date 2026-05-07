import { useEffect, useState } from 'react'
import { getIncome, addIncome, updateIncome, deleteIncome, getCashflow } from '../services/api'
import CashflowSankey from '../components/CashflowSankey'

function fmt(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n ?? 0)
}

const SOURCE_TYPES = [
  { value: 'salary',   label: 'Salaire net',  description: 'Revenu mensuel net' },
  { value: 'livret_a', label: 'Livret A',      description: 'Épargne mensuelle Livret A' },
  { value: 'ldd',      label: 'LDD',           description: 'Épargne mensuelle LDD' },
]

const TYPE_MAP = Object.fromEntries(SOURCE_TYPES.map(t => [t.value, t]))

const EMPTY_FORM = { label: 'Salaire net', source_type: 'salary', amount: '' }

export default function Cashflow() {
  const [incomes, setIncomes]   = useState([])
  const [cashflow, setCashflow] = useState(null)
  const [form, setForm]         = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading]   = useState(false)

  async function loadAll() {
    const [incRes, cfRes] = await Promise.all([getIncome(), getCashflow()])
    setIncomes(incRes.data)
    setCashflow(cfRes.data)
  }

  useEffect(() => { loadAll() }, [])

  function startEdit(entry) {
    setEditingId(entry.id)
    setForm({ label: entry.label, source_type: entry.source_type, amount: String(entry.amount) })
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.label.trim() || !form.amount) return
    setLoading(true)
    const payload = { label: form.label.trim(), source_type: form.source_type, amount: parseFloat(form.amount) }
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

  function handleTypeChange(type) {
    const meta = TYPE_MAP[type]
    setForm(f => ({ ...f, source_type: type, label: meta?.label || f.label }))
  }

  const salary       = incomes.find(i => i.source_type === 'salary')
  const savings      = incomes.filter(i => i.source_type !== 'salary')
  const totalSavings = savings.reduce((s, i) => s + i.amount, 0)
  const expenses     = cashflow?.total ?? 0
  const remaining    = salary ? salary.amount - expenses - totalSavings : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <h1 style={{ margin: 0 }}>Cashflow</h1>

      {/* Summary stat cards */}
      {salary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
          {[
            { label: 'Salaire', value: salary.amount },
            { label: 'Dépenses', value: expenses },
            { label: 'Épargne', value: totalSavings },
            { label: 'Reste', value: remaining, colored: true },
          ].map(({ label, value, colored }) => (
            <div key={label} className="stat-card">
              <div className="label">{label}</div>
              <div className="value" style={colored ? { color: value >= 0 ? 'var(--green)' : 'var(--red)' } : {}}>
                {fmt(value)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sankey diagram */}
      {cashflow?.nodes?.length > 0 && (
        <div className="card">
          <h3 style={{ marginBottom: 16, fontSize: '0.95rem', color: 'var(--text2)' }}>Diagramme de flux</h3>
          <CashflowSankey data={cashflow} height={420} />
        </div>
      )}

      {/* Income list */}
      <div className="card">
        <h3 style={{ marginBottom: 16, fontSize: '0.95rem', color: 'var(--text2)' }}>Revenus & Épargne</h3>
        {incomes.length === 0 && (
          <p style={{ color: 'var(--text3)', marginBottom: 12 }}>
            Ajoutez votre salaire et vos comptes d'épargne pour visualiser votre cashflow.
          </p>
        )}
        {incomes.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Libellé</th>
                  <th style={{ textAlign: 'right' }}>Montant / mois</th>
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
      </div>

      {/* Add / Edit form */}
      <div className="card">
        <h3 style={{ marginBottom: 16, fontSize: '0.95rem', color: 'var(--text2)' }}>
          {editingId ? 'Modifier' : 'Ajouter un revenu / compte épargne'}
        </h3>
        <form onSubmit={handleSubmit}>
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
              <label>Montant mensuel (€)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Ex: 2500"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                required
              />
            </div>
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
      </div>
    </div>
  )
}
