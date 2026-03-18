# MCP Recipe Server Design

## Overview

A new SEPAL module (`modules/mcp-server/`) that exposes an MCP (Model Context Protocol) server for interacting with SEPAL recipes. Accessible exclusively through a chat panel in the SEPAL GUI, communicating via the gateway's websocket infrastructure. Configurable LLM provider (Claude, OpenAI) powers the conversational interface.

## Architecture

### Two-Layer Design

**MCP Tool Layer** — stateless, testable tool definitions and recipe schema registry. No LLM dependency. Communicates with `sepal-server` (recipe CRUD) and `gee` (recipe execution/introspection) via HTTP.

**Chat Orchestrator Layer** — manages chat sessions, LLM provider abstraction, conversation history, and websocket communication with the GUI. Calls MCP tools internally based on LLM tool-calling decisions.

### Integration Points

- **Gateway HTTP**: `/api/mcp/*` routes to `mcp-server:80`
- **Gateway Websocket**: registered as a websocket endpoint module (`mcp-server`) using the gateway's existing subscription-based routing (see Gateway Integration section)
- **sepal-server**: recipe CRUD via `/api/processing-recipes/*`
- **gee module**: recipe execution endpoints (`/preview`, `/bands`, `/recipe/geometry`, etc.)
- **Authentication**: gateway session auth; user context via `sepal-user` header
- **Gateway module registry**: entry in `modules/gateway/config/modules.json` mapping `"mcpServer": "mcp-server"`

## Module Structure

```
modules/mcp-server/
  src/
    main.js                    # Entry point, HTTP + WS server setup
    config.js                  # LLM provider config, module settings
    mcp/                       # MCP Tool Layer
      tools/
        recipeTools.js         # CRUD: create, list, load, save, delete
        introspectionTools.js  # Schema info, available types, parameters
        templateTools.js       # Pre-built recipe templates
        workflowTools.js       # Guided step-by-step tools
        guiTools.js            # GUI notification tools
      schemas/                 # Recipe type schema definitions
        mosaic.js
        radarMosaic.js
        planetMosaic.js
        classification.js
        unsupervisedClassification.js
        regression.js
        timeSeries.js
        ccdc.js
        ccdcSlice.js
        changeAlerts.js
        baytsHistorical.js
        baytsAlerts.js
        classChange.js
        indexChange.js
        phenology.js
        stack.js
        bandMath.js
        remapping.js
        masking.js
        asset.js
        _shared/
          aoi.js               # Shared AOI schema
          dates.js             # Shared date range schema
          sources.js           # Shared data source schema
      templates/               # Pre-built recipe templates
        landsatAnnualMosaic.js
        sentinel2SeasonalMosaic.js
        radarMonthlyMosaic.js
        landCoverClassification.js
        forestChangeDetection.js
        ndviTimeSeries.js
        deforestationAlerts.js
        indexChangeMap.js
      registry.js              # Tool and schema registry
    chat/                      # Chat Orchestrator Layer
      orchestrator.js          # Session management, LLM dispatch
      providers/
        provider.js            # Base interface
        claude.js              # Claude API provider
        openai.js              # OpenAI provider
      session.js               # Chat session state (per-user-tab)
      wsHandler.js             # Websocket message handling
    sepal/                     # SEPAL API clients
      recipeClient.js          # Calls sepal-server recipe endpoints
      geeClient.js             # Calls gee module endpoints
      wsNotifier.js            # Sends load/reload/close to GUI via WS
```

## MCP Tools

