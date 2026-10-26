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
import PublicLayout from '@/components/shell/PublicLayout';
import RedirectTo from '@/components/shell/RedirectTo';
import { LangProvider } from '@/lib/lang';
import { NotificationsProvider } from '@/components/shell/Notifications';
import { REDIRECTS } from '@/config/navigation';
import { Navigate } from 'react-router-dom';
// Add page imports here
import BeaumontWebDesign from '@/pages/BeaumontWebDesign';
import LakeCharlesAppDevelopment from '@/pages/LakeCharlesAppDevelopment';
import CustomAppDevelopment from '@/pages/CustomAppDevelopment';
const Maintenance = lazy(() => import('@/pages/Maintenance'));
const Home = lazy(() => import('@/pages/Home'));
// Named exports from one module, loaded on demand.
const named = (loader, name) => lazy(() => loader().then(m => ({ default: m[name] })));
const sitePages = () => import('@/pages/content/SitePages');
const legalPages = () => import('@/pages/content/LegalPage');
const InfoPage = lazy(() => import('@/pages/InfoPage'));
const SearchPage = lazy(() => import('@/pages/app/SearchPage'));
const HistoryList = lazy(() => import('@/pages/app/HistoryList'));
const ServicesHub = named(sitePages, 'ServicesHub');
const ServicePage = named(sitePages, 'ServicePage');
const AreasHub = named(sitePages, 'AreasHub');
const AreaPage = named(sitePages, 'AreaPage');
const LocalHub = named(sitePages, 'LocalHub');
const LocalCategoryPage = named(sitePages, 'LocalCategoryPage');
const PartnerTiersPage = named(sitePages, 'PartnerTiersPage');
const PartnerApplyPage = named(sitePages, 'PartnerApplyPage');
const PartnerDashboard = named(sitePages, 'PartnerDashboard');
const TemplatesPage = named(sitePages, 'TemplatesPage');
const ProcessPage = named(sitePages, 'ProcessPage');
const PayPage = named(sitePages, 'PayPage');
const QuotePage = named(sitePages, 'QuotePage');
const ConsultationPage = named(sitePages, 'ConsultationPage');
const ContactPage = named(sitePages, 'ContactPage');
const AccountPage = named(sitePages, 'AccountPage');
const ProjectsPage = named(sitePages, 'ProjectsPage');
const LegalPage = lazy(legalPages);
const LegalHub = named(legalPages, 'LegalHub');
const About = lazy(() => import('@/pages/About'));
const VividEstimatorLanding = lazy(() => import('@/pages/VividEstimatorLanding'));
const StartProject = lazy(() => import('@/pages/StartProject'));
const Support = lazy(() => import('@/pages/Support'));
const DeleteAccount = lazy(() => import('@/pages/DeleteAccount'));
const ServiceAreaCity = lazy(() => import('@/pages/ServiceAreaCity'));
const Checkout = lazy(() => import('@/pages/Checkout'));
const PricingPage = lazy(() => import('@/pages/pricing/PricingPage'));
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
const AiSearchAccount = lazy(() => import('@/pages/AiSearchAccount'));
const VideoStudio = lazy(() => import('@/pages/VideoStudio'));
const VideoPricing = lazy(() => import('@/pages/VideoPricing'));
const VideoAccount = lazy(() => import('@/pages/VideoAccount'));
const VideoEditorPage = lazy(() => import('@/pages/VideoEditorPage'));
const GcDesignStudio = lazy(() => import('@/modules/gc-3d-design-studio'));
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
      <Route element={<PublicLayout />}>
      <Route path="/" element={<Home />} />
      <Route path="/search" element={<SearchPage />} />
      <Route path="/recents" element={<HistoryList />} />
      <Route path="/favorites" element={<HistoryList favorites />} />
      <Route path="/discover" element={<InfoPage />} />
      <Route path="/build" element={<InfoPage />} />
      <Route path="/build/website" element={<InfoPage />} />
      <Route path="/build/app" element={<InfoPage />} />
      <Route path="/build/domains" element={<InfoPage />} />
      <Route path="/create" element={<InfoPage />} />
      <Route path="/create/images" element={<InfoPage />} />
      <Route path="/create/video" element={<InfoPage />} />
      <Route path="/create/production" element={<InfoPage />} />
      <Route path="/business" element={<InfoPage />} />
      <Route path="/business/marketing" element={<InfoPage />} />
      <Route path="/business/google-profile" element={<InfoPage />} />
      <Route path="/business/social" element={<InfoPage />} />
      <Route path="/business/reviews" element={<InfoPage />} />
      <Route path="/business/plans" element={<InfoPage />} />
      <Route path="/partners" element={<InfoPage />} />
      <Route path="/portfolio" element={<InfoPage />} />
      <Route path="/help" element={<InfoPage />} />
      <Route path="/about/ai-engines" element={<InfoPage />} />
      <Route path="/templates" element={<TemplatesPage />} />
      <Route path="/local" element={<LocalHub />} />
      <Route path="/local/:city/:category" element={<LocalCategoryPage />} />
      <Route path="/partners/tiers" element={<PartnerTiersPage />} />
      <Route path="/partners/apply" element={<PartnerApplyPage />} />
      <Route path="/partners/dashboard" element={<PartnerDashboard />} />
      <Route path="/services" element={<ServicesHub />} />
      <Route path="/services/custom-app-development" element={<CustomAppDevelopment />} />
      <Route path="/services/:slug" element={<ServicePage />} />
      <Route path="/areas" element={<AreasHub />} />
      <Route path="/areas/:slug" element={<AreaPage />} />
      <Route path="/process" element={<ProcessPage />} />
      <Route path="/pay" element={<PayPage />} />
      <Route path="/quote" element={<QuotePage />} />
      <Route path="/consultation" element={<ConsultationPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/projects" element={<ProjectsPage />} />
      <Route path="/build/my-projects" element={<Navigate to="/projects" replace />} />
      <Route path="/create/my-media" element={<Navigate to="/video" replace />} />
      <Route path="/legal" element={<LegalHub />} />
      <Route path="/legal/:slug" element={<LegalPage />} />
      <Route path="/about" element={<About />} />
      <Route path="/vivid-estimator" element={<VividEstimatorLanding />} />
      <Route path="/support" element={<Support />} />
      <Route path="/delete-account" element={<DeleteAccount />} />
      <Route path="/locations/beaumont-web-design" element={<BeaumontWebDesign />} />
      <Route path="/locations/lake-charles-app-development" element={<LakeCharlesAppDevelopment />} />
      <Route path="/maintenance" element={<Maintenance />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/pricing/:category" element={<PricingPage />} />
      <Route path="/domain-leasing" element={<DomainLeasing />} />
      <Route path="/faq" element={<FAQ />} />
      <Route path="/service-areas/:slug" element={<ServiceAreaCity />} />
      <Route path="/video" element={<VideoStudio />} />
      <Route path="/video/pricing" element={<VideoPricing />} />
      <Route path="/checkout" element={<Checkout />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route path="/start" element={<StartProject />} />
        <Route path="/ai-search/account" element={<AiSearchAccount />} />
        <Route path="/video/account" element={<VideoAccount />} />
      </Route>
      </Route>
      {/* Old addresses (config/navigation.ts REDIRECTS). */}
      {Object.entries(REDIRECTS).map(([from, to]) => <Route key={from} path={from} element={<RedirectTo to={to} />} />)}
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route path="/video/edit/:id" element={<VideoEditorPage />} />
        <Route path="/studio" element={<GcDesignStudio />} />
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
          <LangProvider><NotificationsProvider><MobileTabProvider><AuthenticatedApp /></MobileTabProvider></NotificationsProvider></LangProvider>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App