# SEPAL GUI Greenfield Architecture Design

**Date:** 2026-03-03
**Status:** Approved
**Scope:** Complete greenfield redesign of `modules/gui` with full feature parity

## Constraints

- **Framework:** React (modern, hooks-only)
- **Rendering:** Pure SPA (Vite + no SSR)
- **Backend:** Same REST APIs (no backend changes)
- **Styling:** CSS Modules (`.module.css` files, no change)
- **HTTP transport:** RxJS ajax (kept for cancellation semantics)

---

## 1. Project Structure — Feature-Based Monorepo

```
modules/gui/
├── packages/
│   ├── app/                          # Main SPA shell
│   │   ├── src/
│   │   │   ├── routes/              # Route definitions (TanStack Router)
│   │   │   ├── layouts/             # Layout components (authenticated, public)
│   │   │   ├── providers/           # App-level context providers
│   │   │   └── main.tsx             # Entry point
│   │   ├── index.html
│   │   └── vite.config.ts
│   │
│   ├── ui/                           # Shared design system
│   │   ├── src/
│   │   │   ├── components/          # Button, Input, Modal, Panel, Tabs...
│   │   │   ├── hooks/               # useMediaQuery, useDebounce, etc.
│   │   │   ├── styles/              # Global CSS variables, reset, themes
│   │   │   └── index.ts             # Public API barrel exports
│   │   └── package.json
│   │
│   ├── map/                          # Map & geospatial visualization
│   │   ├── src/
│   │   │   ├── components/          # MapView, LayerPanel, Legend
│   │   │   ├── layers/             # EarthEngine, WMTS, Planet layer adapters
│   │   │   ├── hooks/              # useMap, useLayers, useTileProgress
│   │   │   ├── stores/             # Map-specific state (Zustand)
│   │   │   └── types.ts
│   │   └── package.json
│   │
│   ├── recipes/                      # Recipe creation & editing
│   │   ├── src/
│   │   │   ├── components/          # RecipeEditor, RecipeList, panels
│   │   │   ├── types/              # One file per recipe type definition
│   │   │   ├── panels/             # AoiPanel, DatesPanel, SourcesPanel, etc.
│   │   │   ├── hooks/              # useRecipe, useRecipePanel
│   │   │   ├── stores/             # Recipe editor state (undo/redo)
│   │   │   └── api.ts              # Recipe API queries
│   │   └── package.json
│   │
│   ├── browse/                       # File & asset browsing
│   │   ├── src/
│   │   │   ├── components/          # FileBrowser, FileTree, FilePreview, AssetBrowser, UploadDialog
│   │   │   ├── hooks/              # useFileSystem, useAssets
│   │   │   ├── api.ts
│   │   │   └── types.ts
│   │   └── package.json
│   │
│   ├── tasks/                        # Task monitoring
│   │   ├── src/
│   │   │   ├── components/          # TaskList, TaskRow, TaskActions
│   │   │   ├── hooks/              # useTaskPolling (RxJS interval), useTaskActions
│   │   │   ├── stores/             # taskFilterStore (Zustand)
│   │   │   ├── api.ts
│   │   │   └── types.ts
│   │   └── package.json
│   │
│   ├── terminal/                     # Web terminal
│   │   ├── src/
│   │   │   ├── components/          # TerminalView (xterm.js), TerminalTabs
│   │   │   ├── hooks/              # useTerminalSession (WebSocket via RxJS)
│   │   │   └── types.ts
│   │   └── package.json
│   │
│   ├── users/                        # User management & profile
│   │   ├── src/
│   │   │   ├── components/          # UserList, UserDetail, BudgetPanel
│   │   │   ├── hooks/              # useUsers
│   │   │   ├── api.ts
│   │   │   └── types.ts
│   │   └── package.json
│   │
│   ├── apps/                         # App launcher
│   │   ├── src/
│   │   │   ├── components/          # AppGrid, AppCard, AppRunner (iframe)
│   │   │   ├── hooks/              # useApps
│   │   │   ├── api.ts
│   │   │   └── types.ts
│   │   └── package.json
│   │
│   └── shared/                       # Cross-cutting utilities
│       ├── src/
│       │   ├── api/                 # RxJS-based HTTP client, API query factories
│       │   ├── auth/                # Auth state, guards, token management
│       │   ├── i18n/                # i18next setup, locale files
│       │   ├── stores/              # Global stores (user, notifications)
│       │   ├── errors/              # ErrorBoundary, error types
│       │   └── utils/               # Format, coords, guid, etc.
│       └── package.json
│
├── e2e/                              # Playwright E2E tests
├── turbo.json                        # Turborepo pipeline config
├── package.json                      # Workspace root
├── tsconfig.base.json               # Shared TypeScript config
├── vitest.workspace.ts              # Shared test config
└── Dockerfile
```

