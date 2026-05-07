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

export const getSnapshots    = (period) => api.get('/snapshots', { params: { period } })
export const createSnapshot  = ()       => api.post('/snapshots')

export default api
