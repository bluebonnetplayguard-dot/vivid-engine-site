import { useEffect } from 'react';
import { useLocation } from 'react-router';
import Header from './components/Header';
import Footer from './components/Footer';
import { findRoute } from './routes';
import './styles.css';

export default function App() {
  const { pathname } = useLocation();
  const route = findRoute(pathname);

  // Keep the title and description current on client-side navigation.
  useEffect(() => {
    document.title = route.title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', route.description);
    window.scrollTo(0, 0);
  }, [route]);

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <Header />
      <main id="main">{route.element}</main>
      <Footer />
    </>
  );
}
