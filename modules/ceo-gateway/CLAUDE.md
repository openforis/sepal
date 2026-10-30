# CLAUDE.md - modules/ceo-gateway

Gateway/proxy to Collect Earth Online (CEO) service. Validates CEO tokens, forwards requests, maintains session state.

## Commands

```bash
npm test              # Node test runner (no test files currently exist)
npm run testWatch     # Node test runner watch mode
```

## Key Architecture

### Entry Point
`src/main.js` - Koa HTTP server on port 80.

### Routes
`src/routes.js` - All routes use `stream()` for RxJS observable-based responses:
- `POST /login-token` - Get/refresh CEO session token
- `GET /get-all-institutions` - List institutions
- `GET /get-user-admin-institutions` - List user's admin institutions
- `GET /get-institution-projects?institutionId=X` - Projects for institution
- `GET /get-project-data?projectId=X&csvType=plot|raw` - Dump project data

### CEO Communication
`src/handlers/getFromCeo.js` - RxJS observable that:
- Reads CEO token from `x-ceo-token` request header
- Calls CEO API with token in Cookie header
- Detects token expiration via 302 redirect -> throws `ClientException`

`src/handlers/loginToken.js` - CEO session token management.

## Non-Obvious Conventions

- **`requiredQueryParam()` helper**: Validates required query parameters, throws ClientException if missing
- **No database or message queue**