**Key decisions:**
- Each feature is a workspace package with clear boundaries and explicit dependencies
- `ui/` is the design system — enforces consistent components
- `shared/` holds cross-cutting concerns (auth, i18n, HTTP)
- Each feature owns its own state, API queries, and types
- Turborepo handles build orchestration, caching, and dependency graph

---

## 2. TypeScript (Strict Mode)

The entire codebase uses TypeScript with strict mode. This is the single highest-impact change.

```jsonc
// tsconfig.base.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "paths": {
      "@sepal/ui/*": ["./packages/ui/src/*"],
      "@sepal/shared/*": ["./packages/shared/src/*"],
      "@sepal/map/*": ["./packages/map/src/*"],
      "@sepal/recipes/*": ["./packages/recipes/src/*"]
    }
  }
}
```

**Key type patterns:**

```typescript
// Recipe types — currently implicit, now explicit
type RecipeType =
  | 'MOSAIC' | 'RADAR_MOSAIC' | 'CLASSIFICATION'
  | 'CHANGE_DETECTION' | 'TIME_SERIES' | 'BAND_MATH'
  | 'ASSET_MOSAIC' | 'PLANET_MOSAIC' | 'PHENOLOGY'
  // ... all 20+ types

interface Recipe<T extends RecipeType = RecipeType> {
  id: string
  type: T
  name: string
  model: RecipeModel<T>  // Type-narrowed model per recipe type
  layers: Layer[]
  createdAt: Date
  updatedAt: Date
}

// API response types
interface ApiResponse<T> {
  data: T
  status: number
}

// Component props — all typed
interface MapViewProps {
  center: [number, number]
  zoom: number
  layers: Layer[]
  onBoundsChange?: (bounds: Bounds) => void
}
```

**What this eliminates:**
- Runtime `undefined is not a function` errors
- Incorrect prop passing between components
- API response shape mismatches
- Refactoring regressions (rename a field -> compiler finds all usages)

---

## 3. State Management

### Client State — Zustand

Replaces Redux + custom `connect()` HOC + `Mutator` + hash-based equality.

```typescript
// packages/shared/src/stores/userStore.ts
import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

interface UserState {
  currentUser: User | null
  budgetExceeded: boolean
  initialized: boolean
  setUser: (user: User) => void
  setBudgetExceeded: (exceeded: boolean) => void
}

export const useUserStore = create<UserState>()(
  devtools(
    persist(
      (set) => ({
        currentUser: null,
        budgetExceeded: false,
        initialized: false,
        setUser: (user) => set({ currentUser: user, initialized: true }),
        setBudgetExceeded: (exceeded) => set({ budgetExceeded: exceeded }),
      }),
      { name: 'sepal-user' }
    )
  )
)

// Usage — just a hook
function UserBadge() {
  const user = useUserStore((s) => s.currentUser)
  return <span>{user?.name}</span>
}
```

### Server State — TanStack Query + RxJS ajax

Replaces RxJS streams tracked in Redux state. RxJS ajax is retained as the HTTP transport for cancellation semantics.

