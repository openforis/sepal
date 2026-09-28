package main

import (
	"errors"
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
	sandboxPort = "222"
	sandboxUser = "sepal-user"
)

// Well past sshpiperd's login grace time (30s), after which a connection that has not started its pipe is closed.
const pendingOpenLifetime = 5 * time.Minute

var errRefused = errors.New("login refused")

// router decides, per SSH connection, whether the client is who they say they are and where the connection goes.
type router struct {
	users   *userModule
	worker  *workerModule
	homeDir string
	now     func() time.Time

	mu sync.Mutex
	// Sandbox sessions to mark opened once their connection's pipe starts, by connection. sshpiper routes a
	// public key before the client proves it holds the key, so routing alone must not extend a session.
	pendingOpens map[string]pendingOpen
}

type pendingOpen struct {
	username  string
	sessionID string
	routedAt  time.Time
}

func newRouter(users *userModule, worker *workerModule, homeDir string) *router {
	return &router{users: users, worker: worker, homeDir: homeDir, now: time.Now, pendingOpens: map[string]pendingOpen{}}
}

func (r *router) password(conn libplugin.ConnMetadata, password []byte) (*libplugin.Upstream, error) {
	login, err := r.login(conn)
	if err != nil {
		return nil, err
	}
	ok, err := r.users.checkPassword(login.username, password)
	if err := r.authenticated(conn, ok, err); err != nil {
		return nil, err
	}
	return r.upstream(conn, login)
}

func (r *router) publicKey(conn libplugin.ConnMetadata, key []byte) (*libplugin.Upstream, error) {
	login, err := r.login(conn)
	if err != nil {
		return nil, err
	}
	ok, err := r.users.hasKey(login.username, key)
	if err := r.authenticated(conn, ok, err); err != nil {
		return nil, err
	}
	return r.upstream(conn, login)
}

func (r *router) keyboardInteractive(conn libplugin.ConnMetadata, challenge libplugin.KeyboardInteractiveChallenge) (*libplugin.Upstream, error) {
	password, err := challenge("", "", "Password: ", false)
	if err != nil {
		return nil, err
	}
	return r.password(conn, []byte(password))
}

func (r *router) pipeStart(conn libplugin.ConnMetadata) {
	open, ok := r.takePendingOpen(conn.UniqueID())
	if !ok {
		return
	}
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
	login, ok := parseLogin(conn.User())
	if !ok {
		slog.Info("login refused: not a SEPAL username", "login", conn.User(), "client", conn.RemoteAddr())
		return login, errRefused
	}
	return login, nil
}

func (r *router) authenticated(conn libplugin.ConnMetadata, ok bool, err error) error {
	if err != nil {
		slog.Error("cannot authenticate", "login", conn.User(), "client", conn.RemoteAddr(), "error", err)
		return err
	}
	if !ok {
		return errRefused
	}
	return nil
}

func (r *router) upstream(conn libplugin.ConnMetadata, login login) (*libplugin.Upstream, error) {
	sepalKey, err := os.ReadFile(filepath.Join(r.homeDir, login.username, ".ssh", "id_rsa"))
	if err != nil {
		slog.Error("cannot read the user's SEPAL key", "user", login.username, "error", err)
		return nil, err
	}
	if login.target == "" {
		return menuUpstream(login.username, sepalKey, ""), nil
	}
	sessions, err := r.worker.sessions(login.username)
	if err != nil {
		slog.Error("cannot list the user's sessions", "user", login.username, "error", err)
		return nil, err
	}
	route := chooseRoute(login.username, login.target, sessions)
	if route.session == nil {
		slog.Info("routing to the menu", "user", login.username, "target", login.target, "client", conn.RemoteAddr(), "reason", route.routingError)
		return menuUpstream(login.username, sepalKey, route.routingError), nil
	}
	slog.Info("routing to a sandbox", "user", login.username, "target", login.target, "session", route.session.ID,
		"host", route.session.Host, "connection", conn.UniqueID(), "client", conn.RemoteAddr())
	r.addPendingOpen(conn.UniqueID(), pendingOpen{username: login.username, sessionID: route.session.ID, routedAt: r.now()})
	return &libplugin.Upstream{
		Uri:      "tcp://" + net.JoinHostPort(route.session.Host, sandboxPort),
		UserName: sandboxUser,
		Auth:     libplugin.CreatePrivateKeyAuth(sepalKey),
	}, nil
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

func (r *router) addPendingOpen(connection string, open pendingOpen) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for id, pending := range r.pendingOpens {
		if open.routedAt.Sub(pending.routedAt) > pendingOpenLifetime {
			delete(r.pendingOpens, id)
		}
	}
	r.pendingOpens[connection] = open
}

func (r *router) takePendingOpen(connection string) (pendingOpen, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	open, ok := r.pendingOpens[connection]
	delete(r.pendingOpens, connection)
	return open, ok
}