### Recipe CRUD (9 tools)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `recipe_list` | `{type?, projectId?}` | List all recipes for the user, optionally filtered by type or project |
| `recipe_load` | `{recipeId}` | Load full recipe contents by ID. Returns parsed `model` only (UI state stripped). See SEPAL API Notes. |
| `recipe_create` | `{type, name, projectId?, model}` | Create a new recipe. `recipeClient.js` gzip-compresses the contents before POSTing. |
| `recipe_save` | `{recipeId, model}` | Update an existing recipe. Loads existing contents, merges model, gzip-compresses, and POSTs. |
| `recipe_delete` | `{recipeIds}` | Delete one or more recipes. Uses single-ID endpoint for one, bulk endpoint for multiple. |
| `recipe_move` | `{recipeIds, projectId}` | Move recipes to a different project |
| `project_list` | `{}` | List user's projects |
| `project_create` | `{name, defaultAssetFolder?, defaultWorkspaceFolder?}` | Create a new project |
| `project_delete` | `{projectId}` | Delete a project |

### Introspection (4 tools)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `recipe_types` | `{}` | List all available recipe types with descriptions |
| `recipe_schema` | `{type}` | Get full parameter schema for a recipe type (JSON Schema) |
| `recipe_bands` | `{type}` | Get available output bands for a recipe type. Returns static band metadata from the schema registry (not dynamic GEE queries). |
| `recipe_visualizations` | `{type}` | Get preset visualizations for a recipe type. Returns static presets from the schema registry. |

### Templates (2 tools)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `template_list` | `{type?, tags?}` | List available templates, optionally filtered |
| `template_apply` | `{templateId, overrides, name?, projectId?}` | Create recipe from template with parameter overrides |

### Guided Workflows (5 tools)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `workflow_start` | `{type}` | Begin guided recipe creation; returns first step |
| `workflow_step` | `{workflowId, stepId, values}` | Submit values for current step; returns next step |
| `workflow_status` | `{workflowId}` | Get current workflow state and remaining steps |
| `workflow_complete` | `{workflowId, name?, projectId?}` | Finalize workflow and create recipe |
| `workflow_cancel` | `{workflowId}` | Abandon in-progress workflow |

### GUI Notifications (3 tools)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `gui_open_recipe` | `{recipeId}` | Tell user's browser to open/load a recipe |
| `gui_reload_recipe` | `{recipeId}` | Tell browser to reload an already-open recipe |
| `gui_close_recipe` | `{recipeId}` | Tell browser to close a recipe tab |

## Recipe Schema Definitions

Each recipe type has a schema file exporting:

```javascript
export default {
    id: 'MOSAIC',
    name: 'Optical Mosaic',
    description: 'Cloud-free composite from optical satellite imagery (Landsat, Sentinel-2)',
    parameterSchema: {
        // JSON Schema for the recipe's model parameters
        type: 'object',
        properties: {
            aoi: {/* shared AOI schema */},
            dates: {
                type: 'object',
                properties: {
                    type: {enum: ['YEARLY_TIME_SCAN', 'SEASONAL', 'FIXED']},
                    targetDate: {type: 'string', format: 'date'},
                    seasonStart: {type: 'string', format: 'date'},
                    seasonEnd: {type: 'string', format: 'date'},
                    yearsBefore: {type: 'integer', minimum: 0},
                    yearsAfter: {type: 'integer', minimum: 0}
                },
                required: ['type', 'targetDate']
            },
            sources: {/* ... */},
            compositeOptions: {/* ... */}
        },
        required: ['aoi', 'dates', 'sources']
    },
    workflowSteps: [
        {id: 'aoi', name: 'Area of Interest', description: 'Define the geographic area', fields: ['aoi']},
        {id: 'dates', name: 'Date Range', fields: ['dates']},
        {id: 'sources', name: 'Data Sources', fields: ['sources']},
        {id: 'compositeOptions', name: 'Composite Options', fields: ['compositeOptions']}
    ],
    bands: {
        optical: ['blue', 'green', 'red', 'nir', 'swir1', 'swir2'],
        indexes: ['ndvi', 'ndwi', 'evi', 'savi'],
        metadata: ['dayOfYear', 'daysFromTarget']
    },
    visualizations: [
        {name: 'Natural Color', type: 'rgb', bands: ['red', 'green', 'blue'], min: [200, 400, 600], max: [2400, 2200, 2400]},
        {name: 'False Color', type: 'rgb', bands: ['nir', 'red', 'green'], min: [500, 200, 400], max: [5000, 2400, 2200]}
    ]
}
```

