package main

import (
	"errors"
	"fmt"
	"log/slog"
	"net"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/tg123/sshpiper/libplugin"
)

const (
	menuAddress = "127.0.0.1:2222"
	sandboxUser = "sepal-user"
)

// sshpiper logs in upstream for every public key the router routes, before the client proves it holds the key. A
// client normally needs one; the limit keeps a client holding only a user's public key from making the gateway log in
// upstream as that user again and again.
const maxKeyRoutingsPerConnection = 2

// Well past sshpiperd's login grace time (30s), after which a connection that has not started its pipe is closed.
const connectionStateLifetime = 5 * time.Minute

const sandboxReachTimeout = 3 * time.Second

var errRefused = errors.New("login refused")

// router decides, per SSH connection, whether the client is who they say they are and where the connection goes.
type router struct {
	users       *userModule
	worker      *workerModule
	homeDir     string
	sandboxPort string
	now         func() time.Time

	mu          sync.Mutex
	connections map[string]*connectionState
}

// connectionState is what the router remembers of a connection until its pipe starts.
type connectionState struct {
	seenAt      time.Time
	keyRoutings int
	// Routing alone must not extend a session: sshpiper routes a public key before the client proves it holds it.
	pendingOpen *pendingOpen
}

type pendingOpen struct {
	username  string
	sessionID string
}

func newRouter(users *userModule, worker *workerModule, homeDir string) *router {
	return &router{
		users:       users,
		worker:      worker,
		homeDir:     homeDir,
		sandboxPort: "222",
		now:         time.Now,
		connections: map[string]*connectionState{},
	}
}

func (r *router) password(conn libplugin.ConnMetadata, password []byte) (*libplugin.Upstream, error) {
	requested, err := r.login(conn)
	if err != nil {
		return nil, err
	}
	ok, err := r.users.checkPassword(requested.username, password)
	if err := r.authenticated(conn, "password", ok, err); err != nil {
		return nil, err
	}
	return r.upstream(conn, requested)
}

func (r *router) publicKey(conn libplugin.ConnMetadata, key []byte) (*libplugin.Upstream, error) {
	requested, err := r.login(conn)
	if err != nil {
		return nil, err
	}
	ok, err := r.users.hasKey(requested.username, key)
	if err := r.authenticated(conn, "publickey", ok, err); err != nil {
		return nil, err
	}
	if !r.countKeyRouting(conn.UniqueID()) {
		slog.Warn("login refused: too many public keys routed on one connection", "login", conn.User(), "client", conn.RemoteAddr())
		return nil, errRefused
	}
	return r.upstream(conn, requested)
}

func (r *router) keyboardInteractive(conn libplugin.ConnMetadata, challenge libplugin.KeyboardInteractiveChallenge) (*libplugin.Upstream, error) {
	password, err := challenge("", "", "Password: ", false)
	if err != nil {
		return nil, err
	}
	return r.password(conn, []byte(password))
}

func (r *router) pipeStart(conn libplugin.ConnMetadata) {
	state := r.forgetConnection(conn.UniqueID())
	if state == nil || state.pendingOpen == nil {
		return
	}
	open := state.pendingOpen
	if err := r.worker.opened(open.username, open.sessionID); err != nil {
		slog.Warn("cannot mark the session opened", "user", open.username, "session", open.sessionID, "error", err)
	}
}

func (r *router) pipeError(conn libplugin.ConnMetadata, err error) {
	slog.Info("connection closed", "login", conn.User(), "connection", conn.UniqueID(), "client", conn.RemoteAddr(), "reason", err)
}

func (r *router) upstreamAuthFailure(conn libplugin.ConnMetadata, method string, err error) {
	slog.Warn("upstream refused the login", "login", conn.User(), "connection", conn.UniqueID(), "client", conn.RemoteAddr(), "method", method, "error", err)
}

func (r *router) login(conn libplugin.ConnMetadata) (login, error) {
	requested, ok := parseLogin(conn.User())
	if !ok {
		slog.Info("login refused: not a SEPAL username", "login", conn.User(), "client", conn.RemoteAddr())
		return requested, errRefused
	}
	return requested, nil
}

