import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export const getInvestments  = ()       => api.get('/investments')
export const addInvestment   = (data)   => api.post('/investments', data)
export const updateInvestment= (id, d)  => api.put(`/investments/${id}`, d)
export const deleteInvestment= (id)     => api.delete(`/investments/${id}`)

export const getExpenses     = (year, month) => api.get('/expenses', { params: { year, month } })
export const addExpense      = (data)   => api.post('/expenses', data)
export const updateExpense   = (id, d)  => api.put(`/expenses/${id}`, d)
export const deleteExpense   = (id)     => api.delete(`/expenses/${id}`)

export const getPrice        = (symbol) => api.get(`/prices/${symbol}`)
export const getDashboard    = ()       => api.get('/dashboard')
export const getCashflow     = ()       => api.get('/cashflow')

export const getSnapshots    = (period) => api.get('/snapshots', { params: { period } })
export const createSnapshot  = ()       => api.post('/snapshots')

export const getBudgets      = ()             => api.get('/budgets')
export const upsertBudget    = (data)         => api.post('/budgets', data)
export const updateBudget    = (id, data)     => api.put(`/budgets/${id}`, data)
export const deleteBudget    = (id)           => api.delete(`/budgets/${id}`)
export const getBudgetStatus = (year, month)  => api.get('/budgets/status', { params: { year, month } })

export const getIncome       = (year, month)  => api.get('/income', { params: { year, month } })
export const upsertIncome    = (data)         => api.post('/income', data)
export const deleteIncome    = (id)           => api.delete(`/income/${id}`)

export default api
