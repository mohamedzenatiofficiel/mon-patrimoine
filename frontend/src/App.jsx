import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import Dashboard    from './pages/Dashboard'
import Investments  from './pages/Investments'
import Expenses     from './pages/Expenses'
import Budget       from './pages/Budget'
import Cashflow     from './pages/Cashflow'
import './App.css'

const NAV = [
  { to: '/',            icon: '⊞',  label: 'Dashboard'       },
  { to: '/cashflow',    icon: '💶', label: 'Cashflow'        },
  { to: '/investments', icon: '📈', label: 'Investissements'  },
  { to: '/expenses',    icon: '💸', label: 'Dépenses'        },
  { to: '/budget',      icon: '🎯', label: 'Budget'           },
]

export default function App() {
  return (
    <BrowserRouter>
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="logo-gem">◈</span>
          <span>Mon Patrimoine</span>
        </div>

        <nav>
          {NAV.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span className="nav-icon">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">v1.0.0</div>
      </aside>

      <main className="page-content">
        <Routes>
          <Route path="/"            element={<Dashboard />}   />
          <Route path="/cashflow"    element={<Cashflow />}    />
          <Route path="/investments" element={<Investments />} />
          <Route path="/expenses"    element={<Expenses />}    />
          <Route path="/budget"      element={<Budget />}      />
          <Route path="*"            element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}
