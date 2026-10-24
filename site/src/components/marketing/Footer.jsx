import { Link } from "react-router-dom";
import { useInShell } from '@/components/shell/ShellContext';
import BusinessContact from '@/components/marketing/BusinessContact';
import InstallApp from '@/components/InstallApp';

const LINKS = [
  { label: "Services", to: "/services" },
  { label: "Maintenance", to: "/maintenance" },
  { label: "Lake Charles Web Design", to: "/service-areas/lake-charles-la" },
  { label: "Pricing", to: "/pricing" },
  { label: "Domain Leasing", to: "/domain-leasing" },
  { label: "Service Areas", to: "/service-areas" },
  { label: "FAQ", to: "/faq" },
  { label: "Contact", to: "/contact" },
  { label: "Privacy", to: "/privacy" },
  { label: "Delete account", to: "/delete-account" },
];

function FooterInner() {
  return (
    <footer>
      <nav style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "1.25rem", marginBottom: "1.5rem" }}>
        {LINKS.map((l) => (
          <Link key={l.to} to={l.to}>{l.label}</Link>
        ))}
      </nav>
      <BusinessContact placement="footer" />
      <p>© 2026 Vivid Engine Solutions. All rights reserved.</p>
      <InstallApp />
    </footer>
  );
}

// Inside the shared shell (components/shell) the shell's own navigation is used instead.
export default function Footer(props) {
  return useInShell() ? null : <FooterInner {...props} />;
}
