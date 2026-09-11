import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider } from "@/lib/authContext";
import { FanDatabaseProvider } from "@/lib/fanDatabaseContext";
import { GuestTrialProvider } from "@/lib/guestTrialContext";
import { FaviconLoader } from "@/components/FaviconLoader";
import { Seo } from "@/components/Seo";
import { isOfflineMode } from "@/lib/offline/mode";
import { useState } from "react";
import HomePage from "./pages/HomePage";
import FanSelectorPage from "./pages/FanSelectorPage";

import AirCurtainSelectorPage from "./pages/AirCurtainSelectorPage";
import UserAuthPage from "./pages/UserAuthPage";
import AdminAuthPage from "./pages/AdminAuthPage";
import AdminPage from "./pages/AdminPage";
import UserSettingsPage from "./pages/UserSettingsPage";
import CalculatorPage from "./pages/CalculatorPage";
import EngineeringIntelligencePage from "./pages/EngineeringIntelligencePage";
import DocumentationPage from "./pages/DocumentationPage";
import ProjectsPage from "./pages/ProjectsPage";
import LpoTrackerPage from "./pages/LpoTrackerPage";
import SubmittalControlPage from "./pages/SubmittalControlPage";
import AboutPage from "./pages/AboutPage";
import QuotePage from "./pages/QuotePage";
import ComparePage from "./pages/ComparePage";
import DownloadsPage from "./pages/DownloadsPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import AuthConfirmPage from "./pages/AuthConfirmPage";
import NotFound from "./pages/NotFound";

// Desktop (Electron) builds load from file:// where history routing breaks
const Router =
  typeof window !== "undefined" && window.location.protocol === "file:"
    ? HashRouter
    : BrowserRouter;

