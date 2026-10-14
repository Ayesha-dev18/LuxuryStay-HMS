# LuxuryStay client

React 19 + Vite application: the public hotel website, the guest portal and the staff workspace.

See the [project README](../README.md) for setup, environment variables and deployment.

```bash
npm install
npm run dev      # http://localhost:5173
npm run lint
npm run build
```

- `src/styles/app.css` holds the design tokens and every shared component style for the signed-in product, in light and dark themes.
- `src/components/ui/` holds the shared interface kit (buttons, fields, dialogs, tables, charts).
- `src/lib/api.js` is the only place that talks to the API.
