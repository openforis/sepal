# CLAUDE.md - modules/ceo-gateway

Gateway/proxy to Collect Earth Online (CEO) service. Validates CEO tokens, forwards requests, maintains session state.

## Commands

```bash
npm test              # Jest (no test files currently exist)
npm run testWatch     # Jest watch mode
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

- **Token via header**: CEO token passed as `x-ceo-token` request header, forwarded as Cookie to CEO
- **302 = expired**: CEO returns 302 redirect when token expires (not 401)
- **`requiredQueryParam()` helper**: Validates required query parameters, throws ClientException if missing
- **No database or message queue**
