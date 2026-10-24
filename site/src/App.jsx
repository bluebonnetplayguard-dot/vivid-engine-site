import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import RouteLoading from '@/components/RouteLoading';
import MobileTabProvider from '@/components/MobileTabProvider';
const PageNotFound = lazy(() => import('@/lib/PageNotFound'));
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import BrandHead from './components/BrandHead';
import Layout from '@/components/Layout';
import PortalLayout from '@/components/portal/PortalLayout';
import AdminLayout from '@/components/admin/AdminLayout';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Navigate } from 'react-router-dom';
// Add page imports here
import BeaumontWebDesign from '@/pages/BeaumontWebDesign';
import LakeCharlesAppDevelopment from '@/pages/LakeCharlesAppDevelopment';
import CustomAppDevelopment from '@/pages/CustomAppDevelopment';
const Maintenance = lazy(() => import('@/pages/Maintenance'));
const Home = lazy(() => import('@/pages/Home'));
const About = lazy(() => import('@/pages/About'));
const Contact = lazy(() => import('@/pages/Contact'));
const VividEstimatorLanding = lazy(() => import('@/pages/VividEstimatorLanding'));
const StartProject = lazy(() => import('@/pages/StartProject'));
const Support = lazy(() => import('@/pages/Support'));
const Privacy = lazy(() => import('@/pages/Privacy'));
const DeleteAccount = lazy(() => import('@/pages/DeleteAccount'));
const ServiceAreas = lazy(() => import('@/pages/ServiceAreas'));
const ServiceAreaCity = lazy(() => import('@/pages/ServiceAreaCity'));
const Services = lazy(() => import('@/pages/Services'));
const Pricing = lazy(() => import('@/pages/Pricing'));
const DomainLeasing = lazy(() => import('@/pages/DomainLeasing'));
const FAQ = lazy(() => import('@/pages/FAQ'));
const ClientDomain = lazy(() => import('@/pages/ClientDomain'));
const PortalDashboard = lazy(() => import('@/pages/PortalDashboard'));
const ProjectDetail = lazy(() => import('@/pages/ProjectDetail'));
const Settings = lazy(() => import('@/pages/Settings'));
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'));
const AdminLeads = lazy(() => import('@/pages/admin/AdminLeads'));
const AdminQuotes = lazy(() => import('@/pages/admin/AdminQuotes'));
const AdminEstimator = lazy(() => import('@/pages/admin/AdminEstimator'));
const AdminInvoices = lazy(() => import('@/pages/admin/AdminInvoices'));
const AdminCosts = lazy(() => import('@/pages/admin/AdminCosts'));
const AdminLogo = lazy(() => import('@/pages/admin/AdminLogo'));
const AdminPos = lazy(() => import('@/pages/admin/AdminPos'));
const AdminChat = lazy(() => import('@/pages/admin/AdminChat'));
const AdminMarketingDrafts = lazy(() => import('@/pages/admin/AdminMarketingDrafts'));
const AdminPricing = lazy(() => import('@/pages/admin/AdminPricing'));
const AdminBilling = lazy(() => import('@/pages/admin/AdminBilling'));
const AiSearch = lazy(() => import('@/pages/AiSearch'));
const AiSearchPricing = lazy(() => import('@/pages/AiSearchPricing'));
const AiSearchAccount = lazy(() => import('@/pages/AiSearchAccount'));
const VideoStudio = lazy(() => import('@/pages/VideoStudio'));
const VideoPricing = lazy(() => import('@/pages/VideoPricing'));
const VideoAccount = lazy(() => import('@/pages/VideoAccount'));
const VideoEditorPage = lazy(() => import('@/pages/VideoEditorPage'));
const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Suspense fallback={<RouteLoading />}>
    <Routes>
      <Route element={<Layout />}>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/" element={<Home />} />
      <Route path="/about" element={<About />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/vivid-estimator" element={<VividEstimatorLanding />} />
      <Route path="/support" element={<Support />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/delete-account" element={<DeleteAccount />} />
      <Route path="/services" element={<Services />} />
      <Route path="/locations/beaumont-web-design" element={<BeaumontWebDesign />} />
      <Route path="/locations/lake-charles-app-development" element={<LakeCharlesAppDevelopment />} />
      <Route path="/services/custom-app-development" element={<CustomAppDevelopment />} />
      <Route path="/maintenance" element={<Maintenance />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/domain-leasing" element={<DomainLeasing />} />
      <Route path="/faq" element={<FAQ />} />
      <Route path="/service-areas" element={<ServiceAreas />} />
      <Route path="/service-areas/:slug" element={<ServiceAreaCity />} />
      <Route path="/ai-search" element={<AiSearch />} />
      <Route path="/ai-search/pricing" element={<AiSearchPricing />} />
      <Route path="/video" element={<VideoStudio />} />
      <Route path="/video/pricing" element={<VideoPricing />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route path="/start" element={<StartProject />} />
        <Route path="/ai-search/account" element={<AiSearchAccount />} />
        <Route path="/video/account" element={<VideoAccount />} />
        <Route path="/video/edit/:id" element={<VideoEditorPage />} />
        <Route element={<PortalLayout />}>
          <Route path="/portal" element={<PortalDashboard />} />
          <Route path="/portal/projects/:id" element={<ProjectDetail />} />
          <Route path="/portal/domain" element={<ClientDomain />} />
          <Route path="/portal/domain-status" element={<Navigate to="/portal/domain" replace />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/leads" element={<AdminLeads />} />
          <Route path="/admin/quotes" element={<AdminQuotes />} />
          <Route path="/admin/estimator" element={<AdminEstimator />} />
          <Route path="/admin/invoices" element={<AdminInvoices />} />
          <Route path="/admin/costs" element={<AdminCosts />} />
          <Route path="/admin/logo" element={<AdminLogo />} />
          <Route path="/admin/pos" element={<AdminPos />} />
          <Route path="/admin/chat" element={<AdminChat />} />
          <Route path="/admin/marketing-drafts" element={<AdminMarketingDrafts />} />
          <Route path="/admin/pricing" element={<AdminPricing />} />
          <Route path="/admin/billing" element={<AdminBilling />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
      </Route>
    </Routes>
    </Suspense>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <BrandHead />
          <MobileTabProvider><AuthenticatedApp /></MobileTabProvider>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App