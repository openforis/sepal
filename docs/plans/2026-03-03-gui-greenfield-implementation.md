# SEPAL GUI Greenfield Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the SEPAL GUI from scratch as a TypeScript monorepo with modern React patterns, replacing all custom abstractions with community-standard libraries.

**Architecture:** Feature-based Turborepo monorepo with 10 workspace packages (app, ui, shared, map, recipes, browse, tasks, terminal, users, apps). Zustand for client state, TanStack Query + RxJS ajax for server state, TanStack Router for type-safe routing, CSS Modules for styling.

**Tech Stack:** TypeScript (strict), React 19, Vite, Turborepo, Zustand, TanStack Query, TanStack Router, RxJS, React Hook Form + Zod, MapLibre GL JS + deck.gl, i18next, Vitest + Testing Library + Playwright.

**Design doc:** `docs/plans/2026-03-03-gui-greenfield-architecture-design.md`

---

## Phase 1: Monorepo Foundation

### Task 1: Scaffold Monorepo Root

**Files:**
- Create: `package.json`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `vitest.workspace.ts`
- Create: `.gitignore`
- Create: `.prettierrc`
- Create: `eslint.config.js`

**Step 1: Initialize root package.json with npm workspaces**

```json
{
  "name": "@sepal/gui",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "test": "turbo test",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "e2e": "playwright test",
    "format": "prettier --write ."
  },
  "devDependencies": {
    "turbo": "^2.4.0",
    "typescript": "^5.8.0",
    "prettier": "^3.5.0",
    "eslint": "^9.0.0",
    "@eslint/js": "^9.0.0",
    "typescript-eslint": "^8.0.0",
    "eslint-plugin-react-hooks": "^5.0.0",
    "eslint-plugin-simple-import-sort": "^12.0.0",
    "globals": "^16.0.0"
  }
}
```

**Step 2: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "lint": {},
    "typecheck": {
      "dependsOn": ["^build"]
    }
  }
}
```

**Step 3: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": false,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  }
}
```

**Step 4: Create vitest.workspace.ts**

```typescript
import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  'packages/*/vitest.config.ts',
])
```

**Step 5: Create eslint.config.js**

```javascript
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  }
)
```

**Step 6: Create .prettierrc**

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

**Step 7: Create .gitignore**

```
node_modules/
dist/
.turbo/
*.tsbuildinfo
.env.local
coverage/
playwright-report/
```

**Step 8: Run `npm install`**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` generated

**Step 9: Commit**

```bash
git add package.json turbo.json tsconfig.base.json vitest.workspace.ts eslint.config.js .prettierrc .gitignore package-lock.json
git commit -m "feat: scaffold monorepo root with Turborepo, TypeScript, ESLint, Prettier"
```

---

### Task 2: Scaffold `shared` Package

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/vitest.config.ts`
- Create: `packages/shared/src/index.ts`

**Step 1: Create packages/shared/package.json**

```json
{
  "name": "@sepal/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zustand": "^5.0.0",
    "rxjs": "^7.8.0",
    "@tanstack/react-query": "^5.70.0",
    "i18next": "^24.0.0",
    "react-i18next": "^15.0.0",
    "i18next-http-backend": "^3.0.0",
    "i18next-browser-languagedetector": "^8.0.0",
    "react-error-boundary": "^5.0.0",
    "zod": "^3.24.0"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "vitest": "^3.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "happy-dom": "^17.0.0"
  }
}
```

**Step 2: Create packages/shared/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
```

**Step 3: Create packages/shared/vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
})
```

**Step 4: Create packages/shared/src/test-setup.ts**

```typescript
import '@testing-library/jest-dom/vitest'
```

**Step 5: Create packages/shared/src/index.ts**

```typescript
// @sepal/shared — cross-cutting utilities for SEPAL GUI
export {}
```

**Step 6: Run `npm install` from root**

Run: `npm install`

**Step 7: Commit**

```bash
git add packages/shared/
git commit -m "feat: scaffold shared package with Zustand, RxJS, TanStack Query, i18next"
```

---

### Task 3: Scaffold `ui` Package

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/vitest.config.ts`
- Create: `packages/ui/src/index.ts`
- Create: `packages/ui/src/test-setup.ts`

**Step 1: Create packages/ui/package.json**

```json
{
  "name": "@sepal/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@sepal/shared": "*"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "vitest": "^3.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "@testing-library/user-event": "^14.0.0",
    "happy-dom": "^17.0.0"
  }
}
```

**Step 2: Create tsconfig.json, vitest.config.ts, test-setup.ts, index.ts**

Same structure as `shared` package. `vitest.config.ts` adds CSS module handling:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
})
```

**Step 3: Commit**

```bash
git add packages/ui/
git commit -m "feat: scaffold ui design system package"
```

---

### Task 4: Scaffold `app` Package (SPA Shell)

**Files:**
- Create: `packages/app/package.json`
- Create: `packages/app/tsconfig.json`
- Create: `packages/app/vite.config.ts`
- Create: `packages/app/index.html`
- Create: `packages/app/src/main.tsx`

**Step 1: Create packages/app/package.json**

```json
{
  "name": "@sepal/app",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@tanstack/react-router": "^1.100.0",
    "@tanstack/react-query": "^5.70.0",
    "@sepal/shared": "*",
    "@sepal/ui": "*",
    "@sepal/map": "*",
    "@sepal/recipes": "*",
    "@sepal/browse": "*",
    "@sepal/tasks": "*",
    "@sepal/terminal": "*",
    "@sepal/users": "*",
    "@sepal/apps": "*"
  },
  "devDependencies": {
    "vite": "^6.2.0",
    "@vitejs/plugin-react-swc": "^4.0.0",
    "@tanstack/router-plugin": "^1.100.0",
    "typescript": "^5.8.0"
  }
}
```

**Step 2: Create packages/app/vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [
    TanStackRouterVite(),
    react(),
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '~': '/src',
    },
  },
})
```

**Step 3: Create packages/app/index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SEPAL</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 4: Create packages/app/src/main.tsx**

```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

function App() {
  return <div>SEPAL</div>
}

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

