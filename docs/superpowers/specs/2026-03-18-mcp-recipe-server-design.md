# MCP Recipe Server Design

## Overview

A new SEPAL module (`modules/mcp-server/`) that exposes an MCP (Model Context Protocol) server for interacting with SEPAL recipes. Accessible exclusively through a chat panel in the SEPAL GUI, communicating via the gateway's websocket infrastructure. Configurable LLM provider (Claude, OpenAI) powers the conversational interface.

## Architecture

### Two-Layer Design

**MCP Tool Layer** — stateless, testable tool definitions and recipe schema registry. No LLM dependency. Communicates with `sepal-server` (recipe CRUD) and `gee` (recipe execution/introspection) via HTTP.

**Chat Orchestrator Layer** — manages chat sessions, LLM provider abstraction, conversation history, and websocket communication with the GUI. Calls MCP tools internally based on LLM tool-calling decisions.

### Integration Points

- **Gateway HTTP**: `/api/mcp/*` routes to `mcp-server:80`
- **Gateway Websocket**: virtual channels `mcp-chat` (conversation) and `mcp-gui-action` (GUI commands)
- **sepal-server**: recipe CRUD via `/api/processing-recipes/*`
- **gee module**: recipe execution endpoints (`/preview`, `/bands`, `/recipe/geometry`, etc.)
- **Authentication**: gateway session auth; user context via `sepal-user` header

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
| `recipe_load` | `{recipeId}` | Load full recipe contents by ID |
| `recipe_create` | `{type, name, projectId?, model}` | Create a new recipe with given type and parameters |
| `recipe_save` | `{recipeId, model}` | Update an existing recipe's parameters |
| `recipe_delete` | `{recipeIds}` | Delete one or more recipes |
| `recipe_move` | `{recipeIds, projectId}` | Move recipes to a different project |
| `project_list` | `{}` | List user's projects |
| `project_create` | `{name, defaultAssetFolder?, defaultWorkspaceFolder?}` | Create a new project |
| `project_delete` | `{projectId}` | Delete a project |

### Introspection (4 tools)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `recipe_types` | `{}` | List all available recipe types with descriptions |
| `recipe_schema` | `{type}` | Get full parameter schema for a recipe type (JSON Schema) |
| `recipe_bands` | `{type, model?}` | Get available output bands for a recipe type |
| `recipe_visualizations` | `{type, model?}` | Get preset visualizations for a recipe type |

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

- One chat session per browser tab (identified by gateway websocket channel ID)
- In-memory session state: conversation history, active workflow state, LLM provider reference
- Configurable TTL; cleaned up on websocket disconnect or timeout
- No persistent chat history in initial implementation

### LLM Provider Abstraction

```javascript
class LLMProvider {
    formatTools(tools) {}                           // Convert MCP tools to provider format
    chat$({messages, tools, systemPrompt}) {}       // Returns Observable<{text, toolCalls[]}>
}
```

Providers: `claude.js` (Claude API, native tool_use), `openai.js` (OpenAI API, function_calling).

### System Prompt

Dynamically built per session with:
- SEPAL description and capabilities
- Available recipe types summary
- User context (username, projects)
- Instructions for tool usage patterns

### Orchestration Flow

1. User sends chat message via websocket (`mcp-chat` channel)
2. `wsHandler.js` receives, routes to `orchestrator.js`
3. Orchestrator appends to session history, calls LLM with history + tools
4. LLM responds with text and/or tool calls
5. Tool calls executed against MCP Tool Layer
6. Results fed back to LLM for follow-up
7. Final text streamed to user via websocket
8. If recipe created/modified, `wsNotifier.js` sends GUI action

## Gateway Integration

### HTTP Routes

Added to `modules/gateway/config/endpoints.js`:
```javascript
'/api/mcp/*' → 'mcp-server:80'
```

### Websocket Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `mcp-chat` | Bidirectional | Chat messages between user and MCP server |
| `mcp-gui-action` | Server → GUI | Recipe open/reload/close commands |

### Message Formats

```javascript
// User → MCP server
{channel: 'mcp-chat', type: 'message', body: {text: '...'}}

// MCP server → User (streaming)
{channel: 'mcp-chat', type: 'response', body: {text: '...', status: 'streaming'}}
{channel: 'mcp-chat', type: 'response', body: {text: '...', status: 'complete'}}

// MCP server → GUI
{channel: 'mcp-gui-action', type: 'action', body: {action: 'open', recipeId: '...'}}
{channel: 'mcp-gui-action', type: 'action', body: {action: 'reload', recipeId: '...'}}
{channel: 'mcp-gui-action', type: 'action', body: {action: 'close', recipeId: '...'}}
```

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
- Streaming text display (tokens appear as received)
- Loading indicator during LLM processing
- Auto-scroll to latest message
- Clear conversation button

### State

Local component state only (no Redux). Chat state does not persist across navigation.

### Websocket Subscriptions

- `mcp-chat`: send/receive chat messages
- `mcp-gui-action`: handle recipe open/reload/close by dispatching existing Redux actions

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

## Out of Scope (Initial Implementation)

- File/image attachments in chat
- Persistent chat history
- Multiple chat threads
- Recipe context awareness (knowing which recipe is currently open)
- Direct UI manipulation beyond open/reload/close
- Per-user LLM provider selection
- GEE task submission (export/download) via MCP tools
