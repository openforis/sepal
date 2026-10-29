package main

import (
	"crypto/subtle"
	"fmt"
	"io"
	"net/http"
	"net/url"

	"golang.org/x/crypto/ssh"
)

// A user's authorized keys are the SEPAL key plus at most 20 of their own.
const maxAuthorizedKeysSize = 64 * 1024

// userModule checks SSH credentials with the user module, which only accepts ACTIVE users.
type userModule struct {
	baseURL string
	client  *http.Client
}

// The user module throttles failed password logins per username at a client address and per client address,
// answering 429 without checking the password.
func (u *userModule) checkPassword(username string, password []byte, clientIP string) (bool, error) {
	response, err := u.client.PostForm(u.baseURL+"/auth/password", url.Values{
		"username": {username},
		"password": {string(password)},
		"clientIp": {clientIP},
	})
	if err != nil {
		return false, err
	}
	defer response.Body.Close()
	switch response.StatusCode {
	case http.StatusOK:
		return true, nil
	case http.StatusUnauthorized, http.StatusTooManyRequests:
		return false, nil
	default:
		return false, fmt.Errorf("user module answered %d to a password check", response.StatusCode)
	}
}

func (u *userModule) hasKey(username string, key []byte) (bool, error) {
	response, err := u.client.Get(u.baseURL + "/auth/authorized-keys?" + url.Values{"username": {username}}.Encode())
	if err != nil {
		return false, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return false, fmt.Errorf("user module answered %d to an authorized-keys lookup", response.StatusCode)
	}
	authorizedKeys, err := io.ReadAll(io.LimitReader(response.Body, maxAuthorizedKeysSize))
	if err != nil {
		return false, err
	}
	for rest := authorizedKeys; len(rest) > 0; {
		authorized, _, _, next, err := ssh.ParseAuthorizedKey(rest)
		if err != nil {
			// ParseAuthorizedKey skips unparsable lines itself; an error means no key is left.
			return false, nil
		}
		if subtle.ConstantTimeCompare(authorized.Marshal(), key) == 1 {
			return true, nil
		}
		rest = next
	}
	return false, nil
}
