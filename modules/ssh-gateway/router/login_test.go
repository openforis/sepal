package main

import "testing"

func TestParseLogin(t *testing.T) {
	cases := []struct {
		sshUser string
		want    login
	}{
		{"alice", login{username: "alice"}},
		{"alice+funky-name", login{username: "alice", target: "funky-name"}},
		{"alice+Funky-Name", login{username: "alice", target: "funky-name"}},
		{"Alice+funky-name", login{username: "alice", target: "funky-name"}},
		{"alice+", login{username: "alice"}},
		{"alice+a+b", login{username: "alice", target: "a+b"}},
	}
	for _, c := range cases {
		got, ok := parseLogin(c.sshUser)
		if !ok || got != c.want {
			t.Errorf("parseLogin(%q) = %+v, %v; want %+v, true", c.sshUser, got, ok, c.want)
		}
	}
}

// The username ends up in a file path (the user's SEPAL key), so anything SEPAL could not have issued is refused.
func TestParseLoginRefusesUsernamesSepalCannotIssue(t *testing.T) {
	for _, sshUser := range []string{"", "+funky-name", "../root", "alice/../bob", "9alice", "alice bob"} {
		if _, ok := parseLogin(sshUser); ok {
			t.Errorf("parseLogin(%q) accepted", sshUser)
		}
	}
}
