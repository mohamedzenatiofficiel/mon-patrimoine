import { useState, useRef } from 'react'
import { previewImport, confirmImport, deleteImportBatch } from '../services/api'

const CATEGORY_TREE = {
  'Vie quotidienne':       ['Courses', 'Restaurants', 'Livraison repas', 'Café / Snacks', 'Retrait'],
  'Investissement mensuel':['Crypto', 'PEA', 'Assurance-vie', 'Livret A / LEP', 'SCPI', 'Actions'],
  'Abonnement':            ['Sport / Salle', 'Streaming', 'Téléphone', 'Internet', 'Autres abonnements'],
  'Logement':              ['Loyer', 'Charges', 'Assurance habitation', 'Travaux'],
  'Transport':             ['Carburant', 'Transport en commun', 'Taxi / VTC', 'Parking', 'Entretien véhicule'],
  'Santé':                 ['Médecin', 'Pharmacie', 'Mutuelle', 'Optique'],
  'Loisirs':               ['Voyage', 'Shopping', 'Cinéma / Sorties', 'Jeux vidéo', 'Livres / Culture'],
  'Famille':               ['Enfants', 'Cadeaux', 'Aide familiale'],
  'Autre':                 ['Autre'],
}
const CATEGORIES = Object.keys(CATEGORY_TREE)

function fmt(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n ?? 0)
}

const badge = (label, bg, color, border) => (
  <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: 8, background: bg, color, border, marginRight: 4 }}>
    {label}
  </span>
)

function TypeBadge({ tx }) {
  return (
    <span>
      {tx.is_duplicate  && badge('⚠ Doublon',     'rgba(239,68,68,0.15)',    '#ef4444', '1px solid rgba(239,68,68,0.3)')}
      {tx.is_credit     && badge('Crédit',         'rgba(16,185,129,0.15)',   '#10b981', '1px solid rgba(16,185,129,0.3)')}
      {tx.is_transfer   && badge('Virement',       'rgba(245,158,11,0.15)',   '#f59e0b', '1px solid rgba(245,158,11,0.3)')}
      {tx.is_recurring  && !tx.is_credit && badge('Prélèvement', 'rgba(99,102,241,0.15)', 'var(--accent)', '1px solid rgba(99,102,241,0.3)')}
    </span>
  )
}