**Step 5: Create packages/app/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "paths": {
      "~/*": ["./src/*"]
    }
  },
  "include": ["src/**/*"]
}
```

**Step 6: Run `npm install` from root, verify dev server starts**

Run: `npm install && cd packages/app && npx vite --port 3000` (Ctrl+C after it starts)
Expected: Vite dev server starts on port 3000

**Step 7: Commit**

```bash
git add packages/app/
git commit -m "feat: scaffold app SPA shell with Vite, TanStack Router"
```

---

### Task 5: Scaffold Remaining Feature Packages

**Files:**
- Create: `packages/map/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`
- Create: `packages/recipes/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`
- Create: `packages/browse/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`
- Create: `packages/tasks/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`
- Create: `packages/terminal/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`
- Create: `packages/users/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`
- Create: `packages/apps/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`

**Step 1: Create each feature package**

Each follows the same pattern as `shared`. Feature-specific dependencies:

- **map:** `react-map-gl`, `maplibre-gl`, `@deck.gl/core`, `@deck.gl/layers`, `@deck.gl/react`, `@turf/turf`
- **recipes:** `react-hook-form`, `@hookform/resolvers`
- **browse:** (only `@sepal/shared`, `@sepal/ui`)
- **tasks:** (only `@sepal/shared`, `@sepal/ui`)
- **terminal:** `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links`
- **users:** (only `@sepal/shared`, `@sepal/ui`)
- **apps:** (only `@sepal/shared`, `@sepal/ui`)

All feature packages depend on `@sepal/shared` and `@sepal/ui`.

**Step 2: Run `npm install`**

Run: `npm install`

**Step 3: Verify typecheck passes**

Run: `npx turbo typecheck`
Expected: All packages pass

**Step 4: Commit**

```bash
git add packages/
git commit -m "feat: scaffold all feature packages (map, recipes, browse, tasks, terminal, users, apps)"
```

---

## Phase 2: Shared Infrastructure

### Task 6: HTTP Client (RxJS ajax)

**Files:**
- Create: `packages/shared/src/api/httpClient.ts`
- Create: `packages/shared/src/api/httpClient.test.ts`
- Create: `packages/shared/src/api/types.ts`
- Create: `packages/shared/src/api/index.ts`

**Step 1: Write the failing test**

```typescript
// packages/shared/src/api/httpClient.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { firstValueFrom } from 'rxjs'
import { get$, post$, put$, del$ } from './httpClient'

// Mock XMLHttpRequest for RxJS ajax
const mockXHR = {
  open: vi.fn(),
  send: vi.fn(),
  setRequestHeader: vi.fn(),
  readyState: 4,
  status: 200,
  response: JSON.stringify({ id: '1', name: 'test' }),
  responseType: '',
  onreadystatechange: null as (() => void) | null,
  getAllResponseHeaders: vi.fn(() => 'content-type: application/json'),
}

