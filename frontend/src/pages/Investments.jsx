import { useEffect, useState } from 'react'
import { getInvestments, addInvestment, deleteInvestment, getPrice } from '../services/api'

function fmt(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n ?? 0)
}

const EMPTY_FORM = { name: '', symbol: '', type: 'ETF', quantity: '', buy_price: '' }

const POPULAR_ETFS = [
  { label: 'ETF S&P 500 (Amundi)', symbol: 'LU1681048804.F' },
  { label: 'ETF MSCI World',       symbol: 'IE00B4L5Y983.F' },
  { label: 'ETF NASDAQ 100',       symbol: 'IE0032077012.F' },
]

export default function Investments() {
  const [tab,        setTab]        = useState('ETF')
  const [positions,  setPositions]  = useState([])
  const [prices,     setPrices]     = useState({})
  const [form,       setForm]       = useState(EMPTY_FORM)
  const [showForm,   setShowForm]   = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const filtered = positions.filter(p => p.type === tab)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const res = await getInvestments()
    setPositions(res.data)
    refreshPrices(res.data)
  }

  async function refreshPrices(list = positions) {
    setRefreshing(true)
    const unique = [...new Set(list.map(p => p.symbol))]
    const results = await Promise.allSettled(unique.map(s => getPrice(s)))
    const map = {}
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') map[unique[i]] = r.value.data.price
    })
    setPrices(map)
    setRefreshing(false)
  }

  async function handleAdd(e) {
    e.preventDefault()
    setLoading(true)
    try {
      await addInvestment({ ...form, quantity: parseFloat(form.quantity), buy_price: parseFloat(form.buy_price) })
      setForm(EMPTY_FORM)
      setShowForm(false)
      await fetchAll()
    } finally { setLoading(false) }
  }

  async function handleDelete(id) {
    if (!confirm('Supprimer cette position ?')) return
    await deleteInvestment(id)
    await fetchAll()
  }

  function currentValue(pos) {
    const price = prices[pos.symbol]
    return price ? price * pos.quantity : pos.buy_price * pos.quantity
  }

  function pnl(pos) {
    const price = prices[pos.symbol]
    if (!price) return null
    return ((price - pos.buy_price) / pos.buy_price * 100).toFixed(2)
  }

  const totalValue = filtered.reduce((s, p) => s + currentValue(p), 0)

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Investissements</h1>
          <p>Suivi de tes positions en temps réel</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => refreshPrices()} disabled={refreshing}>
            {refreshing ? '⟳ Actualisation...' : '⟳ Actualiser les prix'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(v => !v)}>
            {showForm ? '✕ Fermer' : '+ Ajouter'}
          </button>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16, fontSize: '0.95rem' }}>Nouvelle position</h3>
          <form onSubmit={handleAdd}>
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <div className="form-group">
                <label>Type</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  <option value="ETF">ETF (PEA)</option>
                  <option value="CRYPTO">Crypto (Binance)</option>
                </select>
              </div>
              <div className="form-group">
                <label>Nom</label>
                <input required placeholder="ex: ETF S&P 500" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Symbole Yahoo Finance</label>
                <input required placeholder="ex: CW8.PA ou BTC-EUR" value={form.symbol} onChange={e => setForm(f => ({ ...f, symbol: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Quantité</label>
                <input required type="number" step="any" min="0" placeholder="ex: 115" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Prix d'achat moyen (€)</label>
                <input required type="number" step="any" min="0" placeholder="ex: 42.50" value={form.buy_price} onChange={e => setForm(f => ({ ...f, buy_price: e.target.value }))} />
              </div>
            </div>

            {form.type === 'ETF' && (
              <div style={{ marginBottom: 14, fontSize: '0.8rem', color: 'var(--text3)' }}>
                Symboles populaires :&nbsp;
                {POPULAR_ETFS.map(e => (
                  <button key={e.symbol} type="button" className="btn btn-secondary btn-sm" style={{ marginRight: 6, marginBottom: 4 }}
                    onClick={() => setForm(f => ({ ...f, symbol: e.symbol, name: e.label }))}>
                    {e.label}
                  </button>
                ))}
              </div>
            )}

            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Ajout...' : '+ Ajouter la position'}
            </button>
          </form>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab${tab === 'ETF'    ? ' active' : ''}`} onClick={() => setTab('ETF')}>   📈 PEA / ETF</button>
        <button className={`tab${tab === 'CRYPTO' ? ' active' : ''}`} onClick={() => setTab('CRYPTO')}>🪙 Cryptos</button>
      </div>

      {/* Positions table */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>{filtered.length} position(s)</span>
          <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{fmt(totalValue)}</span>
        </div>

        {filtered.length === 0 ? (
          <div className="empty">Aucune position — clique sur "+ Ajouter" pour commencer</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Symbole</th>
                  <th>Quantité</th>
                  <th>Prix achat</th>
                  <th>Prix actuel</th>
                  <th>Valeur</th>
                  <th>+/- %</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(pos => {
                  const p    = prices[pos.symbol]
                  const perf = pnl(pos)
                  return (
                    <tr key={pos.id}>
                      <td style={{ fontWeight: 600 }}>{pos.name}</td>
                      <td className="muted">{pos.symbol}</td>
                      <td>{pos.quantity}</td>
                      <td>{fmt(pos.buy_price)}</td>
                      <td>{p ? fmt(p) : <span className="muted">—</span>}</td>
                      <td style={{ fontWeight: 600 }}>{fmt(currentValue(pos))}</td>
                      <td>
                        {perf !== null
                          ? <span className={parseFloat(perf) >= 0 ? 'green' : 'red'}>{parseFloat(perf) >= 0 ? '+' : ''}{perf}%</span>
                          : <span className="muted">—</span>
                        }
                      </td>
                      <td>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(pos.id)}>✕</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