export default function ImportModal({ onClose, onImported }) {
  const [step,        setStep]        = useState('upload')   // upload | review | done
  const [dragging,    setDragging]    = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)
  const [transactions,setTransactions]= useState([])
  const [imported,    setImported]    = useState(0)
  const [batchId,     setBatchId]     = useState(null)
  const [undone,      setUndone]      = useState(false)
  const fileRef = useRef()

  async function handleFile(file) {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Seuls les fichiers PDF sont acceptés.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await previewImport(file)
      if (!res.data.transactions?.length) {
        setError('Aucune transaction détectée dans ce fichier. Vérifiez qu\'il s\'agit d\'un relevé Société Générale.')
        return
      }
      setTransactions(res.data.transactions)
      setStep('review')
    } catch (e) {
      setError(e?.response?.data?.detail || 'Erreur lors de la lecture du PDF.')
    } finally {
      setLoading(false)
    }
  }

  function toggle(idx) {
    setTransactions(txs => txs.map((t, i) => i === idx ? { ...t, selected: !t.selected } : t))
  }

  function toggleAll(val) {
    setTransactions(txs => txs.map(t => ({ ...t, selected: val })))
  }

  function updateField(idx, field, value) {
    setTransactions(txs => txs.map((t, i) => {
      if (i !== idx) return t
      if (field === 'category') {
        return { ...t, category: value, subcategory: CATEGORY_TREE[value]?.[0] || '' }
      }
      return { ...t, [field]: value }
    }))
  }

  async function handleConfirm() {
    const selected = transactions.filter(t => t.selected)
    if (!selected.length) return
    setLoading(true)
    try {
      const res = await confirmImport(selected)
      setImported(res.data.imported)
      setBatchId(res.data.batch_id)
      setStep('done')
      onImported?.()
    } catch (e) {
      setError('Erreur lors de l\'import.')
    } finally {
      setLoading(false)
    }
  }

  async function handleUndo() {
    if (!batchId) return
    setLoading(true)
    try {
      await deleteImportBatch(batchId)
      setUndone(true)
      onImported?.()
    } catch {
      setError('Erreur lors de la suppression.')
    } finally {
      setLoading(false)
    }
  }

  const selectedCount  = transactions.filter(t => t.selected).length
  const selectedTotal  = transactions.filter(t => t.selected).reduce((s, t) => s + t.amount, 0)
  const duplicateCount = transactions.filter(t => t.is_duplicate).length

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 18, width: '100%', maxWidth: step === 'review' ? 900 : 480,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
              {step === 'upload' && 'Importer un relevé bancaire'}
              {step === 'review' && `${transactions.length} transactions détectées`}
              {step === 'done'   && 'Import terminé'}
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: 'var(--text3)' }}>
              {step === 'upload' && 'Relevé Société Générale au format PDF'}
              {step === 'review' && 'Vérifiez et ajustez les catégories avant d\'importer'}
              {step === 'done'   && `${imported} dépense${imported > 1 ? 's' : ''} ajoutée${imported > 1 ? 's' : ''}`}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '1.2rem', cursor: 'pointer', padding: '4px 8px', borderRadius: 8 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

          {/* STEP: upload */}
          {step === 'upload' && (
            <div>
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 14, padding: '48px 24px', textAlign: 'center',
                  cursor: 'pointer', transition: 'all 0.2s',
                  background: dragging ? 'rgba(99,102,241,0.07)' : 'rgba(255,255,255,0.02)',
                }}
              >
                <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📄</div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Glissez votre relevé ici</div>
                <div style={{ color: 'var(--text3)', fontSize: '0.85rem' }}>ou cliquez pour sélectionner un fichier PDF</div>
                <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }}
                  onChange={e => handleFile(e.target.files[0])} />
              </div>
              {loading && (
                <div style={{ textAlign: 'center', marginTop: 24, color: 'var(--text3)' }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: 8, animation: 'spin 1s linear infinite' }}>⟳</div>
                  Analyse du PDF en cours...
                </div>
              )}
              {error && (
                <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: '#ef4444', fontSize: '0.875rem' }}>
                  {error}
                </div>
              )}
              <div style={{ marginTop: 20, padding: '14px 16px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 10, fontSize: '0.8rem', color: 'var(--text3)', lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--text2)' }}>Comment récupérer votre relevé ?</strong><br />
                Espace Client SG → Mes comptes → Relevés → Télécharger PDF
              </div>
            </div>
          )}

          {/* STEP: review */}
          {step === 'review' && (
            <div>
              {/* Filters bar */}
              <div style={{ display: 'flex', gap: 8, marginBottom: duplicateCount > 0 ? 10 : 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-sm btn-secondary" onClick={() => toggleAll(true)}>Tout sélectionner</button>
                <button className="btn btn-sm btn-secondary" onClick={() => toggleAll(false)}>Tout déselectionner</button>
                <button className="btn btn-sm btn-secondary" onClick={() => setTransactions(txs => txs.map(t => ({ ...t, selected: !t.is_credit && !t.is_transfer && !t.is_duplicate })))}>
                  Dépenses uniquement
                </button>
                <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text3)' }}>
                  {selectedCount} sélectionnée{selectedCount > 1 ? 's' : ''} · {fmt(selectedTotal)}
                </span>
              </div>

              {duplicateCount > 0 && (
                <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '0.875rem', color: '#ef4444', fontWeight: 600 }}>
                    ⚠ {duplicateCount} doublon{duplicateCount > 1 ? 's' : ''} détecté{duplicateCount > 1 ? 's' : ''}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text3)', flex: 1 }}>
                    Ces transactions semblent déjà exister dans l'app (même montant, date proche, ou prélèvement récurrent enregistré). Elles sont désélectionnées par défaut.
                  </span>
                </div>
              )}

              {error && (
                <div style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#ef4444', fontSize: '0.8rem' }}>{error}</div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {transactions.map((tx, idx) => (
                  <div key={idx} style={{
                    display: 'grid',
                    gridTemplateColumns: '32px 80px 1fr 160px 140px 80px',
                    gap: 10, alignItems: 'center',
                    padding: '10px 12px', borderRadius: 10,
                    background: tx.is_duplicate && !tx.selected
                      ? 'rgba(239,68,68,0.04)'
                      : tx.selected ? 'rgba(99,102,241,0.07)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${tx.is_duplicate ? 'rgba(239,68,68,0.2)' : tx.selected ? 'rgba(99,102,241,0.2)' : 'var(--border)'}`,
                    opacity: tx.selected ? 1 : 0.45,
                    transition: 'all 0.15s',
                  }}>
                    {/* Checkbox */}
                    <input type="checkbox" checked={tx.selected}
                      onChange={() => toggle(idx)}
                      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)' }} />

                    {/* Date */}
                    <span style={{ fontSize: '0.78rem', color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>
                      {tx.date ? new Date(tx.date).toLocaleDateString('fr-FR') : '—'}
                    </span>

                    {/* Description + badge */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={tx.description}>
                        {tx.description}
                      </div>
                      <TypeBadge tx={tx} />
                    </div>

                    {/* Category */}
                    <select
                      value={tx.category}
                      onChange={e => updateField(idx, 'category', e.target.value)}
                      style={{ fontSize: '0.78rem', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 6px', color: 'var(--text)', width: '100%' }}
                    >
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>

                    {/* Subcategory */}
                    <select
                      value={tx.subcategory}
                      onChange={e => updateField(idx, 'subcategory', e.target.value)}
                      style={{ fontSize: '0.78rem', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 6px', color: 'var(--text)', width: '100%' }}
                    >
                      {(CATEGORY_TREE[tx.category] || ['Autre']).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>

                    {/* Amount */}
                    <span style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.875rem', color: tx.is_credit ? '#10b981' : 'var(--text)' }}>
                      {tx.is_credit ? '+' : '-'}{fmt(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP: done */}
          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              {undone ? (
                <>
                  <div style={{ fontSize: '3rem', marginBottom: 16 }}>🗑️</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 8 }}>Import annulé</div>
                  <div style={{ color: 'var(--text3)', fontSize: '0.875rem' }}>
                    Les {imported} dépense{imported > 1 ? 's' : ''} ont été supprimée{imported > 1 ? 's' : ''}.
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '3rem', marginBottom: 16 }}>✅</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 8 }}>
                    {imported} dépense{imported > 1 ? 's' : ''} importée{imported > 1 ? 's' : ''}
                  </div>
                  <div style={{ color: 'var(--text3)', fontSize: '0.875rem' }}>
                    Retrouvez-les dans votre calendrier et la liste des dépenses.
                  </div>
                  <button
                    onClick={handleUndo}
                    disabled={loading}
                    style={{
                      marginTop: 20, padding: '8px 18px',
                      background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                      borderRadius: 8, color: '#ef4444', fontSize: '0.85rem',
                      cursor: 'pointer', fontWeight: 600,
                    }}
                  >
                    {loading ? 'Suppression...' : '🗑 Annuler cet import'}
                  </button>
                </>
              )}
              {error && (
                <div style={{ marginTop: 12, color: '#ef4444', fontSize: '0.8rem' }}>{error}</div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'review' && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button className="btn btn-secondary" onClick={() => { setStep('upload'); setTransactions([]) }}>
              ← Changer de fichier
            </button>
            <button
              className="btn btn-primary"
              disabled={!selectedCount || loading}
              onClick={handleConfirm}
            >
              {loading ? 'Import en cours...' : `Importer ${selectedCount} dépense${selectedCount > 1 ? 's' : ''} · ${fmt(selectedTotal)}`}
            </button>
          </div>
        )}

        {step === 'done' && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', textAlign: 'right' }}>
            <button className="btn btn-primary" onClick={onClose}>Fermer</button>
          </div>
        )}
      </div>
    </div>
  )
}