beforeEach(() => {
  vi.stubGlobal('XMLHttpRequest', vi.fn(() => mockXHR))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('httpClient', () => {
  describe('get$', () => {
    it('makes GET request and returns parsed response', async () => {
      const promise = firstValueFrom(get$<{ id: string }>('/api/test'))

      // Trigger XHR response
      mockXHR.onreadystatechange?.()

      const result = await promise
      expect(result).toEqual({ id: '1', name: 'test' })
      expect(mockXHR.open).toHaveBeenCalledWith('GET', '/api/test')
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/shared && npx vitest run src/api/httpClient.test.ts`
Expected: FAIL — module not found

**Step 3: Create types**

```typescript
// packages/shared/src/api/types.ts
export interface RequestOptions {
  headers?: Record<string, string>
  params?: Record<string, string | number | boolean>
  signal?: AbortSignal
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly response: unknown,
  ) {
    super(`API Error ${status}: ${statusText}`)
    this.name = 'ApiError'
  }
}
```

**Step 4: Implement httpClient**

```typescript
// packages/shared/src/api/httpClient.ts
import { ajax, AjaxError } from 'rxjs/ajax'
import { Observable, throwError } from 'rxjs'
import { catchError, map, retry } from 'rxjs/operators'

import { ApiError, type RequestOptions } from './types'

const BASE_URL = typeof import.meta !== 'undefined'
  ? (import.meta.env?.VITE_API_URL as string | undefined) ?? ''
  : ''

function buildUrl(path: string, params?: Record<string, string | number | boolean>): string {
  const url = `${BASE_URL}${path}`
  if (!params) return url
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    searchParams.set(key, String(value))
  }
  return `${url}?${searchParams.toString()}`
}

function handleError(error: AjaxError): Observable<never> {
  return throwError(() => new ApiError(error.status, error.message, error.response))
}

export function get$<T>(path: string, options?: RequestOptions): Observable<T> {
  return ajax.getJSON<T>(buildUrl(path, options?.params), options?.headers).pipe(
    catchError(handleError),
  )
}

export function post$<T>(path: string, body?: unknown, options?: RequestOptions): Observable<T> {
  return ajax<T>({
    url: buildUrl(path, options?.params),
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body,
  }).pipe(
    map((response) => response.response),
    catchError(handleError),
  )
}

export function put$<T>(path: string, body?: unknown, options?: RequestOptions): Observable<T> {
  return ajax<T>({
    url: buildUrl(path, options?.params),
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body,
  }).pipe(
    map((response) => response.response),
    catchError(handleError),
  )
}

export function del$<T>(path: string, options?: RequestOptions): Observable<T> {
  return ajax<T>({
    url: buildUrl(path, options?.params),
    method: 'DELETE',
    headers: options?.headers,
  }).pipe(
    map((response) => response.response),
    catchError(handleError),
  )
}
```

**Step 5: Create barrel export**

```typescript
// packages/shared/src/api/index.ts
export { get$, post$, put$, del$ } from './httpClient'
export { ApiError, type RequestOptions } from './types'
```

**Step 6: Run tests**

Run: `cd packages/shared && npx vitest run src/api/httpClient.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/shared/src/api/
git commit -m "feat(shared): add RxJS-based HTTP client with typed get$, post$, put$, del$"
```

---

### Task 7: User Store (Zustand)

**Files:**
- Create: `packages/shared/src/stores/userStore.ts`
- Create: `packages/shared/src/stores/userStore.test.ts`
- Create: `packages/shared/src/stores/index.ts`
- Create: `packages/shared/src/types/user.ts`

**Step 1: Write the failing test**

```typescript
// packages/shared/src/stores/userStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useUserStore } from './userStore'

describe('userStore', () => {
  beforeEach(() => {
    useUserStore.setState({
      currentUser: null,
      budgetExceeded: false,
      initialized: false,
    })
  })

  it('initializes with null user', () => {
    const state = useUserStore.getState()
    expect(state.currentUser).toBeNull()
    expect(state.initialized).toBe(false)
  })

  it('sets user and marks initialized', () => {
    const user = { id: '1', name: 'Test User', email: 'test@sepal.io', admin: false }
    useUserStore.getState().setUser(user)

    const state = useUserStore.getState()
    expect(state.currentUser).toEqual(user)
    expect(state.initialized).toBe(true)
  })

  it('clears user on logout', () => {
    useUserStore.getState().setUser({ id: '1', name: 'Test', email: 'test@sepal.io', admin: false })
    useUserStore.getState().logout()

    expect(useUserStore.getState().currentUser).toBeNull()
    expect(useUserStore.getState().initialized).toBe(true)
  })

  it('tracks budget exceeded state', () => {
    useUserStore.getState().setBudgetExceeded(true)
    expect(useUserStore.getState().budgetExceeded).toBe(true)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/shared && npx vitest run src/stores/userStore.test.ts`
Expected: FAIL

**Step 3: Create user types**

```typescript
// packages/shared/src/types/user.ts
export interface User {
  id: string
  name: string
  email: string
  admin: boolean
  googleTokens?: GoogleTokens
  status?: UserStatus
}

export interface GoogleTokens {
  accessToken: string
  refreshToken?: string
}

export type UserStatus = 'ACTIVE' | 'PENDING' | 'LOCKED' | 'BUDGET_EXCEEDED'
```

**Step 4: Implement user store**

```typescript
// packages/shared/src/stores/userStore.ts
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

import type { User } from '../types/user'

interface UserState {
  currentUser: User | null
  budgetExceeded: boolean
  initialized: boolean

  setUser: (user: User) => void
  logout: () => void
  setBudgetExceeded: (exceeded: boolean) => void
}

export const useUserStore = create<UserState>()(
  devtools(
    (set) => ({
      currentUser: null,
      budgetExceeded: false,
      initialized: false,

      setUser: (user) => set({ currentUser: user, initialized: true }),
      logout: () => set({ currentUser: null, budgetExceeded: false }),
      setBudgetExceeded: (exceeded) => set({ budgetExceeded: exceeded }),
    }),
    { name: 'sepal-user' },
  ),
)
```

**Step 5: Run tests**

Run: `cd packages/shared && npx vitest run src/stores/userStore.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/shared/src/stores/ packages/shared/src/types/
git commit -m "feat(shared): add Zustand user store with typed User model"
```

---

### Task 8: Notification Store (Zustand)

**Files:**
- Create: `packages/shared/src/stores/notificationStore.ts`
- Create: `packages/shared/src/stores/notificationStore.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/shared/src/stores/notificationStore.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useNotificationStore } from './notificationStore'

describe('notificationStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useNotificationStore.setState({ notifications: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('adds a notification', () => {
    useNotificationStore.getState().notify('success', 'Recipe saved')
    const notifications = useNotificationStore.getState().notifications
    expect(notifications).toHaveLength(1)
    expect(notifications[0]?.type).toBe('success')
    expect(notifications[0]?.message).toBe('Recipe saved')
  })

  it('auto-dismisses after duration', () => {
    useNotificationStore.getState().notify('info', 'Loading...', 3000)
    expect(useNotificationStore.getState().notifications).toHaveLength(1)

    vi.advanceTimersByTime(3000)
    expect(useNotificationStore.getState().notifications).toHaveLength(0)
  })

  it('manually dismisses a notification', () => {
    useNotificationStore.getState().notify('error', 'Failed', 0) // duration=0 means no auto-dismiss
    const id = useNotificationStore.getState().notifications[0]!.id

    useNotificationStore.getState().dismiss(id)
    expect(useNotificationStore.getState().notifications).toHaveLength(0)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/shared && npx vitest run src/stores/notificationStore.test.ts`
Expected: FAIL

**Step 3: Implement notification store**

```typescript
// packages/shared/src/stores/notificationStore.ts
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

export type NotificationType = 'success' | 'error' | 'warning' | 'info'

export interface Notification {
  id: string
  type: NotificationType
  message: string
  duration: number
}

interface NotificationState {
  notifications: Notification[]
  notify: (type: NotificationType, message: string, duration?: number) => void
  dismiss: (id: string) => void
}

export const useNotificationStore = create<NotificationState>()(
  devtools(
    (set) => ({
      notifications: [],

      notify: (type, message, duration = 5000) => {
        const id = crypto.randomUUID()
        set((s) => ({
          notifications: [...s.notifications, { id, type, message, duration }],
        }))
        if (duration > 0) {
          setTimeout(() => {
            set((s) => ({
              notifications: s.notifications.filter((n) => n.id !== id),
            }))
          }, duration)
        }
      },

      dismiss: (id) =>
        set((s) => ({
          notifications: s.notifications.filter((n) => n.id !== id),
        })),
    }),
    { name: 'sepal-notifications' },
  ),
)
```

**Step 4: Run tests**

Run: `cd packages/shared && npx vitest run src/stores/notificationStore.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/shared/src/stores/notificationStore*
git commit -m "feat(shared): add notification store with auto-dismiss"
```

---

### Task 9: i18n Setup (i18next)

**Files:**
- Create: `packages/shared/src/i18n/setup.ts`
- Create: `packages/shared/src/i18n/index.ts`
- Create: `packages/shared/src/i18n/setup.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/shared/src/i18n/setup.test.ts
import { describe, it, expect } from 'vitest'
import { initI18n } from './setup'

describe('i18n setup', () => {
  it('initializes with English as fallback', async () => {
    const i18n = await initI18n()
    expect(i18n.language).toMatch(/en/)
    expect(i18n.options.fallbackLng).toContain('en')
  })

  it('supports expected namespaces', async () => {
    const i18n = await initI18n()
    const ns = i18n.options.ns
    expect(ns).toContain('common')
    expect(ns).toContain('recipes')
    expect(ns).toContain('map')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/shared && npx vitest run src/i18n/setup.test.ts`
Expected: FAIL

**Step 3: Implement i18n setup**

```typescript
// packages/shared/src/i18n/setup.ts
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import HttpBackend from 'i18next-http-backend'
import LanguageDetector from 'i18next-browser-languagedetector'

const SUPPORTED_LANGUAGES = ['en', 'es', 'fr', 'pt', 'it', 'ru', 'sv', 'ar', 'zh'] as const
const NAMESPACES = ['common', 'recipes', 'map', 'browse', 'tasks', 'users', 'apps'] as const

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]
export type Namespace = (typeof NAMESPACES)[number]

export async function initI18n() {
  await i18n
    .use(HttpBackend)
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      fallbackLng: 'en',
      supportedLngs: [...SUPPORTED_LANGUAGES],
      ns: [...NAMESPACES],
      defaultNS: 'common',
      backend: {
        loadPath: '/locales/{{lng}}/{{ns}}.json',
      },
      interpolation: {
        escapeValue: false,
      },
      detection: {
        order: ['navigator', 'htmlTag'],
      },
    })

  return i18n
}
```

```typescript
// packages/shared/src/i18n/index.ts
export { initI18n, type SupportedLanguage, type Namespace } from './setup'
```

**Step 4: Run tests**

Run: `cd packages/shared && npx vitest run src/i18n/setup.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/shared/src/i18n/
git commit -m "feat(shared): add i18next setup with 9 languages and feature namespaces"
```

---

### Task 10: Error Boundaries & Error Types

**Files:**
- Create: `packages/shared/src/errors/ErrorBoundary.tsx`
- Create: `packages/shared/src/errors/ErrorFallback.tsx`
- Create: `packages/shared/src/errors/ErrorFallback.module.css`
- Create: `packages/shared/src/errors/index.ts`

**Step 1: Implement FeatureErrorBoundary**

```typescript
// packages/shared/src/errors/ErrorBoundary.tsx
import { type ReactNode } from 'react'
import { ErrorBoundary as ReactErrorBoundary } from 'react-error-boundary'

import { ErrorFallback } from './ErrorFallback'

interface FeatureErrorBoundaryProps {
  feature: string
  children: ReactNode
}

export function FeatureErrorBoundary({ feature, children }: FeatureErrorBoundaryProps) {
  return (
    <ReactErrorBoundary
      fallbackRender={({ error, resetErrorBoundary }) => (
        <ErrorFallback
          title={`${feature} encountered an error`}
          error={error instanceof Error ? error : new Error(String(error))}
          onRetry={resetErrorBoundary}
        />
      )}
      onError={(error) => {
        console.error(`[${feature}] Uncaught error:`, error)
      }}
    >
      {children}
    </ReactErrorBoundary>
  )
}
```

**Step 2: Implement ErrorFallback**

```typescript
// packages/shared/src/errors/ErrorFallback.tsx
import styles from './ErrorFallback.module.css'

interface ErrorFallbackProps {
  title: string
  error: Error
  onRetry: () => void
}

export function ErrorFallback({ title, error, onRetry }: ErrorFallbackProps) {
  return (
    <div className={styles.container}>
      <h2 className={styles.title}>{title}</h2>
      <pre className={styles.message}>{error.message}</pre>
      <button className={styles.retryButton} onClick={onRetry}>
        Try again
      </button>
    </div>
  )
}
```

**Step 3: Create CSS module**

```css
/* packages/shared/src/errors/ErrorFallback.module.css */
.container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  gap: 1rem;
}

.title {
  font-size: 1.25rem;
  color: var(--color-error, #e53e3e);
}

.message {
  font-size: 0.875rem;
  color: var(--color-text-secondary, #666);
  max-width: 500px;
  overflow-x: auto;
}

.retryButton {
  padding: 0.5rem 1rem;
  border: 1px solid var(--color-border, #ccc);
  border-radius: 4px;
  background: var(--color-surface, #fff);
  cursor: pointer;
}

.retryButton:hover {
  background: var(--color-surface-hover, #f5f5f5);
}
```

**Step 4: Create barrel export**

```typescript
// packages/shared/src/errors/index.ts
export { FeatureErrorBoundary } from './ErrorBoundary'
export { ErrorFallback } from './ErrorFallback'
```

**Step 5: Commit**

```bash
git add packages/shared/src/errors/
git commit -m "feat(shared): add FeatureErrorBoundary with ErrorFallback component"
```

---

### Task 11: Utility Functions (format, coords, guid)

**Files:**
- Create: `packages/shared/src/utils/format.ts`
- Create: `packages/shared/src/utils/format.test.ts`
- Create: `packages/shared/src/utils/coords.ts`
- Create: `packages/shared/src/utils/coords.test.ts`
- Create: `packages/shared/src/utils/guid.ts`
- Create: `packages/shared/src/utils/index.ts`

These should be ported from the existing codebase's utility files. The current implementations live in:
- `modules/gui/src/format.js` — number/area/date formatting
- `modules/gui/src/coords.js` — coordinate transformations
- `modules/gui/src/guid.js` — UUID generation

**Step 1: Write failing tests for format utilities**

```typescript
// packages/shared/src/utils/format.test.ts
import { describe, it, expect } from 'vitest'
import { formatNumber, formatFileSize, formatDuration } from './format'

describe('formatNumber', () => {
  it('formats integers with locale separators', () => {
    expect(formatNumber(15000)).toBe('15,000')
  })

  it('formats decimals', () => {
    expect(formatNumber(3.14159, 2)).toBe('3.14')
  })

  it('handles zero', () => {
    expect(formatNumber(0)).toBe('0')
  })
})

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(500)).toBe('500 B')
  })

  it('formats kilobytes', () => {
    expect(formatFileSize(1536)).toBe('1.5 KB')
  })

  it('formats megabytes', () => {
    expect(formatFileSize(5242880)).toBe('5 MB')
  })
})

describe('formatDuration', () => {
  it('formats seconds', () => {
    expect(formatDuration(45)).toBe('45s')
  })

  it('formats minutes and seconds', () => {
    expect(formatDuration(125)).toBe('2m 5s')
  })

  it('formats hours', () => {
    expect(formatDuration(3661)).toBe('1h 1m 1s')
  })
})
```

**Step 2: Run to verify failure, implement, run to verify pass**

Port logic from existing `format.js`, converting to TypeScript with proper types.

**Step 3: Write failing tests for coords, implement, verify**

Port from existing `coords.js`.

**Step 4: Create guid utility**

```typescript
// packages/shared/src/utils/guid.ts
export function guid(): string {
  return crypto.randomUUID()
}
```

**Step 5: Create barrel export and commit**

```bash
git add packages/shared/src/utils/
git commit -m "feat(shared): add format, coords, and guid utility functions"
```

---

### Task 12: Update shared/index.ts barrel exports

**Files:**
- Modify: `packages/shared/src/index.ts`

**Step 1: Export all public APIs**

```typescript
// packages/shared/src/index.ts
export { get$, post$, put$, del$, ApiError, type RequestOptions } from './api'
export { useUserStore } from './stores/userStore'
export { useNotificationStore, type NotificationType, type Notification } from './stores/notificationStore'
export { initI18n, type SupportedLanguage, type Namespace } from './i18n'
export { FeatureErrorBoundary, ErrorFallback } from './errors'
export { formatNumber, formatFileSize, formatDuration } from './utils/format'
export { guid } from './utils/guid'
export type { User, UserStatus, GoogleTokens } from './types/user'
```

**Step 2: Run full shared test suite**

Run: `cd packages/shared && npx vitest run`
Expected: All tests pass

**Step 3: Run typecheck**

Run: `cd packages/shared && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat(shared): consolidate barrel exports for all shared modules"
```

---

## Phase 3: UI Design System

### Task 13: CSS Variables & Global Styles

**Files:**
- Create: `packages/ui/src/styles/variables.css`
- Create: `packages/ui/src/styles/reset.css`
- Create: `packages/ui/src/styles/global.css`

**Step 1: Create CSS custom properties**

```css
/* packages/ui/src/styles/variables.css */
:root {
  /* Colors — ported from existing SEPAL theme */
  --color-primary: #2196f3;
  --color-primary-hover: #1976d2;
  --color-primary-light: #e3f2fd;
  --color-secondary: #ff9800;
  --color-error: #f44336;
  --color-warning: #ff9800;
  --color-success: #4caf50;
  --color-info: #2196f3;

  /* Surfaces */
  --color-background: #1a1a2e;
  --color-surface: #16213e;
  --color-surface-hover: #1e2d4d;
  --color-surface-active: #263855;

  /* Text */
  --color-text-primary: #e0e0e0;
  --color-text-secondary: #a0a0a0;
  --color-text-disabled: #666;
  --color-text-on-primary: #ffffff;

  /* Borders */
  --color-border: #333;
  --color-border-focus: var(--color-primary);

  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;

  /* Typography */
  --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-size-xs: 0.75rem;
  --font-size-sm: 0.875rem;
  --font-size-md: 1rem;
  --font-size-lg: 1.25rem;
  --font-size-xl: 1.5rem;

  /* Borders & Radius */
  --border-radius-sm: 4px;
  --border-radius-md: 8px;
  --border-radius-lg: 12px;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.3);

  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-normal: 250ms ease;
}
```

**Step 2: Create reset and global styles (ported from existing)**

**Step 3: Commit**

```bash
git add packages/ui/src/styles/
git commit -m "feat(ui): add CSS variables, reset, and global styles"
```

---

### Task 14: Button Component

**Files:**
- Create: `packages/ui/src/components/Button/Button.tsx`
- Create: `packages/ui/src/components/Button/Button.module.css`
- Create: `packages/ui/src/components/Button/Button.test.tsx`
- Create: `packages/ui/src/components/Button/index.ts`

**Step 1: Write failing test**

```typescript
// packages/ui/src/components/Button/Button.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

import { Button } from './Button'

describe('Button', () => {
  it('renders with label', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument()
  })

  it('calls onClick', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Click</Button>)
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Disabled</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('shows spinner when loading', () => {
    render(<Button loading>Loading</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('applies variant class', () => {
    render(<Button variant="primary">Primary</Button>)
    expect(screen.getByRole('button')).toHaveClass(/primary/)
  })
})
```

**Step 2: Run to verify failure**

**Step 3: Implement Button**

```typescript
// packages/ui/src/components/Button/Button.tsx
import { type ButtonHTMLAttributes, type ReactNode } from 'react'

import styles from './Button.module.css'

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: ReactNode
  children?: ReactNode
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  children,
  className,
  ...props
}: ButtonProps) {
  const classNames = [
    styles.button,
    styles[variant],
    styles[size],
    loading ? styles.loading : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button className={classNames} disabled={disabled || loading} {...props}>
      {loading && <span className={styles.spinner} />}
      {icon && <span className={styles.icon}>{icon}</span>}
      {children && <span className={styles.label}>{children}</span>}
    </button>
  )
}
```

**Step 4: Create CSS module, run tests, commit**

```bash
git add packages/ui/src/components/Button/
git commit -m "feat(ui): add Button component with variants, sizes, loading state"
```

---

### Task 15-20: Remaining UI Components

Follow the same TDD pattern for each component group. Tasks listed here for brevity — each follows the same write-test → fail → implement → pass → commit cycle:

**Task 15: Form Components** — Input, Select, Checkbox, FormField
- `packages/ui/src/components/Form/Input.tsx` + test + CSS
- `packages/ui/src/components/Form/Select.tsx` + test + CSS
- `packages/ui/src/components/Form/Checkbox.tsx` + test + CSS
- `packages/ui/src/components/Form/FormField.tsx` + test + CSS (wraps label + input + error)

**Task 16: Layout Components** — Panel, Modal, Tabs, Toolbar, ScrollableContainer
- Reference existing implementations in `modules/gui/src/widget/panel/`, `modules/gui/src/widget/tabs/`

**Task 17: Feedback Components** — Spinner, Toast, Confirm, NoData
- Toast reads from `useNotificationStore`

**Task 18: Data Components** — Table, Legend, SearchBox, Tree
- Tree replaces custom `sTree` with recursive component

**Task 19: UI Hooks** — useMediaQuery, useDebounce, useClickOutside, useKeyboard
- Each with unit tests

**Task 20: UI Barrel Exports**
- `packages/ui/src/index.ts` exports all public components and hooks
- Run full test suite: `cd packages/ui && npx vitest run`
- Commit

---

## Phase 4: App Shell & Routing

### Task 21: TanStack Router Setup

**Files:**
- Modify: `packages/app/src/main.tsx`
- Create: `packages/app/src/routes/__root.tsx`
- Create: `packages/app/src/routes/index.tsx`
- Create: `packages/app/src/providers/QueryProvider.tsx`
- Create: `packages/app/src/providers/I18nProvider.tsx`
- Create: `packages/app/src/layouts/AppLayout.tsx`
- Create: `packages/app/src/layouts/AppLayout.module.css`

**Step 1: Create QueryProvider**

```typescript
// packages/app/src/providers/QueryProvider.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
          },
        },
      }),
  )

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
```

**Step 2: Create root route with auth guard**

```typescript
// packages/app/src/routes/__root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { useUserStore } from '@sepal/shared'
import { AppLayout } from '~/layouts/AppLayout'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  const initialized = useUserStore((s) => s.initialized)
  const currentUser = useUserStore((s) => s.currentUser)

  if (!initialized) return <div>Loading...</div>
  if (!currentUser) return <LandingPage />

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  )
}

function LandingPage() {
  return <div>Welcome to SEPAL. Please log in.</div>
}
```

**Step 3: Create index route**

```typescript
// packages/app/src/routes/index.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Dashboard,
})

