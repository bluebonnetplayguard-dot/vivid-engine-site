import BackButton from '@/components/navigation/BackButton';

export default function MobilePortalBack() {
  return <BackButton fallback="/portal" label="Portal" className="mb-4 md:hidden" />;
}