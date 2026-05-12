import { useState, useMemo, useEffect } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { getDashboard } from '../services/api'

function fmt(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n ?? 0)
}
function fmtShort(n) {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M€'
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(0) + 'k€'
  return Math.round(n) + '€'
}
function fmtTime(d) {
  if (!d) return null
  const diff = Math.round((Date.now() - d.getTime()) / 1000)
  if (diff < 60)   return "à l'instant"
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`
  return `le ${d.toLocaleDateString('fr-FR')} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
}
// Converts an offset in months from today to a localized date string
const SIM_START = (() => { const d = new Date(); d.setDate(1); return d })()
function monthToDate(n, short = false) {
  const d = new Date(SIM_START)
  d.setMonth(d.getMonth() + n)
  return d.toLocaleDateString('fr-FR', short
    ? { month: 'short', year: '2-digit' }
    : { month: 'long', year: 'numeric' })
}

const SOURCE_TYPES = [
  { value: 'salary',         label: 'Salaire',        color: '#818cf8' },
  { value: 'livret_a',       label: 'Livret A',       color: '#38bdf8' },
  { value: 'ldd',            label: 'LDD',            color: '#34d399' },
  { value: 'compte_courant', label: 'Compte courant', color: '#f59e0b' },
  { value: 'autre',          label: 'Autre',          color: '#94a3b8' },
]
const SRC         = Object.fromEntries(SOURCE_TYPES.map(s => [s.value, s]))
const SAVINGS_TYPES = new Set(['livret_a', 'ldd', 'compte_courant'])

const ENVELOPES = [
  { value: '',    label: '—',   color: '#6b7280', note: null },
  { value: 'pea', label: 'PEA', color: '#10b981', note: 'Exonéré d\'IR après 5 ans · plafond 150 000€' },
  { value: 'cto', label: 'CTO', color: '#60a5fa', note: 'PFU 30% sur les plus-values' },
]
const ENV     = Object.fromEntries(ENVELOPES.map(e => [e.value, e]))
const PEA_CAP = 150_000

const PERIOD_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#f472b6', '#38bdf8', '#fb923c']
const LS_KEY = 'simulation_state'