function Dashboard() {
  return <div>SEPAL Dashboard</div>
}
```

**Step 4: Create AppLayout**

```typescript
// packages/app/src/layouts/AppLayout.tsx
import { type ReactNode } from 'react'
import { FeatureErrorBoundary } from '@sepal/shared'

import styles from './AppLayout.module.css'

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.layout}>
      <nav className={styles.sidebar}>
        {/* Menu component goes here */}
      </nav>
      <main className={styles.content}>
        <FeatureErrorBoundary feature="Main Content">
          {children}
        </FeatureErrorBoundary>
      </main>
      <footer className={styles.footer}>
        {/* Footer component goes here */}
      </footer>
    </div>
  )
}
```

**Step 5: Wire up main.tsx**

```typescript
// packages/app/src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { initI18n } from '@sepal/shared'

import { QueryProvider } from './providers/QueryProvider'
import { routeTree } from './routeTree.gen'

import '@sepal/ui/styles/reset.css'
import '@sepal/ui/styles/variables.css'
import '@sepal/ui/styles/global.css'

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

async function bootstrap() {
  await initI18n()

  const root = document.getElementById('root')
  if (!root) throw new Error('Root element not found')

  createRoot(root).render(
    <StrictMode>
      <QueryProvider>
        <RouterProvider router={router} />
      </QueryProvider>
    </StrictMode>,
  )
}