const App = () => {
  // Keep queryClient in state to persist across HMR
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: isOfflineMode
      ? {
          // The desktop client reads IndexedDB even when the operating system
          // reports no network. React Query's default online-only mode would
          // otherwise pause every fan catalogue query while disconnected.
          queries: { networkMode: "always" },
          mutations: { networkMode: "always" },
        }
      : undefined,
  }));


  return (
    <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <GuestTrialProvider>
        <FanDatabaseProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <FaviconLoader />
            <Router>
              <Routes>
                <Route path="/" element={<>
                  <Seo path="/"
                    title="KINAIR — Fan & Air Curtain Selection Tool"
                    description="Professional fan and air curtain selection tool. Optimize your ventilation systems with precision engineering and advanced performance calculations." />
                  <HomePage /></>} />
                <Route path="/selector" element={<>
                  <Seo path="/selector"
                    title="Fan Selector | KINAIR"
                    description="Select the right axial fan by airflow, static pressure, motor, noise and efficiency. Full performance curves and downloadable datasheets." />
                  <FanSelectorPage /></>} />
                <Route path="/air-curtain" element={<>
                  <Seo path="/air-curtain"
                    title="Air Curtain Selector | KINAIR"
                    description="Size air curtains by door width, mounting height, airflow and velocity. Match coverage, view velocity profiles and download datasheets." />
                  <AirCurtainSelectorPage /></>} />
                <Route path="/login" element={<>
                  <Seo path="/login" title="Sign In | KINAIR" description="Sign in to your KINAIR account to manage projects and fan selections." noindex />
                  <UserAuthPage /></>} />
                <Route path="/auth" element={<>
                  <Seo path="/auth" title="Sign In | KINAIR" description="Sign in to your KINAIR account to manage projects and fan selections." noindex />
                  <UserAuthPage /></>} />
                <Route path="/admin-login" element={<>
                  <Seo path="/admin-login" title="Admin Sign In | KINAIR" description="Administrator sign in for the KINAIR selection platform." noindex />
                  <AdminAuthPage /></>} />
                <Route path="/admin" element={<>
                  <Seo path="/admin" title="Admin Portal | KINAIR" description="KINAIR admin portal for catalogue, branding and user management." noindex />
                  <AdminPage /></>} />
                <Route path="/settings" element={<>
                  <Seo path="/settings" title="Account Settings | KINAIR" description="Manage your KINAIR account settings, units and password." noindex />
                  <UserSettingsPage /></>} />
                <Route path="/calculator" element={<>
                  <Seo path="/calculator"
                    title="Unit Calculator | KINAIR"
                    description="Convert airflow, pressure and power units for fan selection — m³/h, CFM, Pa, in. wg and more." />
                  <CalculatorPage /></>} />
                <Route path="/engineering-intelligence" element={<>
                  <Seo path="/engineering-intelligence"
                    title="Energy & Payback Calculator | KINAIR"
                    description="Compare fan and air curtain energy use, annual operating cost, carbon savings and simple project payback." />
                  <EngineeringIntelligencePage /></>} />
                <Route path="/documentation" element={<>
                  <Seo path="/documentation"
                    title="Documentation | KINAIR"
                    description="Guides and technical documentation for the KINAIR fan and air curtain selection software." />
                  <DocumentationPage /></>} />
                <Route path="/projects" element={<>
                  <Seo path="/projects" title="My Projects | KINAIR" description="Manage your saved fan and air curtain selection projects." noindex />
                  <ProjectsPage /></>} />
                <Route path="/submittal-control" element={<>
                  <Seo path="/submittal-control" title="Submittal Control | KINAIR" description="Create and manage regular, PQ and O&M submittal packages." noindex />
                  <SubmittalControlPage /></>} />
                <Route path="/tracker" element={<>
                  <Seo path="/tracker" title="LPO & Delivery Tracker | KINAIR" description="Track customer orders from LPO to delivery with lead times, milestones and delay alerts." noindex />
                  <LpoTrackerPage /></>} />
                <Route path="/about" element={<>
                  <Seo path="/about"
                    title="About KINAIR"
                    description="Learn about KINAIR — precision fan and air curtain selection software built by ventilation engineers." />
                  <AboutPage /></>} />
                <Route path="/quote" element={<>
                  <Seo path="/quote"
                    title="Request a Quote | KINAIR"
                    description="Request a quotation for selected fans and air curtains — send your project requirements to the KINAIR team." />
                  <QuotePage /></>} />
                <Route path="/compare" element={<>
                  <Seo path="/compare"
                    title="Compare Fans & Air Curtains | KINAIR"
                    description="Compare fan and air curtain models side by side — performance, noise, power and dimensions." />
                  <ComparePage /></>} />
                <Route path="/downloads" element={<>
                  <Seo path="/downloads"
                    title="Downloads | KINAIR"
                    description="Download the KINAIR offline fan selection software for Windows and Android, with automatic cloud sync." />
                  <DownloadsPage /></>} />
                <Route path="/auth/confirm" element={<>
                  <Seo path="/auth/confirm" title="Confirm Email | KINAIR" description="Confirm your KINAIR account email." noindex />
                  <AuthConfirmPage /></>} />
                <Route path="/reset-password" element={<>
                  <Seo path="/reset-password" title="Reset Password | KINAIR" description="Reset your KINAIR account password." noindex />
                  <ResetPasswordPage /></>} />
                <Route path="/forgot-password" element={<>
                  <Seo path="/forgot-password" title="Reset Password | KINAIR" description="Reset your KINAIR account password." noindex />
                  <ResetPasswordPage /></>} />
                <Route path="*" element={<>
                  <Seo path="/404" title="Page Not Found | KINAIR" description="The page you are looking for does not exist." noindex />
                  <NotFound /></>} />
              </Routes>
            </Router>
          </TooltipProvider>
        </FanDatabaseProvider>
        </GuestTrialProvider>
      </AuthProvider>
    </QueryClientProvider>
    </HelmetProvider>
  );
};

export default App;
