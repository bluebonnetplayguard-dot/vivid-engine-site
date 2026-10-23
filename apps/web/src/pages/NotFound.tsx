import { Link } from 'react-router';

export default function NotFound() {
  return (
    <section className="section">
      <div className="container prose">
        <h1>Page not found</h1>
        <p>That page doesn't exist or has moved.</p>
        <p><Link to="/" className="btn">Back to home</Link></p>
      </div>
    </section>
  );
}
