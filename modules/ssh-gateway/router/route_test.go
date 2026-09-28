package main

import "testing"

func TestChooseRouteRoutesToTheOneActiveSessionWithTheName(t *testing.T) {
	target := aSession("s-2", "funky-name", "ACTIVE")
	sessions := []session{aSession("s-1", "other-name", "ACTIVE"), target}

	route := chooseRoute("alice", "funky-name", sessions)

	if route.session == nil || *route.session != target || route.routingError != "" {
		t.Fatalf("chooseRoute = %+v; want session %+v", route, target)
	}
}

func TestChooseRoutePrefersTheActiveSessionOverAStartingOneWithTheSameName(t *testing.T) {
	target := aSession("s-2", "funky-name", "ACTIVE")
	sessions := []session{aSession("s-1", "funky-name", "STARTING"), target}

	route := chooseRoute("alice", "funky-name", sessions)

	if route.session == nil || *route.session != target {
		t.Fatalf("chooseRoute = %+v; want session %+v", route, target)
	}
}

func TestChooseRouteNamesTheUsersInstancesWhenNoneHasTheName(t *testing.T) {
	sessions := []session{aSession("s-1", "brave-otter", "ACTIVE"), aSession("s-2", "calm-heron", "STARTING")}

	route := chooseRoute("alice", "funky-name", sessions)

	assertRoutingError(t, route, "No running instance named funky-name. Your instances: brave-otter, calm-heron")
}

func TestChooseRouteSaysTheUserHasNoInstances(t *testing.T) {
	route := chooseRoute("alice", "funky-name", nil)

	assertRoutingError(t, route, "No running instance named funky-name. You have no running instances.")
}

func TestChooseRouteSaysAStartingInstanceIsStillStarting(t *testing.T) {
	sessions := []session{aSession("s-1", "funky-name", "STARTING")}

	route := chooseRoute("alice", "funky-name", sessions)

	assertRoutingError(t, route, "Instance funky-name is still starting. Try again in a moment.")
}

func TestChooseRouteRefusesToGuessBetweenActiveInstancesWithTheSameName(t *testing.T) {
	sessions := []session{aSession("s-1", "funky-name", "ACTIVE"), aSession("s-2", "funky-name", "ACTIVE")}

	route := chooseRoute("alice", "funky-name", sessions)

	assertRoutingError(t, route, "More than one instance is named funky-name. Log in as alice to choose one from the menu.")
}

func assertRoutingError(t *testing.T, route route, want string) {
	t.Helper()
	if route.session != nil || route.routingError != want {
		t.Fatalf("chooseRoute = %+v; want routing error %q", route, want)
	}
}
