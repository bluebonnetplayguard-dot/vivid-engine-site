import { useLocation } from 'react-router-dom';
import MobilePageHeader from '@/components/navigation/MobilePageHeader';
import { pageNavigation } from '@/components/navigation/navConfig';

export default function NestedPageHeader() {
  const { pathname } = useLocation();
  const parent = pageNavigation(pathname);
  if (!parent) return null;
  return <MobilePageHeader title={parent.title} backLabel={parent.label} fallback={parent.path} />;
}