bootstrap()
```

**Step 6: Verify dev server starts**

Run: `cd packages/app && npx vite`
Expected: Dev server starts, renders "SEPAL Dashboard" at `/`

**Step 7: Commit**

```bash
git add packages/app/
git commit -m "feat(app): set up TanStack Router, QueryProvider, AppLayout shell"
```

---

### Task 22: Feature Route Stubs

**Files:**
- Create: `packages/app/src/routes/process/index.tsx`
- Create: `packages/app/src/routes/process/$recipeId.tsx`
- Create: `packages/app/src/routes/browse/index.tsx`
- Create: `packages/app/src/routes/tasks/index.tsx`
- Create: `packages/app/src/routes/terminal/index.tsx`
- Create: `packages/app/src/routes/apps/index.tsx`
- Create: `packages/app/src/routes/users/index.tsx`

**Step 1: Create stub route for each feature**

Each stub renders a placeholder that will be replaced with the real feature component:

```typescript
// packages/app/src/routes/process/index.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/process/')({
  component: () => <div>Recipe List — TODO</div>,
})
```

```typescript
// packages/app/src/routes/process/$recipeId.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/process/$recipeId')({
  component: RecipeEditorRoute,
})

function RecipeEditorRoute() {
  const { recipeId } = Route.useParams()
  return <div>Recipe Editor for {recipeId} — TODO</div>
}
```

Repeat for browse, tasks, terminal, apps, users.

**Step 2: Add navigation menu**

Create a basic `Menu` component in `packages/app/src/components/Menu.tsx` with `<Link>` components for each route.

**Step 3: Verify all routes work**

Run: `cd packages/app && npx vite`
Navigate to each route manually.

**Step 4: Commit**

```bash
git add packages/app/src/routes/ packages/app/src/components/
git commit -m "feat(app): add stub routes for all features with navigation menu"
```

---

## Phase 5: Map Package

### Task 23: Map Store (Zustand)

**Files:**
- Create: `packages/map/src/stores/mapStore.ts`
- Create: `packages/map/src/stores/mapStore.test.ts`
- Create: `packages/map/src/types.ts`

**Step 1: Write failing test**

```typescript
// packages/map/src/stores/mapStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useMapStore } from './mapStore'

