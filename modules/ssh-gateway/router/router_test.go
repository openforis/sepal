package main

import (
	"bytes"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/tg123/sshpiper/libplugin"
	"golang.org/x/crypto/ssh"
)

func TestALoginWithoutAnInstanceGoesToTheMenu(t *testing.T) {
	gateway := aGateway(t)

	upstream, err := gateway.router.password(aConnection("alice"), []byte("secret"))

	assertUpstream(t, upstream, err, "tcp://127.0.0.1:2222", "alice", gateway.sepalKey)
	if len(upstream.Env) != 0 {
		t.Errorf("env = %v; want none", upstream.Env)
	}
}

func TestALoginNamingARunningInstanceGoesToItsSandbox(t *testing.T) {
	gateway := aGateway(t, aSession("s-1", "funky-name", "ACTIVE"))

	upstream, err := gateway.router.publicKey(aConnection("alice+funky-name"), gateway.userKey.Marshal())

	assertUpstream(t, upstream, err, "tcp://10.0.0.1:222", "sepal-user", gateway.sepalKey)
}

// A client asks whether a key would be accepted before proving it holds the key; sshpiper routes on the question.
func TestTheSandboxIsOnlyMarkedOpenedOnceTheConnectionIsEstablished(t *testing.T) {
	gateway := aGateway(t, aSession("s-1", "funky-name", "ACTIVE"))
	connection := aConnection("alice+funky-name")
	_, err := gateway.router.publicKey(connection, gateway.userKey.Marshal())
	if err != nil {
		t.Fatal(err)
	}
	if opened := gateway.worker.openedSessions(); len(opened) != 0 {
		t.Fatalf("sessions opened before the pipe started: %v", opened)
	}

	gateway.router.pipeStart(connection)

	if opened := gateway.worker.openedSessions(); len(opened) != 1 || opened[0] != "s-1" {
		t.Fatalf("sessions opened = %v; want [s-1]", opened)
	}
}

func TestAMenuLoginMarksNothingOpened(t *testing.T) {
	gateway := aGateway(t, aSession("s-1", "funky-name", "ACTIVE"))
	connection := aConnection("alice")
	if _, err := gateway.router.password(connection, []byte("secret")); err != nil {
		t.Fatal(err)
	}

	gateway.router.pipeStart(connection)

	if opened := gateway.worker.openedSessions(); len(opened) != 0 {
		t.Fatalf("sessions opened = %v; want none", opened)
	}
}

// sshpiperd closes a connection that has not started its pipe within its login grace time.
func TestARoutingDecisionIsForgottenOnceItsLoginCanNoLongerComplete(t *testing.T) {
	gateway := aGateway(t, aSession("s-1", "funky-name", "ACTIVE"))
	abandoned := aConnection("alice+funky-name")
	if _, err := gateway.router.publicKey(abandoned, gateway.userKey.Marshal()); err != nil {
		t.Fatal(err)
	}
	gateway.clock = gateway.clock.Add(pendingOpenLifetime + time.Second)
	if _, err := gateway.router.publicKey(aConnection("alice+funky-name"), gateway.userKey.Marshal()); err != nil {
		t.Fatal(err)
	}

	gateway.router.pipeStart(abandoned)

	if opened := gateway.worker.openedSessions(); len(opened) != 0 {
		t.Fatalf("sessions opened = %v; want none", opened)
	}
}

func TestALoginNamingNoRunningInstanceGoesToTheMenuWithTheReason(t *testing.T) {
	gateway := aGateway(t, aSession("s-1", "brave-otter", "ACTIVE"))

	upstream, err := gateway.router.password(aConnection("alice+funky-name"), []byte("secret"))

	assertUpstream(t, upstream, err, "tcp://127.0.0.1:2222", "alice", gateway.sepalKey)
	want := "No running instance named funky-name. Your instances: brave-otter"
	if upstream.Env["SEPAL_ROUTING_ERROR"] != want {
		t.Errorf("SEPAL_ROUTING_ERROR = %q; want %q", upstream.Env["SEPAL_ROUTING_ERROR"], want)
	}
}

func TestALoginNeverReachesAnotherUsersInstance(t *testing.T) {
	gateway := aGateway(t, aSession("s-1", "funky-name", "ACTIVE"))
	gateway.addUser("bob")

	upstream, err := gateway.router.password(aConnection("bob+funky-name"), []byte("secret"))

	assertUpstream(t, upstream, err, "tcp://127.0.0.1:2222", "bob", gateway.keyOf("bob"))
	if upstream.Env["SEPAL_ROUTING_ERROR"] == "" {
		t.Error("no routing error")
	}
}

func TestKeyboardInteractiveLoginsAskForThePassword(t *testing.T) {
	gateway := aGateway(t)
	var question string
	var echo bool
	challenge := func(_, _, q string, e bool) (string, error) {
		question, echo = q, e
		return "secret", nil
	}

	upstream, err := gateway.router.keyboardInteractive(aConnection("alice"), challenge)

	assertUpstream(t, upstream, err, "tcp://127.0.0.1:2222", "alice", gateway.sepalKey)
	if question != "Password: " || echo {
		t.Errorf("asked %q, echo %v; want \"Password: \", no echo", question, echo)
	}
}

