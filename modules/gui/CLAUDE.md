# CLAUDE.md - modules/gui

React 19 single-page application (the SEPAL frontend).

## Commands

```bash
npm start       # Vite dev server
npm run build   # Production build (Vite)
npm test        # Vitest
npm run lint    # ESLint (src/)
```

## Key Architecture

### State Management
- **Redux** for global state with custom `actionBuilder` pattern (not standard Redux actions/reducers)
- `src/store.js`: Store setup with `select(path)` and `subscribe(path, callback)` helpers
- `src/action-builder.js`: Fluent API for state mutations - `actionBuilder('NAME').set(path, value).dispatch()`
- `src/stateUtils.js`: Path-based state access with `selectFrom(state, path)`
- No Redux Toolkit or Redux Saga - uses custom RxJS-based side effects

### RxJS Integration
- Heavy use of RxJS observables for async operations and side effects
- `src/subscription.jsx`: Both HOC (`withSubscriptions()`) and hook (`useSubscriptions()`) for managing RxJS subscriptions with automatic cleanup on unmount
- API calls return observables (suffix `$`), subscribed in components

### Routing
- React Router 7 (`react-router-dom`)
- Route tree defined in `src/app/` directory structure

### Internationalization
- `react-intl` for i18n
- `src/translate.js`: `msg(key)` helper function
- Translation files in `src/translations/`

### API Layer
- `src/apiRegistry.js`: Central API registry
- API calls go through the gateway proxy at `/api/*`

## Source Structure

```
src/
  app/                  # App shell and route pages
    home/body/
      apps/             # App launcher UI
      browse/           # File/asset browsers
      process/          # Recipe processing (main feature area)
        recipe/         # Recipe types: mosaic, classification, timeSeries, ccdc, etc.
      terminal/         # Web terminal (xterm.js)
      users/            # User management (admin)
  widget/               # Reusable UI components (buttons, forms, panels, tabs, notifications)
  map/                  # Map components (Google Maps integration)
```

## Non-Obvious Conventions

- **Path aliases**: `~/` resolves to `src/` (configured in `vite.config.js`). Imports look like `import {thing} from '~/store'`.
- **CSS Modules**: All component styles use `*.module.css` files (279 total). Import as `import styles from './component.module.css'`.
- **`compose` HOC pattern**: `src/compose.js` chains multiple HOCs. Legacy pattern - newer code uses hooks.
- **`connect` HOC**: `src/connect.js` connects components to Redux store (custom, not react-redux's connect).
- **Logging**: `src/log.js` with `src/log.json` config. Uses `getLogger(name)` with level-based filtering per module.
- **Recipe system**: The core domain model. Recipes are saved with gzip compression, identified by type (MOSAIC, CLASSIFICATION, TIME_SERIES, CCDC, etc.). Recipe state lives under `process.loadedRecipes` in Redux.
- **ESLint**: Module has its own `eslint.config.js` extending root config with React plugin and `simple-import-sort`.
- **No backend code**: This module is purely frontend. Built to static files and served by nginx in production.