describe('mapStore', () => {
  beforeEach(() => {
    useMapStore.setState({
      viewport: { longitude: 0, latitude: 0, zoom: 3 },
      layers: [],
      activeLayerId: null,
    })
  })

  it('updates viewport', () => {
    useMapStore.getState().setViewport({ longitude: 10, latitude: 20, zoom: 5 })
    expect(useMapStore.getState().viewport).toEqual({ longitude: 10, latitude: 20, zoom: 5 })
  })

  it('adds a layer', () => {
    useMapStore.getState().addLayer({ id: 'layer-1', type: 'raster', name: 'EE Layer', visible: true })
    expect(useMapStore.getState().layers).toHaveLength(1)
  })

  it('removes a layer', () => {
    useMapStore.getState().addLayer({ id: 'layer-1', type: 'raster', name: 'Test', visible: true })
    useMapStore.getState().removeLayer('layer-1')
    expect(useMapStore.getState().layers).toHaveLength(0)
  })

  it('reorders layers', () => {
    useMapStore.getState().addLayer({ id: 'a', type: 'raster', name: 'A', visible: true })
    useMapStore.getState().addLayer({ id: 'b', type: 'raster', name: 'B', visible: true })
    useMapStore.getState().reorderLayers(0, 1)
    expect(useMapStore.getState().layers[0]?.id).toBe('b')
  })
})
```

**Step 2: Implement, test, commit**

```bash
git add packages/map/src/
git commit -m "feat(map): add map store with viewport, layer management, reordering"
```

---

### Task 24: MapView Component (react-map-gl + MapLibre)

**Files:**
- Create: `packages/map/src/components/MapView.tsx`
- Create: `packages/map/src/components/MapView.module.css`
- Create: `packages/map/src/components/MapLayer.tsx`
- Create: `packages/map/src/components/LayerPanel.tsx`

**Step 1: Implement MapView**

```typescript
// packages/map/src/components/MapView.tsx
import Map, { NavigationControl, ScaleControl } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'

import { useMapStore } from '../stores/mapStore'
import { MapLayer } from './MapLayer'
import styles from './MapView.module.css'

const DEFAULT_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

export function MapView() {
  const viewport = useMapStore((s) => s.viewport)
  const layers = useMapStore((s) => s.layers)
  const setViewport = useMapStore((s) => s.setViewport)

  return (
    <div className={styles.container}>
      <Map
        {...viewport}
        onMove={(e) => setViewport(e.viewState)}
        mapStyle={DEFAULT_STYLE}
        style={{ width: '100%', height: '100%' }}
      >
        <NavigationControl position="top-right" />
        <ScaleControl position="bottom-left" />
        {layers
          .filter((l) => l.visible)
          .map((layer) => (
            <MapLayer key={layer.id} layer={layer} />
          ))}
      </Map>
    </div>
  )
}
```

**Step 2: Implement MapLayer switcher (delegates to layer-type-specific components)**

**Step 3: Commit**

```bash
git add packages/map/src/components/
git commit -m "feat(map): add MapView with MapLibre GL, navigation controls, layer rendering"
```

---

### Task 25: Earth Engine Layer Adapter

**Files:**
- Create: `packages/map/src/layers/EarthEngineLayer.tsx`
- Create: `packages/map/src/layers/types.ts`

**Step 1: Implement EE raster tile layer**

Port logic from existing `modules/gui/src/app/home/map/imageLayerSource/` — the EE tile URL pattern and source management.

```typescript
// packages/map/src/layers/EarthEngineLayer.tsx
import { useEffect } from 'react'
import { useMap } from 'react-map-gl/maplibre'

interface EELayerProps {
  id: string
  mapId: string
  urlTemplate: string
  opacity?: number
}

export function EarthEngineLayer({ id, mapId, urlTemplate, opacity = 1 }: EELayerProps) {
  const { current: mapRef } = useMap()

  useEffect(() => {
    if (!mapRef) return
    const map = mapRef.getMap()
    const sourceId = `ee-source-${id}`
    const layerId = `ee-layer-${id}`

    map.addSource(sourceId, {
      type: 'raster',
      tiles: [urlTemplate],
      tileSize: 256,
    })

    map.addLayer({
      id: layerId,
      type: 'raster',
      source: sourceId,
      paint: { 'raster-opacity': opacity },
    })

    return () => {
      if (map.getLayer(layerId)) map.removeLayer(layerId)
      if (map.getSource(sourceId)) map.removeSource(sourceId)
    }
  }, [id, mapId, urlTemplate, mapRef, opacity])

  return null
}
```

**Step 2: Create Planet and WMTS layer adapters (same pattern)**

**Step 3: Commit**

```bash
git add packages/map/src/layers/
git commit -m "feat(map): add EarthEngine, Planet, and WMTS layer adapters for MapLibre"
```

---

### Task 26: Map Package Barrel Exports

**Files:**
- Modify: `packages/map/src/index.ts`

**Step 1: Export all public APIs**

```typescript
export { MapView } from './components/MapView'
export { LayerPanel } from './components/LayerPanel'
export { EarthEngineLayer } from './layers/EarthEngineLayer'
export { useMapStore } from './stores/mapStore'
export type { ViewState, MapLayer, LayerType } from './types'
```

**Step 2: Run tests**

Run: `cd packages/map && npx vitest run`

**Step 3: Commit**

```bash
git add packages/map/src/index.ts
git commit -m "feat(map): consolidate map package exports"
```

---

## Phase 6: Recipe Package

### Task 27: Recipe Types & Registry

**Files:**
- Create: `packages/recipes/src/types/recipe.ts`
- Create: `packages/recipes/src/types/models.ts`
- Create: `packages/recipes/src/types/registry.ts`
- Create: `packages/recipes/src/types/registry.test.ts`

**Step 1: Define recipe type union and model discriminated union**

Port all 20+ recipe types from existing `modules/gui/src/app/home/body/process/recipe.js` and related files. Each recipe type gets an explicit TypeScript interface for its model.

**Step 2: Create registry with compile-time exhaustive check**

```typescript
// packages/recipes/src/types/registry.ts
import type { RecipeType, RecipeModel } from './recipe'

interface RecipeTypeDefinition<T extends RecipeType> {
  type: T
  label: string
  icon: string
  defaultModel: () => RecipeModel<T>
}

// This const assertion ensures every RecipeType has an entry
export const RECIPE_REGISTRY: { [T in RecipeType]: RecipeTypeDefinition<T> } = {
  MOSAIC: {
    type: 'MOSAIC',
    label: 'Optical Mosaic',
    icon: 'satellite',
    defaultModel: () => ({ sources: [], dates: null, compositing: 'MEDOID', bands: [] }),
  },
  // ... all types
} as const
```

**Step 3: Test registry is exhaustive**

```typescript
// packages/recipes/src/types/registry.test.ts
import { describe, it, expect } from 'vitest'
import { RECIPE_REGISTRY } from './registry'

