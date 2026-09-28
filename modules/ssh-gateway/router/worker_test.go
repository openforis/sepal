package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSessionsListsTheUsersSessionsFromTheirReport(t *testing.T) {
	session := aSession("s-1", "funky-name", "ACTIVE")
	worker := workerModuleWith(t, reportHandler("alice", session))

	sessions, err := worker.sessions("alice")

	if err != nil || len(sessions) != 1 || sessions[0] != session {
		t.Fatalf("sessions = %+v, %v; want [%+v], nil", sessions, err, session)
	}
}

func TestSessionsFailsWhenTheWorkerFails(t *testing.T) {
	worker := workerModuleWith(t, statusHandler(http.StatusInternalServerError))

	if _, err := worker.sessions("alice"); err == nil {
		t.Fatal("sessions succeeded against a failing worker")
	}
}

func TestOpenedTellsTheWorkerTheUserOpenedTheSession(t *testing.T) {
	var opened []string
	worker := workerModuleWith(t, openedHandler("alice", &opened, http.StatusOK))

	err := worker.opened("alice", "s-1")

	if err != nil || len(opened) != 1 || opened[0] != "s-1" {
		t.Fatalf("opened = %v, sessions opened %v; want nil, [s-1]", err, opened)
	}
}

// 409: the session's lease already runs past what opening it would give.
func TestOpenedAcceptsASessionThatNeedsNoExtension(t *testing.T) {
	var opened []string
	worker := workerModuleWith(t, openedHandler("alice", &opened, http.StatusConflict))

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

// reportHandler answers only requests made as the worker expects them from the gateway: as sepaladmin, acting
// for username with the admin role.
func reportHandler(username string, sessions ...session) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/sessions/"+username+"/report" || !actsFor(r, username) {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		report := map[string]any{"sessions": sessionMaps(sessions), "instanceTypes": []any{}}
		_ = json.NewEncoder(w).Encode(report)
	})
}

func openedHandler(username string, opened *[]string, status int) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /sessions/session/{id}/opened", func(w http.ResponseWriter, r *http.Request) {
		if !actsFor(r, username) {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		*opened = append(*opened, r.PathValue("id"))
		w.WriteHeader(status)
	})
	return mux
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

func sessionMaps(sessions []session) []map[string]any {
	maps := []map[string]any{}
	for _, s := range sessions {
		maps = append(maps, map[string]any{
			"id": s.ID, "name": s.Name, "status": s.Status, "host": s.Host, "username": "alice", "apps": []any{},
		})
	}
	return maps
}

func aSession(id, name, status string) session {
	return session{ID: id, Name: name, Status: status, Host: "10.0.0." + id[len(id)-1:]}
}
