package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
)

func TestSessionsListsTheUsersSessionsFromTheirReport(t *testing.T) {
	funky := aSession("s-1", "funky-name", "ACTIVE")
	worker := workerModuleWith(t, (&fakeWorker{reports: map[string][]session{"alice": {funky}}}).handler())

	sessions, err := worker.sessions("alice")

	if err != nil || len(sessions) != 1 || sessions[0] != funky {
		t.Fatalf("sessions = %+v, %v; want [%+v], nil", sessions, err, funky)
	}
}

func TestSessionsFailsWhenTheWorkerFails(t *testing.T) {
	worker := workerModuleWith(t, statusHandler(http.StatusInternalServerError))

	if _, err := worker.sessions("alice"); err == nil {
		t.Fatal("sessions succeeded against a failing worker")
	}
}

func TestOpenedTellsTheWorkerTheUserOpenedTheSession(t *testing.T) {
	fake := &fakeWorker{reports: map[string][]session{"alice": {aSession("s-1", "funky-name", "ACTIVE")}}, openedStatus: http.StatusOK}
	worker := workerModuleWith(t, fake.handler())

	err := worker.opened("alice", "s-1")

	if opened := fake.openedSessions(); err != nil || len(opened) != 1 || opened[0] != "s-1" {
		t.Fatalf("opened = %v, sessions opened %v; want nil, [s-1]", err, opened)
	}
}

// 409: the session's lease already runs past what opening it would give.
func TestOpenedAcceptsASessionThatNeedsNoExtension(t *testing.T) {
	fake := &fakeWorker{reports: map[string][]session{"alice": {aSession("s-1", "funky-name", "ACTIVE")}}, openedStatus: http.StatusConflict}
	worker := workerModuleWith(t, fake.handler())

	if err := worker.opened("alice", "s-1"); err != nil {
		t.Fatalf("opened = %v; want nil", err)
	}
}

func TestOpenedFailsWhenTheWorkerFails(t *testing.T) {
	worker := workerModuleWith(t, statusHandler(http.StatusInternalServerError))

	if err := worker.opened("alice", "s-1"); err == nil {
		t.Fatal("opened succeeded against a failing worker")
	}
}

const workerPassword = "admin-password"

func workerModuleWith(t *testing.T, handler http.Handler) *workerModule {
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	return &workerModule{baseURL: server.URL, password: workerPassword, client: server.Client()}
}

// fakeWorker answers only requests made as the worker expects them from the gateway: as sepaladmin, acting for
// the user with the admin role.
type fakeWorker struct {
	reports      map[string][]session
	openedStatus int
	mu           sync.Mutex
	opened       []string
}

func (f *fakeWorker) addSession(username string, s session) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.reports[username] = append(f.reports[username], s)
}

func (f *fakeWorker) openedSessions() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.opened...)
}

func (f *fakeWorker) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /sessions/{username}/report", func(w http.ResponseWriter, r *http.Request) {
		username := r.PathValue("username")
		if !actsFor(r, username) {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		f.mu.Lock()
		sessions := f.reports[username]
		f.mu.Unlock()
		report := map[string]any{"sessions": sessionMaps(username, sessions), "instanceTypes": []any{}}
		_ = json.NewEncoder(w).Encode(report)
	})
	mux.HandleFunc("POST /sessions/session/{id}/opened", func(w http.ResponseWriter, r *http.Request) {
		if !f.owns(r, r.PathValue("id")) {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		f.mu.Lock()
		f.opened = append(f.opened, r.PathValue("id"))
		f.mu.Unlock()
		w.WriteHeader(f.openedStatus)
	})
	return mux
}

func (f *fakeWorker) owns(r *http.Request, sessionID string) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	for username, sessions := range f.reports {
		for _, s := range sessions {
			if s.ID == sessionID {
				return actsFor(r, username)
			}
		}
	}
	return false
}

func actsFor(r *http.Request, username string) bool {
	user, password, ok := r.BasicAuth()
	var sepalUser struct {
		Username string   `json:"username"`
		Roles    []string `json:"roles"`
	}
	err := json.Unmarshal([]byte(r.Header.Get("sepal-user")), &sepalUser)
	return ok && user == "sepaladmin" && password == workerPassword && err == nil &&
		sepalUser.Username == username && len(sepalUser.Roles) == 1 && sepalUser.Roles[0] == "application_admin"
}

func sessionMaps(username string, sessions []session) []map[string]any {
	maps := []map[string]any{}
	for _, s := range sessions {
		maps = append(maps, map[string]any{
			"id": s.ID, "name": s.Name, "status": s.Status, "host": s.Host, "username": username, "apps": []any{},
		})
	}
	return maps
}

func aSession(id, name, status string) session {
	return session{ID: id, Name: name, Status: status, Host: "10.0.0." + id[len(id)-1:]}
}
