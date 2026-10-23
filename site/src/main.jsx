import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import '@/lib/registerPwa'

if (typeof window !== "undefined" && window.matchMedia) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const syncDark = () => document.documentElement.classList.toggle("dark", mq.matches);
  syncDark();
  mq.addEventListener("change", syncDark);
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);