```typescript
// packages/recipes/src/api.ts
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { firstValueFrom, fromEvent } from 'rxjs'
import { takeUntil } from 'rxjs/operators'
import { ajax } from 'rxjs/ajax'

export const recipeQueries = {
  all: () => queryOptions({
    queryKey: ['recipes'],
    queryFn: ({ signal }) => {
      const abort$ = fromEvent(signal, 'abort')
      return firstValueFrom(
        ajax.getJSON<Recipe[]>('/api/recipe/all').pipe(takeUntil(abort$))
      )
    },
  }),

  detail: (id: string) => queryOptions({
    queryKey: ['recipes', id],
    queryFn: ({ signal }) => {
      const abort$ = fromEvent(signal, 'abort')
      return firstValueFrom(
        ajax.getJSON<Recipe>(`/api/recipe/${id}`).pipe(takeUntil(abort$))
      )
    },
    staleTime: 30_000,
  }),
}

export function useSaveRecipe() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (recipe: Recipe) =>
      firstValueFrom(ajax.post('/api/recipe/save', recipe)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
    },
  })
}
```

### HTTP Client

```typescript
// packages/shared/src/api/httpClient.ts
import { ajax, AjaxConfig } from 'rxjs/ajax'
import { Observable, throwError } from 'rxjs'
import { catchError, map, retry } from 'rxjs/operators'

const BASE_URL = import.meta.env.VITE_API_URL ?? ''

export function get$<T>(path: string, options?: RequestOptions): Observable<T> {
  return ajax.getJSON<T>(`${BASE_URL}${path}`, options?.headers).pipe(
    retry({ count: 3, delay: 1000 }),
    catchError(handleError),
  )
}

export function post$<T>(path: string, body?: unknown): Observable<T> {
  return ajax<T>({
    url: `${BASE_URL}${path}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  }).pipe(
    map((response) => response.response),
    catchError(handleError),
  )
}

function handleError(error: AjaxError): Observable<never> {
  if (error.status === 401) {
    useUserStore.getState().setUser(null)  // Auto-logout
  }
  return throwError(() => new ApiError(error))
}
```

**What this eliminates:**
- `connect()` HOC — replaced by `useUserStore()` hook
- `actionBuilder` — replaced by Zustand's `set()` and TanStack mutations
- `Mutator` class — Zustand handles immutability internally
- Hash-based equality — Zustand uses shallow comparison, TanStack Query handles cache identity
- Stream tracking in Redux — TanStack Query's `isLoading`/`isError`/`isFetching` states

**Where RxJS is used:**
- HTTP transport (ajax) inside TanStack Query's queryFn
- WebSocket connections (task progress, terminal)
- Real-time streaming (map tile updates)
- Complex async flows requiring operators (debounce, switchMap, etc.)

---

## 4. Routing — TanStack Router

Type-safe, file-based routing with route-level data loading.

```typescript
// packages/app/src/routes/__root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => (
    <AuthGuard fallback={<LandingPage />}>
      <AppLayout>
        <Outlet />
      </AppLayout>
    </AuthGuard>
  ),
})

// packages/app/src/routes/process/$recipeId.tsx
export const Route = createFileRoute('/process/$recipeId')({
  component: RecipeEditorPage,
  loader: ({ params }) => recipeQueries.detail(params.recipeId),
})

function RecipeEditorPage() {
  const { recipeId } = Route.useParams()  // Typed: { recipeId: string }
  const recipe = Route.useLoaderData()     // Typed: Recipe
  return <RecipeEditor recipe={recipe} />
}
```

**Route tree:**

```
/                    -> Dashboard / Home
/process             -> Recipe list
/process/$recipeId   -> Recipe editor
/browse              -> File browser
/browse/$path        -> Specific directory
/tasks               -> Task monitor
/terminal            -> Web terminal
/apps                -> App launcher
/users               -> User management (admin)
```

**Benefits:**
- Type-safe params (`$recipeId` is typed at compile time)
- Route-level data loading (data fetches before component renders)
- Search params as state (filter/sort in URL, shareable)
- Automatic code splitting per route

---

## 5. Component Architecture & Design System

All components are functional with hooks. No class components, no HOC composition.

### Before/After Pattern

```typescript
// BEFORE (current):
class _RecipeEditor extends React.Component {
  componentDidMount() {
    const {stream, recipeId} = this.props
    stream('LOAD_RECIPE', loadRecipe$(recipeId))
  }
  render() { return <div>...</div> }
}
export const RecipeEditor = compose(
  _RecipeEditor,
  connect(mapStateToProps),
  withSubscriptions()
)

