package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
)

// session is what routing needs of a session in the worker's report.
type session struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Status string `json:"status"`
	Host   string `json:"host"`
}

// workerModule calls the worker as the menu does: as sepaladmin, acting for the user.
type workerModule struct {
	baseURL  string
	password string
	client   *http.Client
}

func (w *workerModule) sessions(username string) ([]session, error) {
	response, err := w.do(http.MethodGet, "/sessions/"+url.PathEscape(username)+"/report", username)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("worker answered %d to a session report request", response.StatusCode)
	}
	var report struct {
		Sessions []session `json:"sessions"`
	}
	if err := json.NewDecoder(response.Body).Decode(&report); err != nil {
		return nil, fmt.Errorf("unreadable session report: %w", err)
	}
	return report.Sessions, nil
}

// opened is the one-shot "terminal opened" extension. 409 means the session already runs past what it
// would give.
func (w *workerModule) opened(username, sessionID string) error {
	response, err := w.do(http.MethodPost, "/sessions/session/"+url.PathEscape(sessionID)+"/opened", username)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, response.Body)
	if response.StatusCode != http.StatusOK && response.StatusCode != http.StatusConflict {
		return fmt.Errorf("worker answered %d to a session opened notice", response.StatusCode)
	}
	return nil
}

func (w *workerModule) do(method, path, username string) (*http.Response, error) {
	request, err := http.NewRequest(method, w.baseURL+path, nil)
	if err != nil {
		return nil, err
	}
	sepalUser, err := json.Marshal(map[string]any{"username": username, "roles": []string{"application_admin"}})
	if err != nil {
		return nil, err
	}
	request.SetBasicAuth("sepaladmin", w.password)
	request.Header.Set("sepal-user", string(sepalUser))
	return w.client.Do(request)
}
