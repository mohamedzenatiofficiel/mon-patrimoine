import { useEffect, useState } from 'react'
import {
  getStrategyGoal, updateStrategyGoal,
  getStrategyPhases, getEnvelopes,
  getMonthlyChecks, ensureChecks, markCheckDone, markCheckUndone,
  getDashboard,
} from '../services/api'

function fmt(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n ?? 0)
}
function fmtDate(str) {
  if (!str) return '—'
  const [y, m] = str.split('-')
  const months = ['jan.','fév.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.']
  return `${months[parseInt(m,10)-1]} ${y}`
}

const MONTH_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

function simulateCapital(currentCapital, phases, annualReturn, upToDate) {
  const monthlyRate = annualReturn / 100 / 12
  let capital = currentCapital
  const now = new Date()
  let cursor = new Date(now.getFullYear(), now.getMonth(), 1)
  const target = new Date(upToDate)
  while (cursor < target) {
    const ref = `${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}-01`
    let monthly = 0
    for (const p of phases) {
      if (p.start_date <= ref && (!p.end_date || p.end_date >= ref)) monthly += p.monthly_total
    }
    capital = capital * (1 + monthlyRate) + monthly
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return Math.round(capital)
}

export default function Strategy() {
  const now = new Date()
  const [goal,   setGoal]   = useState(null)
  const [phases, setPhases] = useState([])
  const [checks, setChecks] = useState([])
  const [dashData, setDashData] = useState(null)
  const [editGoal, setEditGoal] = useState(false)
  const [goalForm, setGoalForm] = useState({ target_monthly_passive: 500, target_year: 2029, swr: 4 })
  const [savingGoal, setSavingGoal] = useState(false)

  async function loadAll() {
    const [gRes, pRes, dRes] = await Promise.all([
      getStrategyGoal(),
      getStrategyPhases(),
      getDashboard().catch(() => ({ data: null })),
    ])
    setGoal(gRes.data)
    setGoalForm({ target_monthly_passive: gRes.data.target_monthly_passive, target_year: gRes.data.target_year, swr: gRes.data.swr })
    setPhases(pRes.data)
    setDashData(dRes.data)

    await ensureChecks(now.getFullYear(), now.getMonth() + 1).catch(() => {})
    const cRes = await getMonthlyChecks(now.getFullYear(), now.getMonth() + 1).catch(() => ({ data: [] }))
    setChecks(cRes.data)
  }

  useEffect(() => { loadAll() }, [])

  async function toggleCheck(check) {
    if (check.done) await markCheckUndone(check.id)
    else await markCheckDone(check.id)
    const cRes = await getMonthlyChecks(now.getFullYear(), now.getMonth() + 1)
    setChecks(cRes.data)
  }

  async function saveGoal(e) {
    e.preventDefault()
    setSavingGoal(true)
    await updateStrategyGoal({ target_monthly_passive: parseFloat(goalForm.target_monthly_passive), target_year: parseInt(goalForm.target_year), swr: parseFloat(goalForm.swr) })
    await loadAll()
    setEditGoal(false)
    setSavingGoal(false)
  }

  const peaCapital = dashData?.pea_value ?? 0
  const swr = (goal?.swr ?? 4) / 100
  const targetPassive = goal?.target_monthly_passive ?? 500
  const currentPassive = Math.round(peaCapital * swr / 12)
  const progressPct = Math.min((currentPassive / targetPassive) * 100, 100)

  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`
  const currentPhase = phases.find(p => p.start_date <= todayStr && (!p.end_date || p.end_date >= todayStr))
    ?? phases[phases.length - 1]

  const MILESTONES = [
    { year: 2026, label: 'Fin 2026' },
    { year: 2028, label: 'Fin 2028' },
    { year: 2029, label: `Fin ${goal?.target_year ?? 2029} ✅` },
    { year: 2031, label: 'Fin 2031' },
  ]

  const milestoneData = MILESTONES.map(m => {
    const capital = simulateCapital(peaCapital, phases, 10, `${m.year}-12-31`)
    const passive = Math.round(capital * swr / 12)
    return { ...m, capital, passive }
  })

  const yearsTilGoal = (goal?.target_year ?? 2029) - now.getFullYear()
  const pendingChecks = checks.filter(c => !c.done)
  const allChecksDone = checks.length > 0 && checks.every(c => c.done)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Stratégie & Investissement</h1>
          <p>Suivi de ta stratégie personnelle vers la liberté financière</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => setEditGoal(v => !v)}>
          {editGoal ? '✕ Fermer' : '⚙ Modifier l\'objectif'}
        </button>
      </div>

      {/* Edit goal form */}
      {editGoal && (
        <div className="card">
          <h3 style={{ fontSize: '0.9rem', marginBottom: 14 }}>Modifier l'objectif</h3>
          <form onSubmit={saveGoal}>
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <div className="form-group">
                <label>Revenus passifs cible (€/mois)</label>
                <input type="number" min="1" value={goalForm.target_monthly_passive} onChange={e => setGoalForm(f => ({ ...f, target_monthly_passive: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Année cible</label>
                <input type="number" min="2025" max="2050" value={goalForm.target_year} onChange={e => setGoalForm(f => ({ ...f, target_year: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Taux de retrait sécurisé (%)</label>
                <input type="number" min="1" max="10" step="0.1" value={goalForm.swr} onChange={e => setGoalForm(f => ({ ...f, swr: e.target.value }))} />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={savingGoal}>Enregistrer</button>
          </form>
        </div>
      )}

      {/* ── Goal progress ── */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
              Objectif · Revenus passifs
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.04em' }}>{currentPassive}€</span>
              <span style={{ fontSize: '1rem', color: 'var(--text3)' }}>/ {targetPassive}€ /mois</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: progressPct >= 100 ? '#10b981' : 'var(--accent)', letterSpacing: '-0.03em' }}>
              {progressPct.toFixed(1)}%
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text3)', marginTop: 2 }}>
              {yearsTilGoal > 0 ? `Objectif ${goal?.target_year} — dans ${yearsTilGoal} an${yearsTilGoal > 1 ? 's' : ''}` : 'Objectif atteint 🎉'}
            </div>
          </div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 99, height: 10, overflow: 'hidden', marginBottom: 10 }}>
          <div style={{
            height: '100%', borderRadius: 99, transition: 'width 0.8s ease',
            width: `${progressPct}%`,
            background: progressPct >= 100
              ? 'linear-gradient(90deg, #10b981, #34d399)'
              : 'linear-gradient(90deg, #6366f1, #8b5cf6)',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text3)' }}>
          <span>Capital actuel : {fmt(peaCapital)} · Règle des 4% : {fmt(peaCapital * swr)}/an</span>
          <span>Capital cible : {fmt(targetPassive * 12 / swr)}</span>
        </div>
      </div>

      {/* ── Current phase + monthly check ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>

        {/* Current phase */}
        <div className="card" style={{ borderColor: 'rgba(99,102,241,0.3)' }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            Phase en cours
          </div>
          {currentPhase ? (() => {
            const details = (() => { try { return JSON.parse(currentPhase.details) } catch { return {} } })()
            return (
              <>
                <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 4 }}>{currentPhase.name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text3)', marginBottom: 14 }}>
                  {fmtDate(currentPhase.start_date)} → {currentPhase.end_date ? fmtDate(currentPhase.end_date) : 'En cours'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(99,102,241,0.08)', borderRadius: 8 }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text2)' }}>Total mensuel</span>
                    <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{fmt(currentPhase.monthly_total)}</span>
                  </div>
                  {details.sources?.map((s, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', background: 'var(--bg3)', borderRadius: 8 }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text3)' }}>{s.label}</span>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{fmt(s.amount)}</span>
                    </div>
                  ))}
                  {details.etf_name && (
                    <div style={{ marginTop: 4, padding: '8px 12px', background: 'rgba(16,185,129,0.06)', borderRadius: 8, border: '1px solid rgba(16,185,129,0.15)' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text3)', marginBottom: 2 }}>ETF</div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#10b981' }}>{details.etf_name}</div>
                      {details.etf_isin && <div style={{ fontSize: '0.72rem', color: 'var(--text3)', marginTop: 1 }}>{details.etf_isin}</div>}
                    </div>
                  )}
                  {details.broker && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text3)' }}>
                      Via <strong style={{ color: 'var(--text2)' }}>{details.broker}</strong>
                      {details.execution_day && ` · le ${details.execution_day} du mois`}
                    </div>
                  )}
                </div>
              </>
            )
          })() : (
            <p style={{ color: 'var(--text3)', fontSize: '0.875rem' }}>Aucune phase définie</p>
          )}
        </div>

        {/* Monthly check */}
        <div className="card" style={{ borderColor: allChecksDone ? 'rgba(16,185,129,0.3)' : pendingChecks.length > 0 ? 'rgba(245,158,11,0.3)' : 'var(--border)' }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            Virement de {MONTH_FR[now.getMonth()]} {now.getFullYear()}
          </div>

          {checks.length === 0 ? (
            <div style={{ color: 'var(--text3)', fontSize: '0.875rem' }}>
              Aucune phase active ce mois
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {checks.map(check => {
                const phase = phases.find(p => p.id === check.phase_id)
                return (
                  <div key={check.id} style={{
                    padding: '12px 14px', borderRadius: 10,
                    background: check.done ? 'rgba(16,185,129,0.07)' : 'rgba(245,158,11,0.07)',
                    border: `1px solid ${check.done ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)'}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{phase?.name ?? `Phase ${check.phase_id}`}</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: check.done ? '#10b981' : '#f59e0b', marginTop: 2 }}>
                          {fmt(check.amount)}
                        </div>
                      </div>
                      <span style={{
                        fontSize: '1.4rem', padding: '4px 8px', borderRadius: 8,
                        background: check.done ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
                      }}>
                        {check.done ? '✅' : '⏳'}
                      </span>
                    </div>
                    {check.done && check.done_at && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text3)', marginBottom: 8 }}>
                        Effectué le {new Date(check.done_at).toLocaleDateString('fr-FR')}
                      </div>
                    )}
                    <button
                      className={`btn btn-sm ${check.done ? 'btn-secondary' : 'btn-primary'}`}
                      style={{ width: '100%' }}
                      onClick={() => toggleCheck(check)}
                    >
                      {check.done ? '↩ Marquer comme non effectué' : '✓ Marquer comme effectué'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {pendingChecks.length > 0 && now.getDate() > ((() => { try { return JSON.parse(currentPhase?.details ?? '{}') } catch { return {} } })().execution_day ?? 2) && (
            <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', fontSize: '0.78rem', color: '#ef4444' }}>
              ⚠ Le virement aurait dû être effectué le {((() => { try { return JSON.parse(currentPhase?.details ?? '{}') } catch { return {} } })().execution_day ?? 2)} du mois
            </div>
          )}
        </div>
      </div>

      {/* ── Timeline ── */}
      <div className="card">
        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 20 }}>
          Roadmap stratégique
        </div>
        <div style={{ position: 'relative', paddingBottom: 8 }}>
          {/* Line */}
          <div style={{ position: 'absolute', top: 14, left: 14, right: 14, height: 2, background: 'linear-gradient(90deg, var(--accent), rgba(99,102,241,0.2))', borderRadius: 2 }} />
          {/* Nodes */}
          <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
            {[...phases, { phase_number: 99, name: `Objectif ${goal?.target_year ?? 2029}`, start_date: `${goal?.target_year ?? 2029}-01-01`, end_date: null, description: `${targetPassive}€/mois revenus passifs`, monthly_total: 0, id: -1 }].map((phase, i) => {
              const isGoal = phase.id === -1
              const isActive = !isGoal && phase.start_date <= todayStr && (!phase.end_date || phase.end_date >= todayStr)
              const isPast = !isGoal && (phase.end_date ?? '') < todayStr && phase.end_date
              const isFuture = !isGoal && phase.start_date > todayStr
              const dot = isGoal ? '#f59e0b' : isActive ? '#6366f1' : isPast ? '#10b981' : 'var(--text3)'
              return (
                <div key={phase.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', zIndex: 1, marginBottom: 10,
                    background: isGoal ? '#f59e0b22' : isActive ? 'rgba(99,102,241,0.15)' : isPast ? 'rgba(16,185,129,0.15)' : 'var(--bg3)',
                    border: `2px solid ${dot}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.65rem', fontWeight: 700, color: dot,
                  }}>
                    {isGoal ? '🎯' : isPast ? '✓' : isActive ? '●' : String(i + 1)}
                  </div>
                  <div style={{ textAlign: 'center', maxWidth: 120 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: isActive ? 'var(--accent)' : isGoal ? '#f59e0b' : 'var(--text2)', marginBottom: 2 }}>
                      {phase.name}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text3)' }}>
                      {fmtDate(phase.start_date)}
                    </div>
                    {phase.description && (
                      <div style={{ fontSize: '0.68rem', color: 'var(--text3)', marginTop: 2 }}>{phase.description}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Milestone projections ── */}
      <div className="card">
        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16 }}>
          Projections · S&P 500 à 10%/an — règle des {goal?.swr ?? 4}%
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {milestoneData.map(m => {
            const isTarget = m.year === (goal?.target_year ?? 2029)
            const reached = m.passive >= targetPassive
            return (
              <div key={m.year} style={{
                padding: '14px 16px', borderRadius: 12,
                background: isTarget ? 'rgba(16,185,129,0.07)' : 'var(--bg3)',
                border: `1px solid ${isTarget ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
              }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: isTarget ? '#10b981' : 'var(--text3)', marginBottom: 6 }}>
                  {m.label}
                </div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 4 }}>
                  {fmt(m.capital)}
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: reached ? '#10b981' : 'var(--accent)' }}>
                  {m.passive}€<span style={{ fontSize: '0.7rem', fontWeight: 400, color: 'var(--text3)' }}>/mois</span>
                </div>
                {isTarget && (
                  <div style={{ marginTop: 6, fontSize: '0.68rem', color: '#10b981', fontWeight: 700 }}>
                    ✅ Objectif atteint
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Profile summary ── */}
      <div className="card" style={{ background: 'rgba(99,102,241,0.04)', borderColor: 'rgba(99,102,241,0.2)' }}>
        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
          Mon profil investisseur
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          {[
            { label: 'Âge', value: '25 ans' },
            { label: 'Salaire net', value: '2 800 €/mois' },
            { label: 'Situation', value: 'Salarié, vit chez sa mère' },
            { label: 'Horizon', value: '2029–2031' },
            { label: 'LDD (précaution)', value: '12 000 € — intouchable' },
            { label: 'Compte courant', value: '3 000 € — quotidien' },
          ].map(({ label, value }) => (
            <div key={label} style={{ padding: '8px 12px', background: 'var(--bg3)', borderRadius: 8 }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text3)', marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
