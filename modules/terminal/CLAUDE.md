# CLAUDE.md - modules/terminal

WebSocket-based terminal emulation. Creates PTY sessions for user SSH access, bridging WebSocket communication with terminal I/O.

## Commands

```bash
npm test              # Jest (no test files currently exist)
npm run testWatch     # Jest watch mode
```

## Key Architecture

### Entry Point
`src/main.js` - Express.js app with `express-ws` middleware. Two routes:
- `WS /:sessionId` - WebSocket terminal connection
- `POST /:sessionId/size` - Terminal resize

### Terminal Bridge
`src/terminal.js` - WebSocket <-> PTY bridging using RxJS:
- Heartbeat: empty ping every 3 seconds to keep connection alive
- Output buffering: 10ms `bufferTime` batches terminal output before WebSocket send
- Cleanup: removes temp SSH key files on disconnect

### PTY Sessions
`src/session.js` - Uses `node-pty` for pseudo-terminal spawning:
- Sessions stored in module-level object (synchronous, in-memory)
- SSH script spawning with username and key file paths
- Default terminal size: 80x24
- **Path traversal protection**: validates keyFile path is within homeDir

## Non-Obvious Conventions

- **Uses Express.js** (not Koa) with `express-ws` for WebSocket integration
- **Temp SSH keys**: Written to `/tmp/${username}-${sessionId}.key`, cleaned up on disconnect
- **RxJS streams**: `merge()` combines heartbeat interval with terminal data observable
- **User extraction**: Parses `sepal-user` header from WebSocket upgrade request
