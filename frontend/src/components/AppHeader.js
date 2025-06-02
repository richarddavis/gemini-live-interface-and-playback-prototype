import React from 'react';
import AuthWidget from './AuthWidget';
import './AppHeader.css';

function AppHeader({ 
  onToggleMobileMenu,
  isMobileSidebarOpen 
}) {
  return (
    <header className="app-header">
      <div className="header-content">
        {/* Left side - Mobile menu button and app title */}
        <div className="header-left">
          <button 
            className={`mobile-menu-button ${isMobileSidebarOpen ? 'sidebar-open' : ''}`}
            onClick={onToggleMobileMenu}
            aria-label="Open menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 12H21M3 6H21M3 18H21" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          
          <div className="app-title">
            <span className="app-name">ChatApp</span>
          </div>
        </div>

        {/* Right side - Authentication widget */}
        <div className="header-right">
          <AuthWidget />
        </div>
      </div>
    </header>
  );
}

export default AppHeader; 