describe('RECIPE_REGISTRY', () => {
  it('has a defaultModel factory for every type', () => {
    for (const [type, definition] of Object.entries(RECIPE_REGISTRY)) {
      expect(definition.type).toBe(type)
      expect(typeof definition.defaultModel).toBe('function')
      expect(definition.defaultModel()).toBeDefined()
    }
  })
})
```

**Step 4: Commit**

```bash
git add packages/recipes/src/types/
git commit -m "feat(recipes): add type-safe recipe type registry with all 20+ recipe types"
```

---

### Task 28: Recipe API Queries (TanStack Query + RxJS)

**Files:**
- Create: `packages/recipes/src/api.ts`
- Create: `packages/recipes/src/api.test.ts`

**Step 1: Write query definitions**

```typescript
// packages/recipes/src/api.ts
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { firstValueFrom, fromEvent } from 'rxjs'
import { takeUntil } from 'rxjs/operators'
import { get$, post$, del$ } from '@sepal/shared'

import type { Recipe } from './types/recipe'

function withCancel<T>(signal: AbortSignal, source$: import('rxjs').Observable<T>) {
  const abort$ = fromEvent(signal, 'abort')
  return firstValueFrom(source$.pipe(takeUntil(abort$)))
}

export const recipeQueries = {
  all: () =>
    queryOptions({
      queryKey: ['recipes'],
      queryFn: ({ signal }) => withCancel(signal, get$<Recipe[]>('/api/recipe/all')),
    }),

  detail: (id: string) =>
    queryOptions({
      queryKey: ['recipes', id],
      queryFn: ({ signal }) => withCancel(signal, get$<Recipe>(`/api/recipe/${id}`)),
      staleTime: 30_000,
    }),
}

export function useSaveRecipe() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (recipe: Recipe) => firstValueFrom(post$('/api/recipe/save', recipe)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recipes'] }),
  })
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => firstValueFrom(del$(`/api/recipe/${id}`)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recipes'] }),
  })
}
```

**Step 2: Commit**

```bash
git add packages/recipes/src/api*
git commit -m "feat(recipes): add TanStack Query definitions with RxJS ajax transport"
```

---

### Task 29: Recipe Editor Store (undo/redo)

**Files:**
- Create: `packages/recipes/src/stores/recipeEditorStore.ts`
- Create: `packages/recipes/src/stores/recipeEditorStore.test.ts`

**Step 1: Write failing tests (undo, redo, dirty tracking)**

**Step 2: Implement store** (as shown in design doc)

**Step 3: Commit**

```bash
git add packages/recipes/src/stores/
git commit -m "feat(recipes): add recipe editor store with undo/redo and dirty tracking"
```

---

### Task 30: Recipe Editor Component

**Files:**
- Create: `packages/recipes/src/components/RecipeEditor.tsx`
- Create: `packages/recipes/src/components/RecipeEditor.module.css`
- Create: `packages/recipes/src/components/RecipeList.tsx`
- Create: `packages/recipes/src/components/PanelSidebar.tsx`

**Step 1: Implement RecipeEditor with panel sidebar and map**

**Step 2: Implement RecipeList with TanStack Query**

**Step 3: Wire into app route (replace stub)**

```typescript
// packages/app/src/routes/process/$recipeId.tsx
import { createFileRoute } from '@tanstack/react-router'
import { RecipeEditor } from '@sepal/recipes'
import { recipeQueries } from '@sepal/recipes'

export const Route = createFileRoute('/process/$recipeId')({
  component: RecipeEditorRoute,
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData(recipeQueries.detail(params.recipeId)),
})

function RecipeEditorRoute() {
  const { recipeId } = Route.useParams()
  return <RecipeEditor recipeId={recipeId} />
}
```

**Step 4: Commit**

```bash
git add packages/recipes/src/components/ packages/app/src/routes/process/
git commit -m "feat(recipes): add RecipeEditor, RecipeList, wire into app routes"
```

---

### Task 31: Recipe Panels (AOI, Dates, Sources, etc.)

**Files:**
- Create: `packages/recipes/src/panels/AoiPanel.tsx`
- Create: `packages/recipes/src/panels/DatesPanel.tsx`
- Create: `packages/recipes/src/panels/SourcesPanel.tsx`
- Create: `packages/recipes/src/panels/BandsPanel.tsx`
- Create: `packages/recipes/src/panels/CompositingPanel.tsx`
- (one per recipe configuration panel)

**Step 1: Implement each panel with React Hook Form + Zod validation**

Each panel is a self-contained form that:
- Receives recipe model data as props
- Validates with Zod schema
- Calls `onChange` to update parent

**Step 2: Write integration tests for complex panels (AOI, Dates)**

**Step 3: Commit**

```bash
git add packages/recipes/src/panels/
git commit -m "feat(recipes): add recipe configuration panels with form validation"
```

---

## Phase 7: Remaining Feature Packages

### Task 32: Browse Package (File & Asset Browser)

**Files:**
- Create: `packages/browse/src/api.ts` — TanStack Query for file/asset APIs
- Create: `packages/browse/src/types.ts` — FileNode, Asset types
- Create: `packages/browse/src/components/FileBrowser.tsx`
- Create: `packages/browse/src/components/FileTree.tsx`
- Create: `packages/browse/src/components/FilePreview.tsx`
- Create: `packages/browse/src/components/AssetBrowser.tsx`
- Create: `packages/browse/src/components/UploadDialog.tsx`

Port from: `modules/gui/src/app/home/body/browse/`

**Step 1: Define API queries**

```typescript
export const fileQueries = {
  list: (path: string) => queryOptions({
    queryKey: ['files', path],
    queryFn: ({ signal }) => withCancel(signal, get$<FileNode[]>(`/api/user-files/list`, { params: { path } })),
  }),
}
```

**Step 2: Implement components with TDD, commit**

---

### Task 33: Tasks Package (Task Monitoring)

**Files:**
- Create: `packages/tasks/src/api.ts`
- Create: `packages/tasks/src/types.ts`
- Create: `packages/tasks/src/stores/taskFilterStore.ts`
- Create: `packages/tasks/src/hooks/useTaskPolling.ts` — RxJS interval + switchMap
- Create: `packages/tasks/src/components/TaskList.tsx`
- Create: `packages/tasks/src/components/TaskRow.tsx`
- Create: `packages/tasks/src/components/TaskActions.tsx`

Port from: `modules/gui/src/app/home/body/tasks/`

**Key pattern — RxJS polling for live updates:**

```typescript
// packages/tasks/src/hooks/useTaskPolling.ts
import { useEffect } from 'react'
import { interval, switchMap, retry } from 'rxjs'
import { useQueryClient } from '@tanstack/react-query'
import { get$ } from '@sepal/shared'