Shared schemas (`_shared/aoi.js`, `_shared/dates.js`, `_shared/sources.js`) are imported and composed into recipe type schemas.

## Templates

8 initial templates covering common use cases:

| Template ID | Recipe Type | Description |
|------------|-------------|-------------|
| `landsat-annual-mosaic` | MOSAIC | Annual Landsat 8/9 composite with SR + BRDF |
| `sentinel2-seasonal-mosaic` | MOSAIC | Seasonal Sentinel-2 composite |
| `radar-monthly-mosaic` | RADAR_MOSAIC | Monthly Sentinel-1 SAR mosaic |
| `land-cover-classification` | CLASSIFICATION | Random Forest land cover classification |
| `forest-change-detection` | CCDC | CCDC-based forest change detection |
| `ndvi-time-series` | TIME_SERIES | NDVI temporal analysis |
| `deforestation-alerts` | CHANGE_ALERTS | Near-real-time deforestation alerts |
| `index-change-map` | INDEX_CHANGE | Before/after spectral index change |

Each template specifies `requiredOverrides` (parameters the user must provide, e.g., AOI) and a pre-configured `model` with sensible defaults.

## Chat Orchestrator

### Session Management

- One chat session per browser tab, identified by the gateway's `clientId` (UUID assigned per websocket connection) and `subscriptionId` (UUID generated by the client when subscribing to the `mcp-server` module)
- In-memory session state: conversation history, active workflow state (for guided workflows), LLM provider reference
- Workflow state is also in-memory — lost on module restart, consistent with no-persistence design
- Configurable TTL; cleaned up on `subscriptionDown` event or timeout
- No persistent chat history in initial implementation

### LLM Provider Abstraction

```javascript
class LLMProvider {
    formatTools(tools) {}                           // Convert MCP tools to provider format
    chat$({messages, tools, systemPrompt}) {}       // Returns Observable<{text, toolCalls[]}>
}
```

Providers: `claude.js` (Claude API, native tool_use), `openai.js` (OpenAI API, function_calling).

Initial implementation uses **buffered responses** (full LLM response returned as one message). Token-by-token streaming is deferred to a future iteration to reduce complexity in the websocket relay pipeline.

### System Prompt

Dynamically built per session with:
- SEPAL description and capabilities
- High-level recipe type listing (names and one-line descriptions only — detailed schemas loaded on demand via `recipe_types` and `recipe_schema` tools to conserve context window)
- User context (username, projects)
- Instructions for tool usage patterns

### Orchestration Flow

1. User sends chat message via websocket (gateway routes based on `module: 'mcp-server'`)
2. `wsHandler.js` receives `{username, clientId, subscriptionId, data}`, routes to `orchestrator.js`
3. Orchestrator appends to session history (keyed by `clientId + subscriptionId`), calls LLM with history + tools
4. LLM responds with text and/or tool calls
5. Tool calls executed against MCP Tool Layer
6. Results fed back to LLM for follow-up
7. Final text response sent to user via websocket (single complete message)
8. If recipe created/modified, `wsNotifier.js` sends GUI action on the same subscription

## Gateway Integration

### Configuration Changes

**`modules/gateway/config/modules.json`** — add module hostname mapping:
```json
"mcpServer": "mcp-server"
```

**`modules/gateway/config/endpoints.js`** — add HTTP route and websocket endpoint:
```javascript
// HTTP route (CommonJS, matching gateway's existing style)
'/api/mcp/*' → `http://${modules.mcpServer}`

