package main

import (
	"regexp"
	"strings"
)

// The format the user module validates new usernames against.
var usernameFormat = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9]*$`)

// login is an SSH username read as a SEPAL user and, after the first "+", the instance they asked for.
type login struct {
	username string
	target   string
}

// SEPAL stores usernames lower-cased, and the username names the user's home directory, so it is
// lower-cased like the target.
func parseLogin(sshUser string) (login, bool) {
	username, target, _ := strings.Cut(sshUser, "+")
	if !usernameFormat.MatchString(username) {
		return login{}, false
	}
	return login{username: strings.ToLower(username), target: strings.ToLower(target)}, true
}