export function useTaskPolling(intervalMs = 5000) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const subscription = interval(intervalMs)
      .pipe(
        switchMap(() => get$('/api/tasks/active')),
        retry({ delay: intervalMs }),
      )
      .subscribe((tasks) => {
        queryClient.setQueryData(['tasks', 'active'], tasks)
      })

    return () => subscription.unsubscribe()
  }, [intervalMs, queryClient])
}
```

**Implement with TDD, commit**

---

### Task 34: Terminal Package (Web Terminal)

**Files:**
- Create: `packages/terminal/src/hooks/useTerminalSession.ts` — WebSocket via RxJS
- Create: `packages/terminal/src/components/TerminalView.tsx` — xterm.js wrapper
- Create: `packages/terminal/src/components/TerminalTabs.tsx`

Port from: `modules/gui/src/app/home/body/terminal/`

**Key pattern — RxJS WebSocket:**

```typescript
// packages/terminal/src/hooks/useTerminalSession.ts
import { useEffect, useRef } from 'react'
import { webSocket } from 'rxjs/webSocket'

export function useTerminalSession(sessionId: string) {
  const socket$ = useRef(
    webSocket<string>({
      url: `/api/terminal/ws/${sessionId}`,
      deserializer: (e) => e.data as string,
      serializer: (value) => value,
    })
  )

  useEffect(() => {
    return () => socket$.current.complete()
  }, [])

  return {
    messages$: socket$.current.asObservable(),
    send: (data: string) => socket$.current.next(data),
  }
}
```

**Implement with TDD, commit**

---

### Task 35: Users Package (User Management)

**Files:**
- Create: `packages/users/src/api.ts`
- Create: `packages/users/src/types.ts`
- Create: `packages/users/src/components/UserList.tsx`
- Create: `packages/users/src/components/UserDetail.tsx`
- Create: `packages/users/src/components/BudgetPanel.tsx`

Port from: `modules/gui/src/app/home/body/users/`

**Implement with TDD, commit**

---

### Task 36: Apps Package (App Launcher)

**Files:**
- Create: `packages/apps/src/api.ts`
- Create: `packages/apps/src/types.ts`
- Create: `packages/apps/src/components/AppGrid.tsx`
- Create: `packages/apps/src/components/AppCard.tsx`
- Create: `packages/apps/src/components/AppRunner.tsx` — iframe-based

Port from: `modules/gui/src/app/home/body/apps/`

**Implement with TDD, commit**

---

## Phase 8: Integration, E2E & Deployment

### Task 37: Wire All Features into App Routes

**Files:**
- Modify: All route stubs in `packages/app/src/routes/`

**Step 1: Replace each stub route with real feature component imports**

**Step 2: Add FeatureErrorBoundary around each feature**

**Step 3: Verify all routes render correctly**

**Step 4: Commit**

```bash
git add packages/app/
git commit -m "feat(app): wire all feature packages into app routes"
```

---

### Task 38: Playwright E2E Setup

**Files:**
- Create: `e2e/playwright.config.ts`
- Create: `e2e/package.json`
- Create: `e2e/fixtures/auth.ts` — authenticated page fixture

**Step 1: Set up Playwright**

```typescript
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: 2,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev -w @sepal/app',
    port: 3000,
    reuseExistingServer: true,
  },
})
```

**Step 2: Commit**

```bash
git add e2e/
git commit -m "feat(e2e): set up Playwright with auth fixtures"
```

---

### Task 39: Critical E2E Test Flows

**Files:**
- Create: `e2e/tests/auth.spec.ts`
- Create: `e2e/tests/recipe-workflow.spec.ts`
- Create: `e2e/tests/file-browse.spec.ts`
- Create: `e2e/tests/task-monitor.spec.ts`

**Step 1: Write auth flow test (login → dashboard → logout)**

**Step 2: Write recipe workflow test (create → configure → save)**

**Step 3: Write file browse test (navigate directories, preview file)**

**Step 4: Write task monitor test (view tasks, cancel task)**

**Step 5: Run all E2E tests**

Run: `npx playwright test`

**Step 6: Commit**

```bash
git add e2e/tests/
git commit -m "test(e2e): add critical user flow tests for auth, recipes, browse, tasks"
```

---

### Task 40: Docker & Nginx Configuration

**Files:**
- Create: `Dockerfile`
- Create: `nginx.conf`

**Step 1: Create multi-stage Dockerfile**

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json turbo.json ./
COPY packages/ packages/
RUN npm ci && npx turbo build --filter=@sepal/app

FROM nginx:alpine
COPY --from=build /app/packages/app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**Step 2: Create nginx.conf** (port from existing `modules/gui/nginx.conf`)

**Step 3: Build and test Docker image**

Run: `docker build -t sepal-gui . && docker run -p 8080:80 sepal-gui`

**Step 4: Commit**

```bash
git add Dockerfile nginx.conf
git commit -m "feat: add Docker build and Nginx config for production deployment"
```

---

### Task 41: Translation Files

**Files:**
- Create: `packages/app/public/locales/en/common.json`
- Create: `packages/app/public/locales/en/recipes.json`
- Create: `packages/app/public/locales/en/map.json`
- Create: `packages/app/public/locales/en/browse.json`
- Create: `packages/app/public/locales/en/tasks.json`
- Create: `packages/app/public/locales/en/users.json`
- Create: `packages/app/public/locales/en/apps.json`
- (repeat for all 9 supported languages)

**Step 1: Port translations from existing `modules/gui/src/locale/`**

Split the current monolithic `translations.json` per language into namespaced files per feature.

**Step 2: Verify i18next loads translations correctly**

**Step 3: Commit**

```bash
git add packages/app/public/locales/
git commit -m "feat: add namespaced translation files for all 9 languages"
```

---

### Task 42: Final Integration Verification

**Step 1: Run full test suite**

Run: `npx turbo test`
Expected: All unit + integration tests pass across all packages

**Step 2: Run typecheck**

Run: `npx turbo typecheck`
Expected: No TypeScript errors

**Step 3: Run lint**

Run: `npx turbo lint`
Expected: No lint errors

**Step 4: Run E2E**

Run: `npx playwright test`
Expected: All E2E tests pass

**Step 5: Build production**

Run: `npx turbo build`
Expected: All packages build successfully, `packages/app/dist/` contains the SPA

**Step 6: Final commit**

```bash
git add -A
git commit -m "chore: final integration verification — all tests, typecheck, lint pass"
```

---

## Dependency Graph

```
Phase 1: Foundation (Tasks 1-5)
    │
    ├── Phase 2: Shared (Tasks 6-12)
    │       │
    │       ├── Phase 3: UI (Tasks 13-20)
    │       │       │
    │       │       └──── Phase 4: App Shell (Tasks 21-22)
    │       │
    │       ├── Phase 5: Map (Tasks 23-26)
    │       │
    │       ├── Phase 6: Recipes (Tasks 27-31)  ← depends on Map
    │       │
    │       └── Phase 7: Features (Tasks 32-36) ← can be parallelized
    │               │
    │               └── Phase 8: Integration (Tasks 37-42)
```

**Parallelizable tasks:**
- Tasks 32-36 (Browse, Tasks, Terminal, Users, Apps) are independent
- Tasks 13-20 (UI components) can be parallelized across developers
- Tasks 23-26 (Map) and 27-31 (Recipes) can start once Shared is done