// AFTER (greenfield):
export function RecipeEditor({ recipeId }: { recipeId: string }) {
  const { data: recipe, isLoading } = useQuery(recipeQueries.detail(recipeId))
  const saveRecipe = useSaveRecipe()

  if (isLoading) return <Spinner />
  return (
    <RecipePanel recipe={recipe} onSave={(r) => saveRecipe.mutate(r)} />
  )
}
```

### Design System Structure (`ui/` package)

```
packages/ui/src/
├── components/
│   ├── Button/
│   │   ├── Button.tsx
│   │   ├── Button.module.css
│   │   ├── Button.test.tsx
│   │   ├── ButtonGroup.tsx
│   │   └── index.ts
│   ├── Form/
│   │   ├── Input.tsx
│   │   ├── Select.tsx
│   │   ├── Checkbox.tsx
│   │   ├── DatePicker.tsx
│   │   ├── FileInput.tsx
│   │   ├── FormField.tsx           # Label + input + error wrapper
│   │   └── index.ts
│   ├── Layout/
│   │   ├── Panel.tsx
│   │   ├── Modal.tsx
│   │   ├── Tabs.tsx
│   │   ├── Toolbar.tsx
│   │   └── ScrollableContainer.tsx
│   ├── Feedback/
│   │   ├── Spinner.tsx
│   │   ├── Toast.tsx
│   │   ├── Confirm.tsx
│   │   └── NoData.tsx
│   └── Data/
│       ├── Table.tsx
│       ├── Legend.tsx
│       ├── SearchBox.tsx
│       └── Tree.tsx
├── hooks/
│   ├── useMediaQuery.ts
│   ├── useDebounce.ts
│   ├── useClickOutside.ts
│   └── useKeyboard.ts
├── styles/
│   ├── variables.css
│   ├── reset.css
│   └── global.css
└── index.ts
```

### Forms — React Hook Form + Zod

```typescript
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const mosaicSchema = z.object({
  name: z.string().min(1, 'Recipe name is required'),
  aoi: z.object({ type: z.literal('Polygon'), coordinates: z.array(z.any()) }),
  dates: z.object({
    from: z.date(),
    to: z.date(),
  }).refine(d => d.from < d.to, 'Start date must be before end date'),
  bands: z.array(z.string()).min(1, 'Select at least one band'),
})

type MosaicForm = z.infer<typeof mosaicSchema>

function MosaicConfigPanel({ recipe }: { recipe: Recipe<'MOSAIC'> }) {
  const { register, handleSubmit, formState: { errors } } = useForm<MosaicForm>({
    resolver: zodResolver(mosaicSchema),
    defaultValues: recipe.model,
  })

  return (
    <form onSubmit={handleSubmit(onSave)}>
      <FormField label="Name" error={errors.name?.message}>
        <Input {...register('name')} />
      </FormField>
    </form>
  )
}
```

---

## 6. Map & Geospatial System

### Map Stack

```
react-map-gl (MapLibre GL JS)       <- Map renderer (replaces raw Google Maps API)
  |-- deck.gl                       <- Data visualization layers
  |-- Custom EarthEngine Source     <- EE tile integration (kept, modernized)
  |-- Custom Planet Source          <- Planet tile integration (kept, modernized)
