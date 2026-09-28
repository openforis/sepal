package main

import (
	"fmt"
	"strings"
)

// route is where a login that named an instance goes: to session, or to the menu, which prints routingError
// instead of opening.
type route struct {
	session      *session
	routingError string
}

// chooseRoute only ever considers sessions from the user's own report, so a login never reaches another
// user's instance.
func chooseRoute(username, target string, sessions []session) route {
	var active, starting []session
	for _, s := range sessions {
		if s.Name != target {
			continue
		}
		if s.Status == "ACTIVE" {
			active = append(active, s)
		} else {
			starting = append(starting, s)
		}
	}
	switch {
	case len(active) == 1:
		return route{session: &active[0]}
	case len(active) > 1:
		return routingError("More than one instance is named %s. Log in as %s to choose one from the menu.", target, username)
	case len(starting) > 0:
		return routingError("Instance %s is still starting. Try again in a moment.", target)
	case len(sessions) == 0:
		return routingError("No running instance named %s. You have no running instances.", target)
	default:
		return routingError("No running instance named %s. Your instances: %s", target, strings.Join(names(sessions), ", "))
	}
}

func routingError(format string, args ...any) route {
	return route{routingError: fmt.Sprintf(format, args...)}
}

func names(sessions []session) []string {
	names := make([]string, 0, len(sessions))
	for _, s := range sessions {
		names = append(names, s.Name)
	}
	return names
}
