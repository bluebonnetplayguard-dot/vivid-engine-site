import { Navigate, useLocation } from 'react-router-dom';

// Redirect that keeps the query string and hash, so old links like /ai-search?thread=… still open the right thing.
export default function RedirectTo({ to }) {
  const { search, hash } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
}