```

**Why MapLibre over Google Maps:**
- Open source, no API key costs
- WebGL-native, better performance with many layers
- deck.gl integration for advanced data visualization
- More control over styling and behavior

```typescript
// packages/map/src/components/MapView.tsx
import Map, { Source, Layer, NavigationControl } from 'react-map-gl/maplibre'
import { useMapStore } from '../stores/mapStore'

export function MapView() {
  const { viewport, layers, setViewport } = useMapStore()

  return (
    <Map
      {...viewport}
      onMove={(e) => setViewport(e.viewState)}
      mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
    >
      <NavigationControl position="top-right" />
      {layers.map((layer) => (
        <MapLayer key={layer.id} layer={layer} />
      ))}
    </Map>
  )
}
```

### Earth Engine Integration

```typescript
// packages/map/src/layers/EarthEngineLayer.tsx
import { useEffect } from 'react'
import { useMap } from 'react-map-gl/maplibre'

export function EarthEngineLayer({ eeMapId, visParams }: EELayerProps) {
  const { current: mapRef } = useMap()

  useEffect(() => {
    if (!mapRef) return
    const map = mapRef.getMap()

    map.addSource(`ee-${eeMapId}`, {
      type: 'raster',
      tiles: [`https://earthengine.googleapis.com/v1/projects/.../${eeMapId}/tiles/{z}/{x}/{y}`],
      tileSize: 256,
    })

    map.addLayer({
      id: `ee-layer-${eeMapId}`,
      type: 'raster',
      source: `ee-${eeMapId}`,
    })

    return () => {
      map.removeLayer(`ee-layer-${eeMapId}`)
      map.removeSource(`ee-${eeMapId}`)
    }
  }, [eeMapId, mapRef])

  return null
}
```

### Map State

```typescript
// packages/map/src/stores/mapStore.ts
interface MapState {
  viewport: ViewState
  layers: Layer[]
  activeLayerId: string | null
  setViewport: (viewport: ViewState) => void
  addLayer: (layer: Layer) => void
  removeLayer: (id: string) => void
  reorderLayers: (from: number, to: number) => void
}

export const useMapStore = create<MapState>()(
  devtools((set) => ({
    viewport: { longitude: 0, latitude: 0, zoom: 3 },
    layers: [],
    activeLayerId: null,
    // ... actions
  }))
)
```

---

## 7. Recipe System

### Type-Safe Recipe Registry

```typescript
// packages/recipes/src/types/registry.ts
interface RecipeTypeDefinition<T extends RecipeType> {
  type: T
  label: string
  icon: IconName
  defaultModel: () => RecipeModel<T>
  panels: PanelDefinition<T>[]
  serialize: (model: RecipeModel<T>) => SerializedRecipe
  deserialize: (data: SerializedRecipe) => RecipeModel<T>
  getPreviewRequest: (model: RecipeModel<T>) => EERequest
}

type RecipeModel<T extends RecipeType> =
  T extends 'MOSAIC' ? MosaicModel :
  T extends 'CLASSIFICATION' ? ClassificationModel :
  T extends 'RADAR_MOSAIC' ? RadarMosaicModel :
  T extends 'TIME_SERIES' ? TimeSeriesModel :
  never

const RECIPE_REGISTRY: { [T in RecipeType]: RecipeTypeDefinition<T> } = {
  MOSAIC: {
    type: 'MOSAIC',
    label: 'Optical Mosaic',
    icon: 'satellite',
    defaultModel: () => ({ sources: [], dates: null, compositing: 'MEDOID' }),
    panels: [aoiPanel, datesPanel, sourcesPanel, compositingPanel, bandsPanel],
    // ...
  },
  // ... all types
}
```

### Recipe Editor State (undo/redo)

```typescript
// packages/recipes/src/stores/recipeStore.ts
interface RecipeEditorState {
  dirtyModel: RecipeModel<any> | null
  undoStack: RecipeModel<any>[]
  redoStack: RecipeModel<any>[]

