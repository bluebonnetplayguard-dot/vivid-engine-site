# Vivid Engine Solutions website

React 18 + Vite + Tailwind CSS 4 + React Router 7. Talks to the app's own API at `/api` through `src/api/client.js`.

Tailwind 4 is configured in CSS: see the `@theme inline` block at the top of `src/index.css` (it replaced `tailwind.config.js`).
Keep `@theme inline` (not plain `@theme`): sections such as the dark `.engine-site` theme override the color variables.

```bash
npm install
npm run dev      # http://localhost:5173, proxies /api to the backend on :8080
npm run build    # production files in dist/
npm run lint
```

Deployment builds this folder automatically (root `Dockerfile`). See `../README.md` and `../docs/DEPLOY.md`.