func TestLoginsAreRefused(t *testing.T) {
	cases := []struct {
		name  string
		login func(g *gateway) (*libplugin.Upstream, error)
	}{
		{"wrong password", func(g *gateway) (*libplugin.Upstream, error) {
			return g.router.password(aConnection("alice"), []byte("guess"))
		}},
		{"unauthorized key", func(g *gateway) (*libplugin.Upstream, error) {
			return g.router.publicKey(aConnection("alice+funky-name"), aPublicKey(t).Marshal())
		}},
		{"username SEPAL cannot issue", func(g *gateway) (*libplugin.Upstream, error) {
			return g.router.password(aConnection("../alice"), []byte("secret"))
		}},
		{"user without a SEPAL key", func(g *gateway) (*libplugin.Upstream, error) {
			if err := os.Remove(filepath.Join(g.homeDir, "alice", ".ssh", "id_rsa")); err != nil {
				t.Fatal(err)
			}
			return g.router.password(aConnection("alice"), []byte("secret"))
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			gateway := aGateway(t, aSession("s-1", "funky-name", "ACTIVE"))

			if upstream, err := c.login(gateway); err == nil {
				t.Fatalf("login accepted with upstream %v", upstream)
			}
		})
	}
}

func TestLoginsAreRefusedWhenTheUserModuleIsDown(t *testing.T) {
	gateway := aGateway(t)
	gateway.router.users = userModuleWith(t, statusHandler(http.StatusBadGateway))

	if _, err := gateway.router.password(aConnection("alice"), []byte("secret")); err == nil {
		t.Fatal("login accepted")
	}
}

func TestLoginsNamingAnInstanceAreRefusedWhenTheWorkerIsDown(t *testing.T) {
	gateway := aGateway(t)
	gateway.router.worker = workerModuleWith(t, statusHandler(http.StatusBadGateway))

	if _, err := gateway.router.password(aConnection("alice+funky-name"), []byte("secret")); err == nil {
		t.Fatal("login accepted")
	}
}

type gateway struct {
	router   *router
	worker   *fakeWorker
	homeDir  string
	sepalKey []byte
	userKey  ssh.PublicKey
	keys     map[string][]ssh.PublicKey
	clock    time.Time
}

// aGateway has alice, with password "secret", her SEPAL key in her home directory, a key of her own, and the
// given sessions.
func aGateway(t *testing.T, sessions ...session) *gateway {
	g := &gateway{
		worker:  &fakeWorker{reports: map[string][]session{"alice": sessions}, openedStatus: http.StatusOK},
		homeDir: t.TempDir(),
		userKey: aPublicKey(t),
		keys:    map[string][]ssh.PublicKey{},
		clock:   time.Date(2026, 9, 28, 12, 0, 0, 0, time.UTC),
	}
	users := http.NewServeMux()
	users.Handle("/auth/password", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, known := g.keys[r.PostFormValue("username")]; known && r.PostFormValue("password") == "secret" {
			return
		}
		w.WriteHeader(http.StatusUnauthorized)
	}))
	users.Handle("/auth/authorized-keys", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		for _, key := range g.keys[r.URL.Query().Get("username")] {
			_, _ = w.Write(ssh.MarshalAuthorizedKey(key))
		}
	}))
	g.router = newRouter(userModuleWith(t, users), workerModuleWith(t, g.worker.handler()), g.homeDir)
	g.router.now = func() time.Time { return g.clock }
	g.sepalKey = g.addUser("alice")
	g.keys["alice"] = []ssh.PublicKey{g.userKey}
	return g
}

func (g *gateway) addUser(username string) []byte {
	sshDir := filepath.Join(g.homeDir, username, ".ssh")
	if err := os.MkdirAll(sshDir, 0o700); err != nil {
		panic(err)
	}
	sepalKey := []byte("SEPAL key of " + username)
	if err := os.WriteFile(filepath.Join(sshDir, "id_rsa"), sepalKey, 0o600); err != nil {
		panic(err)
	}
	g.keys[username] = []ssh.PublicKey{}
	return sepalKey
}

func (g *gateway) keyOf(username string) []byte {
	key, err := os.ReadFile(filepath.Join(g.homeDir, username, ".ssh", "id_rsa"))
	if err != nil {
		panic(err)
	}
	return key
}

func assertUpstream(t *testing.T, upstream *libplugin.Upstream, err error, uri, user string, key []byte) {
	t.Helper()
	if err != nil {
		t.Fatalf("login refused: %v", err)
	}
	if upstream.Uri != uri || upstream.UserName != user || !bytes.Equal(upstream.GetPrivateKey().GetPrivateKey(), key) {
		t.Fatalf("upstream = %s as %s with key %q; want %s as %s with key %q",
			upstream.Uri, upstream.UserName, upstream.GetPrivateKey().GetPrivateKey(), uri, user, key)
	}
}

type connection struct {
	user     string
	uniqueID string
}

func aConnection(user string) *connection {
	connections++
	return &connection{user: user, uniqueID: fmt.Sprintf("%s#%d", user, connections)}
}

var connections int

func (c *connection) User() string            { return c.user }
func (c *connection) RemoteAddr() string      { return "192.0.2.1:50000" }
func (c *connection) UniqueID() string        { return c.uniqueID }
func (c *connection) GetMeta(_ string) string { return "" }