// Websocket endpoint (added to webSocketEndpoints array)
{module: 'mcp-server', target: `ws://${modules.mcpServer}/ws`}
```

Note: the gateway uses Express and CommonJS (`require()`). All gateway config changes must follow this convention, even though the `mcp-server` module itself uses ESM.

### Websocket Protocol

The MCP server uses the gateway's existing subscription-based websocket routing. The browser subscribes to the `mcp-server` module, and all messages are routed via `{module, subscriptionId, data}`.

**Client → Gateway → MCP server:**
```javascript
// Client subscribes to mcp-server module
{subscribed: true, module: 'mcp-server', subscriptionId: '<uuid>'}

// Client sends chat message
{module: 'mcp-server', subscriptionId: '<uuid>', data: {type: 'message', text: '...'}}
```

**Gateway forwards to MCP server (with auth context injected):**
```javascript
{username: '<string>', clientId: '<uuid>', subscriptionId: '<uuid>', data: {type: 'message', text: '...'}}
```

**MCP server → Gateway → Client:**
```javascript
// Chat response
{username: '<string>', clientId: '<uuid>', subscriptionId: '<uuid>', data: {type: 'response', text: '...', status: 'complete'}}

// GUI action (open/reload/close recipe)
{username: '<string>', clientId: '<uuid>', subscriptionId: '<uuid>', data: {type: 'gui-action', action: 'open', recipeId: '...'}}
{username: '<string>', clientId: '<uuid>', subscriptionId: '<uuid>', data: {type: 'gui-action', action: 'reload', recipeId: '...'}}
{username: '<string>', clientId: '<uuid>', subscriptionId: '<uuid>', data: {type: 'gui-action', action: 'close', recipeId: '...'}}
```

**Gateway delivers to client as:**
```javascript
{module: 'mcp-server', subscriptionId: '<uuid>', data: {type: 'response', text: '...', status: 'complete'}}
{module: 'mcp-server', subscriptionId: '<uuid>', data: {type: 'gui-action', action: 'open', recipeId: '...'}}
```

### Lifecycle Events

The MCP server receives gateway lifecycle events for session management:
- `{event: 'subscriptionUp', username, clientId, subscriptionId}` — client subscribed, create chat session
- `{event: 'subscriptionDown', username, clientId, subscriptionId}` — client unsubscribed, clean up session
- `{event: 'clientDown', username, clientId}` — browser tab closed, clean up all sessions for client
- `{hb: <timestamp>}` — heartbeat (respond with `{hb: <timestamp>}`)

## GUI Chat Panel

### Location

New component at `modules/gui/src/app/home/body/chat/`

### Components

```
chat/
  chatPanel.jsx            # Main panel container (right-side drawer)
  chatPanel.module.css     # Styles
  chatMessages.jsx         # Message list with auto-scroll
  chatMessage.jsx          # Individual message bubble (user/assistant)
  chatInput.jsx            # Text input with send button
  chatButton.jsx           # Toggle button in top bar
  chatApi.js               # Websocket send/receive abstraction
