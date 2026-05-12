import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export const getInvestments  = ()       => api.get('/investments')
export const addInvestment   = (data)   => api.post('/investments', data)
export const updateInvestment= (id, d)  => api.put(`/investments/${id}`, d)
export const deleteInvestment= (id)     => api.delete(`/investments/${id}`)

export const getExpenses          = (year, month) => api.get('/expenses', { params: { year, month } })
export const getRecurringExpenses = ()            => api.get('/expenses/recurring')
export const addExpense           = (data)        => api.post('/expenses', data)
export const updateExpense        = (id, d)       => api.put(`/expenses/${id}`, d)
export const deleteExpense        = (id)          => api.delete(`/expenses/${id}`)
export const deleteAllExpenses   = ()             => api.delete('/expenses/all')

export const getPrice        = (symbol) => api.get(`/prices/${symbol}`)
export const searchSymbol    = (q)      => api.get('/prices/search', { params: { q } })
export const getDashboard    = ()       => api.get('/dashboard')
export const getCashflow     = ()       => api.get('/cashflow')

export const getSnapshots    = (period) => api.get('/snapshots', { params: { period } })
export const createSnapshot  = ()       => api.post('/snapshots')

export const getBudgets      = ()             => api.get('/budgets')
export const upsertBudget    = (data)         => api.post('/budgets', data)
export const updateBudget    = (id, data)     => api.put(`/budgets/${id}`, data)
export const deleteBudget    = (id)           => api.delete(`/budgets/${id}`)
export const getBudgetStatus = (year, month)  => api.get('/budgets/status', { params: { year, month } })

export const getIncome       = ()       => api.get('/income')
export const addIncome       = (data)   => api.post('/income', data)
export const updateIncome    = (id, d)  => api.put(`/income/${id}`, d)
export const deleteIncome    = (id)     => api.delete(`/income/${id}`)

export const getMonthlyIncome    = (year, month)  => api.get('/monthly-income', { params: { year, month } })
export const upsertMonthlyIncome = (data)         => api.post('/monthly-income', data)
export const deleteMonthlyIncome = (id)           => api.delete(`/monthly-income/${id}`)

export const deleteImportBatch = (batchId) => api.delete(`/import/batch/${batchId}`)

export const getStrategyGoal     = ()         => api.get('/strategy/goal')
export const updateStrategyGoal  = (data)     => api.put('/strategy/goal', data)
export const getStrategyPhases   = ()         => api.get('/strategy/phases')
export const createStrategyPhase = (data)     => api.post('/strategy/phases', data)
export const updateStrategyPhase = (id, data) => api.put(`/strategy/phases/${id}`, data)
export const deleteStrategyPhase = (id)       => api.delete(`/strategy/phases/${id}`)
export const getEnvelopes        = ()         => api.get('/strategy/envelopes')
export const createEnvelope      = (data)     => api.post('/strategy/envelopes', data)
export const updateEnvelope      = (id, data) => api.put(`/strategy/envelopes/${id}`, data)
export const deleteEnvelope      = (id)       => api.delete(`/strategy/envelopes/${id}`)
export const getMonthlyChecks    = (y, m)     => api.get('/strategy/checks', { params: { year: y, month: m } })
export const ensureChecks        = (y, m)     => api.post('/strategy/checks/ensure', null, { params: { year: y, month: m } })
export const markCheckDone       = (id)       => api.post(`/strategy/checks/${id}/done`)
export const markCheckUndone     = (id)       => api.post(`/strategy/checks/${id}/undone`)

export const importPayslip = (file) => {
  const fd = new FormData()
  fd.append('file', file)
  return api.post('/import/payslip', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
}

export const previewImport  = (file) => {
  const fd = new FormData()
  fd.append('file', file)
  return api.post('/import/preview', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
}
export const confirmImport  = (transactions) => api.post('/import/confirm', { transactions })

export default api