  setModel: (model: RecipeModel<any>) => void
  undo: () => void
  redo: () => void
  isDirty: () => boolean
}

export const useRecipeEditorStore = create<RecipeEditorState>()(
  devtools((set, get) => ({
    dirtyModel: null,
    undoStack: [],
    redoStack: [],

    setModel: (model) => set((state) => ({
      dirtyModel: model,
      undoStack: [...state.undoStack, state.dirtyModel!],
      redoStack: [],
    })),

    undo: () => set((state) => {
      const previous = state.undoStack.at(-1)
      if (!previous) return state
      return {
        dirtyModel: previous,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, state.dirtyModel!],
      }
    }),

    isDirty: () => get().dirtyModel !== null,
  }))
)
```

---

## 8. Testing Strategy

### Testing Pyramid

```
           /\
          /E2E\              Playwright — 10-20 critical user flows
         /------\
        / Integr. \          Testing Library — component + hook tests
       /------------\
      /  Unit Tests   \      Vitest — pure functions, stores, utils
     /------------------\
```

### Unit Tests (Vitest)

```typescript
// packages/shared/src/utils/format.test.ts
describe('formatArea', () => {
  it('formats hectares', () => {
    expect(formatArea(15000, 'ha')).toBe('15,000 ha')
  })
})

// packages/recipes/src/stores/recipeStore.test.ts
describe('recipeEditorStore', () => {
  it('supports undo/redo', () => {
    const store = useRecipeEditorStore.getState()
    store.setModel({ name: 'v1' })
    store.setModel({ name: 'v2' })
    store.undo()
    expect(store.dirtyModel).toEqual({ name: 'v1' })
  })
})
```

### Integration Tests (Testing Library)

```typescript
it('loads and displays recipe name', async () => {
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <RecipeEditor recipeId="abc-123" />
    </QueryClientProvider>
  )
  await waitFor(() => {
    expect(screen.getByText('My Mosaic Recipe')).toBeInTheDocument()
  })
})
```

### E2E Tests (Playwright)

```typescript
test('create and save a mosaic recipe', async ({ page }) => {
  await page.goto('/process')
  await page.getByRole('button', { name: 'Create recipe' }).click()
  await page.getByRole('option', { name: 'Optical Mosaic' }).click()
  // ... full workflow
  await expect(page.getByText('Recipe saved')).toBeVisible()
})
```

### Coverage Targets

| Package | Unit | Integration | E2E |
|---|---|---|---|
| `shared/` | 90% | — | — |
| `ui/` | 80% | 70% | — |
| `recipes/` | 70% | 60% | Key flows |
| `map/` | 60% | 50% | Key flows |
| `browse/`, `tasks/` | 70% | 50% | Key flows |

---

## 9. Internationalization — i18next

Replace `react-intl` with `i18next` + `react-i18next`.

```typescript
// packages/shared/src/i18n/setup.ts
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import HttpBackend from 'i18next-http-backend'
import LanguageDetector from 'i18next-browser-languagedetector'

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: ['en', 'es', 'fr', 'pt', 'it', 'ru', 'sv', 'ar', 'zh'],
    ns: ['common', 'recipes', 'map', 'browse', 'tasks'],
    defaultNS: 'common',
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    interpolation: { escapeValue: false },
  })

// Usage
function RecipeToolbar({ recipe }: Props) {
  const { t } = useTranslation('recipes')
  return (
    <Toolbar>
      <span>{t('editor.title', { name: recipe.name })}</span>
      <Button>{t('common:save')}</Button>
    </Toolbar>
  )
}
```

**Improvements over react-intl:**
- Namespace splitting — each feature loads only its translations
- Lazy loading — translations fetched on demand
- Simpler API — `t('key')` instead of `<FormattedMessage id="key" />`
- Type-safe keys at compile time

---

## 10. Error Handling & Notifications

### Error Boundaries

```typescript
// packages/shared/src/errors/ErrorBoundary.tsx
import { ErrorBoundary as ReactErrorBoundary } from 'react-error-boundary'

