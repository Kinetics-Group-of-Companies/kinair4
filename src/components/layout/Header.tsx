import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Wind, Menu, X, Settings, LogIn, LogOut, User, FolderKanban, Scale, FileText, Building2, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { KinairLogo } from '@/components/KinairLogo';
import { useAuth } from '@/lib/authContext';
import { SyncNowButton } from '@/components/offline/SyncNowButton';

export function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, isAuthenticated, signOut, isAdmin, isApproved } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;
  const navClass = (path: string) =>
    `text-sm font-medium whitespace-nowrap transition-colors ${
      isActive(path) ? 'text-primary' : 'text-muted-foreground hover:text-primary'
    }`;
  const mobileNavClass = (path: string) =>
    `px-4 py-2 text-sm font-medium rounded-lg ${
      isActive(path) ? 'text-primary bg-muted' : 'text-muted-foreground hover:bg-muted'
    }`;

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <Link to="/" className="flex items-center">
            <KinairLogo size="lg" />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-4 xl:gap-6">
            <Link to="/" className={navClass('/')}>Home</Link>
            <Link to="/selector" className={navClass('/selector')}>Fan Selector</Link>
            <Link to="/air-curtain" className={navClass('/air-curtain')}>Air Curtain</Link>
            
            <Link to="/compare" className={navClass('/compare')}>Compare</Link>
            <Link to="/calculator" className={navClass('/calculator')}>Calculator</Link>
            {isAuthenticated && (
              <Link to="/projects" className={navClass('/projects')}>Projects</Link>
            )}
            {isAuthenticated && (
              <Link to="/tracker" className={navClass('/tracker')}>Tracker</Link>
            )}
            <Link to="/documentation" className={navClass('/documentation')}>Docs</Link>
            <Link to="/downloads" className={navClass('/downloads')}>Downloads</Link>
            <Link to="/quote" className={navClass('/quote')}>Quote</Link>
            <Link to="/about" className={navClass('/about')}>About</Link>
          </nav>

          {/* Actions */}
          <div className="hidden lg:flex items-center gap-3">
            <SyncNowButton />
            {isAuthenticated ? (
              <>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="w-4 h-4" />
                  <span>{user?.email?.split('@')[0]}</span>
                </div>
                {isAdmin ? (
                  <Link to="/admin">
                    <Button variant="kinair-outline" size="sm">
                      <Settings className="w-4 h-4" />
                      Admin
                    </Button>
                  </Link>
                ) : (
                  <Link to="/settings">
                    <Button variant="kinair-outline" size="sm">
                      <Settings className="w-4 h-4" />
                      Settings
                    </Button>
                  </Link>
                )}
                <Button variant="ghost" size="sm" onClick={handleLogout}>
                  <LogOut className="w-4 h-4" />
                </Button>
              </>
            ) : (
              <Link to="/login">
                <Button variant="kinair" size="sm">
                  <User className="w-4 h-4" />
                  Login
                </Button>
              </Link>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button 
            className="lg:hidden p-2"
            aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={isMobileMenuOpen}
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            <span className="sr-only">{isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}</span>
          </button>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="lg:hidden py-4 border-t border-border animate-fade-in">
            <nav className="flex flex-col gap-2">
              <SyncNowButton className="mx-4 mb-2 self-start" />
              <Link to="/" className={mobileNavClass('/')} onClick={() => setIsMobileMenuOpen(false)}>
                Home
              </Link>
              <Link to="/selector" className={mobileNavClass('/selector')} onClick={() => setIsMobileMenuOpen(false)}>
                Fan Selector
              </Link>
              <Link to="/air-curtain" className={mobileNavClass('/air-curtain')} onClick={() => setIsMobileMenuOpen(false)}>
                Air Curtain Selector
              </Link>
              <Link to="/compare" className={`${mobileNavClass('/compare')} flex items-center gap-2`} onClick={() => setIsMobileMenuOpen(false)}>
                <Scale className="w-4 h-4" />
                Compare
              </Link>
              <Link to="/calculator" className={mobileNavClass('/calculator')} onClick={() => setIsMobileMenuOpen(false)}>
                Calculator
              </Link>
              {isAuthenticated && (
                <Link 
                  to="/projects" 
                  className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg flex items-center gap-2"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <FolderKanban className="w-4 h-4" />
                  Projects
                </Link>
              )}
              {isAuthenticated && (
                <Link 
                  to="/tracker" 
                  className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg flex items-center gap-2"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <Truck className="w-4 h-4" />
                  LPO &amp; Delivery Tracker
                </Link>
              )}
              <Link 
                to="/documentation" 
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Documentation
              </Link>
              <Link 
                to="/downloads" 
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Download Software
              </Link>
              <Link 
                to="/quote" 
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg flex items-center gap-2"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <FileText className="w-4 h-4" />
                Request Quote
              </Link>
              <Link 
                to="/about" 
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg flex items-center gap-2"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <Building2 className="w-4 h-4" />
                About Us
              </Link>
              <div className="border-t border-border mt-2 pt-2">
                {isAuthenticated ? (
                  <>
                    {isAdmin ? (
                      <Link 
                        to="/admin"
                        className="px-4 py-2 text-sm font-medium text-primary hover:bg-muted rounded-lg flex items-center gap-2"
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        <Settings className="w-4 h-4" />
                        Admin Portal
                      </Link>
                    ) : (
                      <Link 
                        to="/settings"
                        className="px-4 py-2 text-sm font-medium text-primary hover:bg-muted rounded-lg flex items-center gap-2"
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        <Settings className="w-4 h-4" />
                        Settings
                      </Link>
                    )}
                    <button 
                      className="w-full px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg flex items-center gap-2"
                      onClick={() => { handleLogout(); setIsMobileMenuOpen(false); }}
                    >
                      <LogOut className="w-4 h-4" />
                      Logout
                    </button>
                  </>
                ) : (
                  <> 
                    <Link 
                      to="/login"
                      className="px-4 py-2 text-sm font-medium text-primary hover:bg-muted rounded-lg flex items-center gap-2"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <User className="w-4 h-4" />
                      Login
                    </Link>
                  </>
                )}
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