func (r *router) authenticated(conn libplugin.ConnMetadata, method string, ok bool, err error) error {
	if err != nil {
		slog.Error("cannot authenticate", "login", conn.User(), "client", conn.RemoteAddr(), "method", method, "error", err)
		return err
	}
	if !ok {
		slog.Info("login refused", "login", conn.User(), "client", conn.RemoteAddr(), "method", method)
		return errRefused
	}
	return nil
}

func (r *router) upstream(conn libplugin.ConnMetadata, requested login) (*libplugin.Upstream, error) {
	sepalKey, err := os.ReadFile(filepath.Join(r.homeDir, requested.username, ".ssh", "id_rsa"))
	if err != nil {
		slog.Error("cannot read the user's SEPAL key", "user", requested.username, "error", err)
		return nil, err
	}
	if requested.target == "" {
		slog.Info("routing to the menu", "user", requested.username, "connection", conn.UniqueID(), "client", conn.RemoteAddr())
		return menuUpstream(requested.username, sepalKey, ""), nil
	}
	sessions, err := r.worker.sessions(requested.username)
	if err != nil {
		slog.Error("cannot list the user's sessions", "user", requested.username, "error", err)
		return nil, err
	}
	chosen := chooseRoute(requested.username, requested.target, sessions)
	if chosen.session == nil {
		return r.menuWithReason(conn, requested, sepalKey, chosen.routingError), nil
	}
	sandbox := net.JoinHostPort(chosen.session.Host, r.sandboxPort)
	// sshpiper reports a sandbox it cannot reach as a failed login, which would send the user on to a password prompt.
	if !reachable(sandbox) {
		reason := fmt.Sprintf("Instance %s is not reachable right now. Try again in a moment.", requested.target)
		return r.menuWithReason(conn, requested, sepalKey, reason), nil
	}
	slog.Info("routing to a sandbox", "user", requested.username, "target", requested.target, "session", chosen.session.ID,
		"host", chosen.session.Host, "connection", conn.UniqueID(), "client", conn.RemoteAddr())
	r.expectPipe(conn.UniqueID(), &pendingOpen{username: requested.username, sessionID: chosen.session.ID})
	return &libplugin.Upstream{
		Uri:      "tcp://" + sandbox,
		UserName: sandboxUser,
		Auth:     libplugin.CreatePrivateKeyAuth(sepalKey),
	}, nil
}

func (r *router) menuWithReason(conn libplugin.ConnMetadata, requested login, sepalKey []byte, reason string) *libplugin.Upstream {
	slog.Info("routing to the menu", "user", requested.username, "target", requested.target, "connection", conn.UniqueID(),
		"client", conn.RemoteAddr(), "reason", reason)
	return menuUpstream(requested.username, sepalKey, reason)
}

func menuUpstream(username string, sepalKey []byte, routingError string) *libplugin.Upstream {
	upstream := &libplugin.Upstream{
		Uri:      "tcp://" + menuAddress,
		UserName: username,
		Auth:     libplugin.CreatePrivateKeyAuth(sepalKey),
	}
	if routingError != "" {
		upstream.Env = map[string]string{"SEPAL_ROUTING_ERROR": routingError}
	}
	return upstream
}

func reachable(address string) bool {
	connection, err := net.DialTimeout("tcp", address, sandboxReachTimeout)
	if err != nil {
		return false
	}
	_ = connection.Close()
	return true
}

func (r *router) countKeyRouting(connection string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	state := r.connectionState(connection)
	state.keyRoutings++
	return state.keyRoutings <= maxKeyRoutingsPerConnection
}

func (r *router) expectPipe(connection string, open *pendingOpen) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.connectionState(connection).pendingOpen = open
}

func (r *router) forgetConnection(connection string) *connectionState {
	r.mu.Lock()
	defer r.mu.Unlock()
	state := r.connections[connection]
	delete(r.connections, connection)
	return state
}

// connectionState must be called with mu held. Connections that never start their pipe are dropped as new ones arrive.
func (r *router) connectionState(connection string) *connectionState {
	if state, ok := r.connections[connection]; ok {
		return state
	}
	now := r.now()
	for id, state := range r.connections {
		if now.Sub(state.seenAt) > connectionStateLifetime {
			delete(r.connections, id)
		}
	}
	state := &connectionState{seenAt: now}
	r.connections[connection] = state
	return state
}