export function FeatureErrorBoundary({ feature, children }: Props) {
  const { t } = useTranslation()

  return (
    <ReactErrorBoundary
      fallbackRender={({ error, resetErrorBoundary }) => (
        <ErrorFallback
          title={t('errors.featureFailed', { feature })}
          error={error}
          onRetry={resetErrorBoundary}
        />
      )}
      onError={(error) => logger.error(`${feature} crashed`, { error })}
    >
      {children}
    </ReactErrorBoundary>
  )
}
```

### Notification Store

```typescript
// packages/shared/src/stores/notificationStore.ts
type NotificationType = 'success' | 'error' | 'warning' | 'info'

interface Notification {
  id: string
  type: NotificationType
  message: string
  duration?: number
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],

  notify: (type, message, duration = 5000) => {
    const id = crypto.randomUUID()
    set((s) => ({ notifications: [...s.notifications, { id, type, message, duration }] }))
    if (duration > 0) {
      setTimeout(() => {
        set((s) => ({ notifications: s.notifications.filter(n => n.id !== id) }))
      }, duration)
    }
  },

  dismiss: (id) => set((s) => ({
    notifications: s.notifications.filter(n => n.id !== id)
  })),
}))
```

---

## 11. Build, Deploy & DX

### Turborepo Pipeline

```jsonc
// turbo.json
{
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "test": { "dependsOn": ["^build"] },
    "lint": {},
    "typecheck": { "dependsOn": ["^build"] }
  }
}
```

### Docker

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json turbo.json ./
COPY packages/ packages/
RUN npm ci && npm run build

FROM nginx:alpine
COPY --from=build /app/packages/app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

### Developer Experience

- **ESLint + Prettier** — consistent formatting, auto-fixable
- **Husky + lint-staged** — pre-commit hooks for lint/typecheck
- **TypeScript strict mode** — compile-time error detection
- **Vite HMR** — instant feedback during development

---

## 12. Technology Stack Summary

| Layer | Current | Greenfield |
|---|---|---|
| **Language** | JavaScript | **TypeScript (strict)** |
| **Components** | Class + HOC composition | **Functional + hooks** |
| **Client state** | Redux + custom connect/Mutator | **Zustand** |
| **Server state** | RxJS streams in Redux | **TanStack Query + RxJS ajax** |
| **HTTP** | Custom RxJS ajax wrapper | **RxJS ajax** (simplified) |
| **Routing** | react-router-dom | **TanStack Router** (type-safe) |
| **Forms** | Custom widgets, no validation | **React Hook Form + Zod** |
| **Styling** | CSS Modules + global | **CSS Modules** (kept) |
| **Maps** | Raw Google Maps API | **MapLibre GL JS + deck.gl** |
| **i18n** | react-intl | **i18next** |
| **Testing** | Vitest (minimal) | **Vitest + Testing Library + Playwright** |
| **Build** | Vite | **Vite + Turborepo** |
| **Structure** | Flat src/ | **Feature-based monorepo** |
| **Deploy** | Docker + Nginx | **Docker + Nginx** (kept) |

---

## What Gets Eliminated

| Custom Abstraction | Replaced By |
|---|---|
| `connect()` HOC | `useUserStore()`, `useQuery()` hooks |
| `compose()` utility | Direct function composition (unnecessary with hooks) |
| `actionBuilder` fluent API | Zustand `set()` + TanStack mutations |
| `Mutator` class | Zustand handles immutability |
| Hash-based equality (`___hash___`) | Zustand shallow comparison + TanStack cache identity |
| `stateUtils.js` | Native spread/destructuring |
| Custom `sTree` | Standard tree utilities or recursive components |
| `apiRegistry` | Direct imports from feature `api.ts` files |
| Stream tracking in Redux | TanStack Query `isLoading`/`isError`/`isFetching` |
| Class components | Functional components |
| `withSubscriptions()` HOC | `useEffect` + cleanup |