// ── Simulation ───────────────────────────────────────────────────────
function simulate(initialCapital, savingsBalances, periods, swrPct, targetPassive = 0) {
  let capital = initialCapital
  let totalInvested = initialCapital
  const swrNum = (parseFloat(swrPct) || 4) / 100
  const pool = {}
  for (const [k, v] of Object.entries(savingsBalances)) pool[k] = Math.max(0, v)

  const allPoints = [{ month: 0, capital: Math.round(capital), invested: Math.round(totalInvested), passive: Math.round(capital * swrNum / 12) }]
  const periodResults = []
  const boundaries = []
  let monthOffset = 0
  let peaCumulative = 0
  let goalMonth = null

  for (const period of periods) {
    const r = (parseFloat(period.rate) || 0) / 100 / 12
    const startCapital = capital
    const remainingBefore = { ...pool }
    const peaCumulativeBefore = peaCumulative

    const srcTotals = period.sources.map(src => ({
      id: src.id, type: src.type, envelope: src.envelope || '',
      label: src.label || SRC[src.type]?.label || src.type,
      color: SRC[src.type]?.color || '#94a3b8',
      requested: parseFloat(src.amount) || 0,
      totalActual: 0, depletedAt: null,
    }))

    let periodInvested = 0
    for (let m = 1; m <= period.months; m++) {
      let monthActual = 0
      for (const st of srcTotals) {
        let actual = st.requested
        if (SAVINGS_TYPES.has(st.type)) {
          const avail = pool[st.type] ?? 0
          actual = Math.min(actual, avail)
          pool[st.type] = Math.max(0, avail - actual)
          if (pool[st.type] <= 0 && st.depletedAt === null && st.requested > 0) st.depletedAt = m
        }
        st.totalActual += actual
        monthActual += actual
      }
      periodInvested += monthActual
      totalInvested += monthActual
      capital = capital * (1 + r) + monthActual
      const passive = Math.round(capital * swrNum / 12)
      if (goalMonth === null && targetPassive > 0 && passive >= targetPassive) goalMonth = monthOffset + m
      allPoints.push({ month: monthOffset + m, capital: Math.round(capital), invested: Math.round(totalInvested), passive })
    }

    // PEA contributions this period
    const peaContribPeriod = srcTotals
      .filter(s => s.envelope === 'pea')
      .reduce((sum, s) => sum + s.totalActual, 0)
    peaCumulative += peaContribPeriod

    monthOffset += period.months
    boundaries.push({ month: monthOffset, name: period.name })

    // Envelope breakdown
    const envelopeBreakdown = {}
    for (const st of srcTotals) {
      const env = st.envelope || ''
      if (!envelopeBreakdown[env]) envelopeBreakdown[env] = 0
      envelopeBreakdown[env] += st.requested
    }

    const requestedTotal = period.sources.reduce((s, src) => s + (parseFloat(src.amount) || 0), 0)
    periodResults.push({
      id: period.id, name: period.name, months: period.months, requestedTotal,
      actualMonthly:       Math.round(periodInvested / period.months),
      sources:             srcTotals.map(st => ({ ...st, avgMonthly: Math.round(st.totalActual / period.months) })),
      startCapital:        Math.round(startCapital),
      endCapital:          Math.round(capital),
      passiveIncome:       Math.round(capital * swrNum / 12),
      periodInvested:      Math.round(periodInvested),
      warnings:            srcTotals.filter(s => s.depletedAt !== null).map(s => ({ label: s.label, depletedAt: s.depletedAt })),
      remainingBefore,
      remainingAfter:      { ...pool },
      envelopeBreakdown,
      peaCumulativeBefore: Math.round(peaCumulativeBefore),
      peaContribPeriod:    Math.round(peaContribPeriod),
      peaCumulativeAfter:  Math.round(peaCumulative),
    })
  }

  return {
    allPoints, periodResults, boundaries,
    finalCapital:  Math.round(capital),
    finalPassive:  Math.round(capital * swrNum / 12),
    totalInvested: Math.round(totalInvested),
    totalMonths:   monthOffset,
    peaCumulative: Math.round(peaCumulative),
    goalMonth,
  }
}

let _pid = 10, _sid = 100

const DEFAULT_STATE = {
  capitalPEA: 3000,
  target: 500,
  swr: 4,
  savingsBalances: { livret_a: 0, ldd: 0, compte_courant: 0 },
  periods: [
    {
      id: 1, name: 'Phase 1 — Accumulation intensive', months: 8, rate: 10,
      sources: [
        { id: 1, type: 'salary',   label: 'Salaire',  amount: 1850, envelope: 'pea' },
        { id: 2, type: 'livret_a', label: 'Livret A', amount: 4150, envelope: 'pea' },
      ],
    },
    {
      id: 2, name: 'Phase 2 — Croisière', months: 36, rate: 10,
      sources: [
        { id: 3, type: 'salary', label: 'PEA S&P 500',    amount: 1400, envelope: 'pea' },
        { id: 4, type: 'salary', label: 'CTO Nasdaq 100', amount: 300,  envelope: 'cto' },
      ],
    },
  ],
}

