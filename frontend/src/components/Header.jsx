import { NavLink } from 'react-router-dom';

export default function Header() {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="logo">
          <div className="logo-icon"><i className="fa-solid fa-vector-square" /></div>
          <div className="logo-text">
            <span className="logo-title">AssetBot</span>
            <span className="logo-sub">Annotation Automation</span>
          </div>
        </div>
        <nav className="page-nav">
          <NavLink to="/" end className={({ isActive }) => `page-nav-link${isActive ? ' active' : ''}`}>
            <i className="fa-solid fa-robot" /> Annotate
          </NavLink>
          <NavLink to="/extract" className={({ isActive }) => `page-nav-link${isActive ? ' active' : ''}`}>
            <i className="fa-solid fa-magnifying-glass-location" /> Extract
          </NavLink>
        </nav>
        <div className="header-status">
          <div className="status-dot" id="statusDot" />
          <span className="status-label" id="statusLabel">Idle</span>
        </div>
      </div>
    </header>
  );
}
