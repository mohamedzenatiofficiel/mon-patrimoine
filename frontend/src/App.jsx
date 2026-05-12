import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import Dashboard   from './pages/Dashboard'
import Investments from './pages/Investments'
import Expenses    from './pages/Expenses'
import Cashflow    from './pages/Cashflow'
import Simulations from './pages/Simulations'
import './App.css'

const NAV = [
  { to: '/',             icon: '⊞',  label: 'Dashboard'       },
  { to: '/budget',       icon: '💶', label: 'Budget'          },
  { to: '/investments',  icon: '📈', label: 'Investissements'  },
  { to: '/expenses',     icon: '💸', label: 'Dépenses'        },
  { to: '/simulations',  icon: '🔢', label: 'Simulateur'      },
]

export default function App() {
  return (
    <BrowserRouter>
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-gem">◈</div>
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
          <Route path="/budget"      element={<Cashflow />}    />
          <Route path="/investments" element={<Investments />} />
          <Route path="/expenses"    element={<Expenses />}    />
          <Route path="/simulations" element={<Simulations />} />
          <Route path="*"            element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}