```

### Behavior

- Toggle button in SEPAL top bar opens/closes right-side drawer
- Drawer overlays current view without disrupting workspace
- Messages rendered with markdown support
- Loading indicator during LLM processing (initial implementation uses buffered responses — full message delivered at once; token-by-token streaming deferred to future iteration)
- Auto-scroll to latest message
- Clear conversation button

### State

Local component state only (no Redux). Chat state does not persist across navigation.

### Websocket Integration

- On mount: subscribes to `mcp-server` module via the gateway websocket (`{subscribed: true, module: 'mcp-server', subscriptionId: '<uuid>'}`)
- On unmount: unsubscribes (`{unsubscribed: true, module: 'mcp-server', subscriptionId: '<uuid>'}`)
- Sends chat messages as `{module: 'mcp-server', subscriptionId, data: {type: 'message', text: '...'}}`
- Receives responses and dispatches based on `data.type`:
  - `response` — append to message list
  - `gui-action` — dispatch existing Redux actions (load/reload/close recipe)

## SEPAL API Notes

### Recipe Content Encoding

The sepal-server recipe API uses gzip compression for recipe contents:

- **Save** (`POST /api/processing-recipes/{id}`): body must be gzip-compressed UTF-8 JSON. Query params: `projectId`, `type`, `name`. `recipeClient.js` must handle gzip compression using Node.js `zlib.gzipSync()`.
- **Load** (`GET /api/processing-recipes/{id}`): returns raw JSON string containing the full recipe object (including `id`, `type`, `model`, `ui`, `layers`, etc.).
- **List** (`GET /api/processing-recipes`): returns metadata only (id, projectId, name, type, creationTime, updateTime) — no contents.

### Response Parsing Strategy

When loading a recipe via `recipe_load`:
1. Parse the raw JSON string from sepal-server
2. Strip the `ui` key (UI-only state, not meaningful outside the browser)
3. Strip the `layers` key (map layer state)
4. Return only: `id`, `type`, `name`, `projectId`, `model` (the recipe's configuration)

### Delete Endpoints

sepal-server has two delete endpoints:
- `DELETE /api/processing-recipes/{id}` — single recipe (soft delete)
- `DELETE /api/processing-recipes` with JSON body `[id1, id2, ...]` — bulk soft delete

`recipe_delete` uses the appropriate endpoint based on input count.

## Schema Maintenance

The MCP server maintains its own recipe schema definitions, independent of the GUI. To mitigate schema drift:

- **Bootstrap**: initial schemas are derived from examining the GUI's `defaultModel` and panel definitions for each recipe type
- **Validation test**: a test suite that loads sample saved recipes from a test database (or fixtures) and validates them against the MCP schemas, catching structural mismatches
- **Version tracking**: each schema tracks which `typeVersion` (recipe migration version) it corresponds to; when sepal-server adds new migrations, schemas must be updated

This is a known maintenance trade-off accepted in favor of implementation simplicity and full control over what is exposed to LLM clients.

## Error Handling

### Response Format

```javascript
// Success
{success: true, data: {/* result */}}

// Error
{success: false, error: {code: 'RECIPE_NOT_FOUND', message: 'Recipe abc123 not found'}}
```

### Error Categories

- **Validation**: invalid parameters caught by schema validation before API calls
- **Auth**: user not authenticated or unauthorized (enforced by sepal-server)
- **Upstream**: sepal-server or gee module errors (forwarded with context)
- **LLM**: provider unavailable or rate limited (retried once, then reported to user)

Errors are fed back to the LLM so it can explain issues and suggest corrections.

## Security

- **No direct DB access** — all operations via sepal-server and gee HTTP APIs
- **User isolation** — authenticated user context from gateway; sepal-server enforces ownership
- **Input sanitization** — parameters validated against JSON schemas before forwarding
- **LLM API keys** — server-side config only, never exposed to client
- **Rate limiting** — per-user rate limit on chat messages
- **Fixed tool set** — LLM cannot execute arbitrary commands

## Docker Integration

- New service in `docker-compose.yml` on `sepal` network
- Exposes port 80 internally
- Runtime dependencies: `gateway`, `sepal-server`, `gee`
- Entry in `dev-env/config/deps.json` with appropriate `lib` and `run` dependencies
- Entry in `modules/gateway/config/modules.json`: `"mcpServer": "mcp-server"`
- Websocket endpoint added to `modules/gateway/config/endpoints.js` `webSocketEndpoints` array

## Out of Scope (Initial Implementation)

- File/image attachments in chat
- Persistent chat history
- Multiple chat threads
- Recipe context awareness (knowing which recipe is currently open)
- Direct UI manipulation beyond open/reload/close
- Per-user LLM provider selection
- GEE task submission (export/download) via MCP tools
- Token-by-token streaming (buffered responses only)
- LLM token budget / cost tracking per user
- Chat session reconnection on network interruption (session is lost; user starts fresh)