export default function Simulations() {
  const [capitalPEA,      setCapitalPEA]      = useState(DEFAULT_STATE.capitalPEA)
  const [target,          setTarget]          = useState(DEFAULT_STATE.target)
  const [swr,             setSwr]             = useState(DEFAULT_STATE.swr)
  const [savingsBalances, setSavingsBalances] = useState(DEFAULT_STATE.savingsBalances)
  const [periods,         setPeriods]         = useState(DEFAULT_STATE.periods)
  const [savedAt,         setSavedAt]         = useState(null)
  const [justSaved,       setJustSaved]       = useState(false)

  useEffect(() => {
    let hasSaved = false
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) {
        const saved = JSON.parse(raw)
        if (saved.capitalPEA !== undefined) setCapitalPEA(saved.capitalPEA)
        if (saved.target     !== undefined) setTarget(saved.target)
        if (saved.swr        !== undefined) setSwr(saved.swr)
        if (saved.savingsBalances)          setSavingsBalances(saved.savingsBalances)
        if (saved.periods?.length)          setPeriods(saved.periods)
        if (saved.savedAt)                  setSavedAt(new Date(saved.savedAt))
        hasSaved = true
      }
    } catch {}

    getDashboard().then(res => {
      const d = res.data
      if (!hasSaved && d.pea_value > 0) setCapitalPEA(Math.round(d.pea_value))
      if (d.savings_accounts?.length) {
        const map = {}
        for (const acc of d.savings_accounts) map[acc.source_type] = Math.round(acc.balance || 0)
        setSavingsBalances(prev => ({ ...prev, ...map }))
      }
    }).catch(() => {})
  }, [])

  function saveSimulation() {
    const now = new Date()
    localStorage.setItem(LS_KEY, JSON.stringify({ capitalPEA, target, swr, savingsBalances, periods, savedAt: now.toISOString() }))
    setSavedAt(now)
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 2000)
  }

  const result = useMemo(
    () => simulate(capitalPEA, savingsBalances, periods, swr, target),
    [capitalPEA, savingsBalances, periods, swr, target]
  )
  const { allPoints, periodResults, boundaries, finalCapital, finalPassive, totalInvested, totalMonths, peaCumulative, goalMonth } = result
  const progressPct = Math.min((finalPassive / (target || 1)) * 100, 100)
  const peaPct = Math.min((peaCumulative / PEA_CAP) * 100, 100)

  function addPeriod() {
    const id = ++_pid
    setPeriods(p => [...p, { id, name: `Phase ${p.length + 1}`, months: 12, rate: 10,
      sources: [{ id: ++_sid, type: 'salary', label: 'Salaire', amount: 500, envelope: 'pea' }] }])
  }
  function removePeriod(id)           { setPeriods(p => p.filter(x => x.id !== id)) }
  function updatePeriod(id, key, val) { setPeriods(p => p.map(x => x.id === id ? { ...x, [key]: val } : x)) }
  function addSource(periodId) {
    setPeriods(p => p.map(x => x.id === periodId
      ? { ...x, sources: [...x.sources, { id: ++_sid, type: 'salary', label: 'Salaire', amount: 0, envelope: 'pea' }] }
      : x))
  }
  function removeSource(periodId, srcId) {
    setPeriods(p => p.map(x => x.id === periodId
      ? { ...x, sources: x.sources.filter(s => s.id !== srcId) }
      : x))
  }
  function updateSource(periodId, srcId, key, val) {
    setPeriods(p => p.map(x => x.id === periodId
      ? { ...x, sources: x.sources.map(s => s.id === srcId ? { ...s, [key]: val } : s) }
      : x))
  }

  const boundaryMonths = new Set(boundaries.map(b => b.month))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* ── Header ── */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Simulateur</h1>
          <p>Configure chaque phase et choisis combien tu investis depuis chaque source</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <button className="btn btn-primary" onClick={saveSimulation} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {justSaved ? '✓ Enregistré !' : '💾 Enregistrer'}
          </button>
          {savedAt && <span style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>Sauvegardé {fmtTime(savedAt)}</span>}
        </div>
      </div>

      {/* ── Paramètres ── */}
      <div className="card">
        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
          Paramètres
        </div>
        <div className="form-grid">
          <div className="form-group">
            <label>Capital PEA actuel (€)</label>
            <input type="number" min="0" step="100" value={capitalPEA}
              onChange={e => setCapitalPEA(parseFloat(e.target.value) || 0)} />
          </div>
          <div className="form-group">
            <label>Objectif revenus passifs (€/mois)</label>
            <input type="number" min="1" step="50" value={target}
              onChange={e => setTarget(parseFloat(e.target.value) || 1)} />
          </div>
          <div className="form-group">
            <label>Taux de retrait sécurisé (%)</label>
            <input type="number" min="1" max="10" step="0.5" value={swr}
              onChange={e => setSwr(parseFloat(e.target.value) || 4)} />
          </div>
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text3)', marginRight: 4 }}>Soldes :</span>
          {SOURCE_TYPES.filter(t => SAVINGS_TYPES.has(t.value)).map(t => (
            <div key={t.value} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: `${t.color}12`, border: `1px solid ${t.color}30` }}>
              <span style={{ fontSize: '0.72rem', color: t.color, fontWeight: 600 }}>{t.label}</span>
              <input type="number" min="0" step="500" value={savingsBalances[t.value] ?? 0}
                onChange={e => setSavingsBalances(prev => ({ ...prev, [t.value]: parseFloat(e.target.value) || 0 }))}
                style={{ background: 'transparent', border: 'none', width: 75, color: 'var(--text)', fontWeight: 700, fontSize: '0.78rem', outline: 'none', textAlign: 'right' }}
              />
              <span style={{ fontSize: '0.7rem', color: 'var(--text3)' }}>€</span>
            </div>
          ))}
          <span style={{ fontSize: '0.7rem', color: 'var(--text3)' }}>— mis à jour depuis le dashboard</span>
        </div>
      </div>

      {/* ── PEA cap tracker ── */}
      {peaCumulative > 0 && (
        <div className="card" style={{ padding: '14px 18px', borderColor: peaPct >= 90 ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Plafond PEA
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>versements cumulés sur toutes les phases</span>
            </div>
            <span style={{ fontWeight: 800, fontSize: '0.95rem', color: peaPct >= 100 ? '#ef4444' : peaPct >= 80 ? '#f59e0b' : '#10b981' }}>
              {fmt(peaCumulative)} / {fmt(PEA_CAP)} · {peaPct.toFixed(0)}%
            </span>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 99, height: 8, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 99, transition: 'width 0.4s',
              width: `${peaPct}%`,
              background: peaPct >= 100 ? '#ef4444' : peaPct >= 80 ? 'linear-gradient(90deg,#f59e0b,#ef4444)' : 'linear-gradient(90deg,#10b981,#34d399)',
            }} />
          </div>
          {peaPct >= 100 && (
            <div style={{ marginTop: 8, fontSize: '0.75rem', color: '#ef4444' }}>
              ⚠ Plafond PEA dépassé — les versements excédentaires devront aller sur CTO
            </div>
          )}
          {peaPct >= 80 && peaPct < 100 && (
            <div style={{ marginTop: 8, fontSize: '0.75rem', color: '#f59e0b' }}>
              Reste {fmt(PEA_CAP - peaCumulative)} avant le plafond PEA
            </div>
          )}
        </div>
      )}

      {/* ── Phases ── */}
      {periods.map((period, pIdx) => {
        const pResult = periodResults.find(r => r.id === period.id)
        const color   = PERIOD_COLORS[pIdx % PERIOD_COLORS.length]
        const totalRequested = period.sources.reduce((s, src) => s + (parseFloat(src.amount) || 0), 0)

        // Cumulative month offset for this phase
        const phaseStartMonth = periodResults.slice(0, pIdx).reduce((s, r) => s + r.months, 0)
        const phaseEndMonth   = phaseStartMonth + period.months

        // Envelope breakdown for display
        const envBreak = pResult?.envelopeBreakdown ?? {}
        const peaAmt   = envBreak['pea'] ?? 0
        const ctoAmt   = envBreak['cto'] ?? 0

        return (
          <div key={period.id} className="card" style={{ borderLeft: `3px solid ${color}`, padding: '20px 20px 16px' }}>

            {/* Date range chip */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color, background: `${color}15`, border: `1px solid ${color}30`, borderRadius: 6, padding: '3px 9px' }}>
                {monthToDate(phaseStartMonth, true)} → {monthToDate(phaseEndMonth, true)}
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text3)' }}>{period.months} mois</span>
              {pResult && pResult.passiveIncome >= target && (
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#10b981', marginLeft: 'auto' }}>🎯 Objectif atteint cette phase</span>
              )}
            </div>

            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 120px auto', gap: 10, alignItems: 'end', marginBottom: 20 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Nom</label>
                <input value={period.name} onChange={e => updatePeriod(period.id, 'name', e.target.value)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Durée (mois)</label>
                <input type="number" min="1" max="360" value={period.months}
                  onChange={e => updatePeriod(period.id, 'months', parseInt(e.target.value) || 1)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Rendement / an (%)</label>
                <input type="number" min="0" max="30" step="0.5" value={period.rate}
                  onChange={e => updatePeriod(period.id, 'rate', e.target.value)} />
              </div>
              {periods.length > 1 && (
                <button className="btn btn-danger btn-sm" onClick={() => removePeriod(period.id)} style={{ alignSelf: 'end' }}>Supprimer</button>
              )}
            </div>

            {/* Sources */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Sources d'investissement
              </div>

              {/* Column headers */}
              <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 72px 140px auto 28px', gap: 8, padding: '0 2px', marginBottom: 6 }}>
                {['Origine', 'Libellé', 'Enveloppe', '€ / mois', '', ''].map((h, i) => (
                  <span key={i} style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {period.sources.map(src => {
                  const meta      = SRC[src.type] || SRC.autre
                  const envMeta   = ENV[src.envelope || ''] || ENV['']
                  const isSavings = SAVINGS_TYPES.has(src.type)
                  const balBefore = pResult?.remainingBefore?.[src.type] ?? savingsBalances[src.type] ?? 0
                  const amt       = parseFloat(src.amount) || 0
                  const monthsDur = isSavings && amt > 0 ? balBefore / amt : null
                  const ok        = monthsDur === null || monthsDur >= period.months

                  return (
                    <div key={src.id} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 72px 140px auto 28px', gap: 8, alignItems: 'center' }}>

                      {/* Origine */}
                      <select
                        value={src.type}
                        onChange={e => {
                          updateSource(period.id, src.id, 'type', e.target.value)
                          updateSource(period.id, src.id, 'label', SRC[e.target.value]?.label || '')
                        }}
                        style={{ background: `${meta.color}15`, border: `1px solid ${meta.color}40`, borderRadius: 8, padding: '7px 6px', color: meta.color, fontWeight: 700, fontSize: '0.78rem' }}
                      >
                        {SOURCE_TYPES.map(t => (
                          <option key={t.value} value={t.value} style={{ background: '#111827', color: '#fff' }}>{t.label}</option>
                        ))}
                      </select>

                      {/* Libellé */}
                      <input
                        placeholder="Libellé"
                        value={src.label}
                        onChange={e => updateSource(period.id, src.id, 'label', e.target.value)}
                        style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', color: 'var(--text)', fontSize: '0.83rem' }}
                      />

                      {/* Enveloppe */}
                      <select
                        value={src.envelope || ''}
                        onChange={e => updateSource(period.id, src.id, 'envelope', e.target.value)}
                        style={{ background: `${envMeta.color}15`, border: `1px solid ${envMeta.color}40`, borderRadius: 8, padding: '7px 6px', color: envMeta.color, fontWeight: 700, fontSize: '0.8rem', textAlign: 'center' }}
                      >
                        {ENVELOPES.map(e => (
                          <option key={e.value} value={e.value} style={{ background: '#111827', color: '#fff' }}>{e.label}</option>
                        ))}
                      </select>

                      {/* Montant */}
                      <div style={{ position: 'relative' }}>
                        <input
                          type="number" min="0" step="50"
                          value={src.amount}
                          onChange={e => updateSource(period.id, src.id, 'amount', e.target.value)}
                          style={{ background: 'var(--bg3)', border: `1px solid ${meta.color}40`, borderRadius: 8, padding: '7px 46px 7px 10px', color: 'var(--text)', fontSize: '0.83rem', width: '100%' }}
                        />
                        <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '0.72rem', color: 'var(--text3)', pointerEvents: 'none' }}>€/mois</span>
                      </div>

                      {/* Info solde (savings only) */}
                      <div>
                        {isSavings ? (
                          <div style={{ padding: '4px 9px', borderRadius: 7, background: ok ? `${meta.color}0d` : 'rgba(239,68,68,0.07)', border: `1px solid ${ok ? meta.color + '28' : 'rgba(239,68,68,0.25)'}`, fontSize: '0.71rem', lineHeight: 1.5, whiteSpace: 'nowrap' }}>
                            <span style={{ color: 'var(--text3)' }}>Solde : </span>
                            <strong style={{ color: meta.color }}>{fmtShort(balBefore)}</strong>
                            {amt > 0 && (
                              <>
                                <span style={{ color: 'var(--text3)' }}> · </span>
                                <strong style={{ color: ok ? '#10b981' : '#ef4444' }}>
                                  {ok ? `dure ${monthsDur >= 9999 ? '∞' : monthsDur.toFixed(0)} mois ✓` : `⚠ épuisé M${Math.floor(monthsDur)}`}
                                </strong>
                              </>
                            )}
                          </div>
                        ) : <div />}
                      </div>

                      {/* Remove */}
                      {period.sources.length > 1
                        ? <button className="btn btn-danger btn-sm" onClick={() => removeSource(period.id, src.id)} style={{ padding: '3px 7px', fontSize: '0.7rem' }}>✕</button>
                        : <div />}
                    </div>
                  )
                })}
              </div>

              <button className="btn btn-secondary btn-sm" onClick={() => addSource(period.id)} style={{ marginTop: 10 }}>
                + Source
              </button>
            </div>

            {/* Results */}
            {pResult && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Allocation bar */}
                <div style={{ height: 10, display: 'flex', borderRadius: 99, overflow: 'hidden', background: 'rgba(255,255,255,0.06)' }}>
                  {pResult.sources.filter(s => s.requested > 0).map(s => {
                    const w = totalRequested > 0 ? (s.requested / totalRequested) * 100 : 0
                    return <div key={s.id} style={{ width: `${w}%`, background: s.color, minWidth: 2 }} />
                  })}
                </div>

                {/* Legend */}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  {pResult.sources.filter(s => s.requested > 0).map(s => (
                    <span key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.82rem' }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                      <strong style={{ color: 'var(--text)' }}>{s.label}</strong>
                      <span style={{ color: 'var(--text3)' }}>{fmt(s.requested)}/mois</span>
                      {s.envelope && <span style={{ fontSize: '0.68rem', fontWeight: 700, color: ENV[s.envelope]?.color, padding: '1px 5px', borderRadius: 4, background: `${ENV[s.envelope]?.color}18`, border: `1px solid ${ENV[s.envelope]?.color}30` }}>{ENV[s.envelope]?.label}</span>}
                    </span>
                  ))}
                  <span style={{ fontWeight: 800, fontSize: '0.9rem', color, marginLeft: 'auto' }}>= {fmt(totalRequested)}/mois</span>
                </div>

                {/* PEA / CTO breakdown */}
                {(peaAmt > 0 || ctoAmt > 0) && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {peaAmt > 0 && (
                      <div style={{ padding: '6px 12px', borderRadius: 9, background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.22)', fontSize: '0.78rem' }}>
                        <span style={{ color: '#10b981', fontWeight: 700 }}>PEA</span>
                        <span style={{ color: 'var(--text3)', marginLeft: 6 }}>{fmt(peaAmt)}/mois · exonéré d'IR après 5 ans</span>
                        {pResult.peaCumulativeAfter > 0 && (
                          <span style={{ color: 'var(--text3)', marginLeft: 8 }}>· cumulé après phase : <strong style={{ color: pResult.peaCumulativeAfter > PEA_CAP ? '#ef4444' : '#10b981' }}>{fmt(pResult.peaCumulativeAfter)}</strong></span>
                        )}
                      </div>
                    )}
                    {ctoAmt > 0 && (
                      <div style={{ padding: '6px 12px', borderRadius: 9, background: 'rgba(96,165,250,0.07)', border: '1px solid rgba(96,165,250,0.22)', fontSize: '0.78rem' }}>
                        <span style={{ color: '#60a5fa', fontWeight: 700 }}>CTO</span>
                        <span style={{ color: 'var(--text3)', marginLeft: 6 }}>{fmt(ctoAmt)}/mois · PFU 30% sur les plus-values</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Stats */}
                <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  {[
                    { label: 'Total investi',    value: fmt(pResult.periodInvested) },
                    { label: 'Capital fin phase', value: fmt(pResult.endCapital),    accent: color },
                    { label: 'Revenus passifs',  value: `${pResult.passiveIncome}€/mois`, accent: pResult.passiveIncome >= target ? '#10b981' : undefined },
                  ].map((s, i) => (
                    <div key={s.label} style={{ flex: 1, padding: '10px 14px', background: 'var(--bg3)', borderLeft: i > 0 ? '1px solid var(--border)' : 'none' }}>
                      <div style={{ fontSize: '0.63rem', color: 'var(--text3)', marginBottom: 3 }}>{s.label}</div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: s.accent || 'var(--text)' }}>{s.value}</div>
                    </div>
                  ))}
                </div>

                {pResult.warnings.map((w, i) => (
                  <div key={i} style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, fontSize: '0.78rem', color: '#ef4444' }}>
                    ⚠ <strong>{w.label}</strong> s'épuise au mois {w.depletedAt} de cette phase
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      <button className="btn btn-secondary" onClick={addPeriod} style={{ alignSelf: 'flex-start' }}>
        + Ajouter une phase
      </button>

      {/* ── Résumé ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {[
          { label: 'Capital final',  value: fmt(finalCapital),  color: '#6366f1', sub: `après ${totalMonths} mois` },
          { label: 'Total investi',  value: fmt(totalInvested), color: '#10b981', sub: `dont ${fmt(capitalPEA)} initial` },
          { label: 'Gains générés',  value: fmt(Math.max(0, finalCapital - totalInvested)), color: '#f59e0b',
            sub: `×${totalInvested > 0 ? (finalCapital / totalInvested).toFixed(1) : '1'} multiplicateur` },
          { label: 'Revenu passif',  value: `${finalPassive}€/mois`, color: finalPassive >= target ? '#10b981' : '#f59e0b', sub: `règle des ${swr}%` },
        ].map(card => (
          <div key={card.label} className="stat-card" style={{ borderTop: `2px solid ${card.color}33` }}>
            <div className="label">{card.label}</div>
            <div className="value" style={{ color: card.color, fontSize: '1.3rem' }}>{card.value}</div>
            <div className="sub">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Progression ── */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text2)' }}>Progression vers {target}€/mois</span>
          <span style={{ fontWeight: 800, fontSize: '1rem', color: progressPct >= 100 ? '#10b981' : 'var(--accent)' }}>
            {finalPassive}€ / {target}€ · {progressPct.toFixed(0)}%
          </span>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 99, height: 10, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 99, transition: 'width 0.5s', width: `${progressPct}%`,
            background: progressPct >= 100 ? 'linear-gradient(90deg,#10b981,#34d399)' : 'linear-gradient(90deg,#6366f1,#8b5cf6)',
          }} />
        </div>
      </div>

      {/* ── Chronologie ── */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16 }}>
          Chronologie
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* Start */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20, flexShrink: 0 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#6366f1', flexShrink: 0 }} />
              <div style={{ width: 2, height: 28, background: 'var(--border)' }} />
            </div>
            <div style={{ paddingBottom: 20 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>{monthToDate(0)}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>Départ · capital {fmt(capitalPEA)}</div>
            </div>
          </div>

          {/* Phase boundaries */}
          {periodResults.map((pr, i) => {
            const endMonth = periodResults.slice(0, i + 1).reduce((s, r) => s + r.months, 0)
            const color = PERIOD_COLORS[i % PERIOD_COLORS.length]
            const isLast = i === periodResults.length - 1
            const goalHere = goalMonth !== null && (i === 0 ? goalMonth <= endMonth : goalMonth > periodResults.slice(0, i).reduce((s, r) => s + r.months, 0) && goalMonth <= endMonth)
            return (
              <div key={pr.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20, flexShrink: 0 }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: color, border: '2px solid var(--bg2)', flexShrink: 0 }} />
                  {!isLast && <div style={{ width: 2, height: 36, background: 'var(--border)' }} />}
                </div>
                <div style={{ paddingBottom: isLast ? 0 : 24 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color }}>
                    {monthToDate(endMonth)}
                    <span style={{ color: 'var(--text3)', fontWeight: 400, marginLeft: 8, fontSize: '0.72rem' }}>
                      fin {pr.name}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text3)', marginTop: 2 }}>
                    Capital {fmt(pr.endCapital)} · Passif {fmt(pr.passiveIncome)}/mois
                    {pr.passiveIncome >= target && <span style={{ color: '#10b981', fontWeight: 700, marginLeft: 6 }}>🎯 objectif atteint</span>}
                  </div>
                  {goalHere && goalMonth !== endMonth && (
                    <div style={{ fontSize: '0.7rem', color: '#10b981', marginTop: 2 }}>
                      🎯 Objectif atteint vers {monthToDate(goalMonth)} (M{goalMonth})
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {/* Goal not reached within phases */}
          {goalMonth !== null && goalMonth > totalMonths && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20, flexShrink: 0 }}>
                <div style={{ width: 2, height: 16, background: 'rgba(16,185,129,0.3)', borderLeft: '2px dashed rgba(16,185,129,0.4)' }} />
                <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem' }}>🎯</div>
              </div>
              <div style={{ paddingTop: 16 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#10b981' }}>{monthToDate(goalMonth)}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>Objectif {target}€/mois atteint (M{goalMonth})</div>
              </div>
            </div>
          )}
          {goalMonth === null && (
            <div style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: 8, paddingLeft: 32 }}>
              ⚠ Objectif de {target}€/mois non atteint dans cette simulation
            </div>
          )}
        </div>
      </div>

      {/* ── Graphique ── */}
      <div className="card">
        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
          Évolution du capital
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          {periods.map((p, i) => (
            <span key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: 'var(--text3)' }}>
              <span style={{ width: 12, height: 3, background: PERIOD_COLORS[i % PERIOD_COLORS.length], display: 'inline-block', borderRadius: 2 }} />
              {p.name}
            </span>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={allPoints} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gI" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#10b981" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="month"
              tickFormatter={m => m === 0 ? monthToDate(0, true) : (boundaries.some(b => b.month === m) || m % 12 === 0) ? monthToDate(m, true) : ''}
              tick={{ fontSize: 10, fill: 'var(--text3)' }} axisLine={false} tickLine={false} interval={0} />
            <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: 'var(--text3)' }} width={52} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(v, name) => [fmt(v), name === 'capital' ? 'Capital total' : name === 'passive' ? 'Revenu passif/mois' : 'Montant investi']}
              labelFormatter={m => `${monthToDate(m)} · M${m}`}
              contentStyle={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: '0.82rem' }}
              cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }}
            />
            {boundaries.map((b, i) => (
              <ReferenceLine key={b.month} x={b.month}
                stroke={PERIOD_COLORS[(i + 1) % PERIOD_COLORS.length]}
                strokeDasharray="4 3" strokeOpacity={0.6}
                label={{ value: `P${i + 2}`, position: 'insideTopRight', fontSize: 9, fill: PERIOD_COLORS[(i + 1) % PERIOD_COLORS.length] }}
              />
            ))}
            {goalMonth !== null && (
              <ReferenceLine x={goalMonth} stroke="#10b981" strokeDasharray="4 3"
                label={{ value: '🎯', position: 'top', fontSize: 13 }} />
            )}
            <Area type="monotone" dataKey="capital"  stroke="#6366f1" strokeWidth={2.5} fill="url(#gC)" dot={false} name="capital" />
            <Area type="monotone" dataKey="invested" stroke="#10b981" strokeWidth={1.5} fill="url(#gI)" dot={false} strokeDasharray="5 3" name="invested" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
