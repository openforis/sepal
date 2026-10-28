package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"net/http"
	"net/http/httptest"
	"testing"

	"golang.org/x/crypto/ssh"
)

func TestCheckPasswordAcceptsTheUsersPassword(t *testing.T) {
	users := userModuleWith(t, passwordHandler("alice", "secret"))

	ok, err := users.checkPassword("alice", []byte("secret"))

	if err != nil || !ok {
		t.Fatalf("checkPassword = %v, %v; want true, nil", ok, err)
	}
}

func TestCheckPasswordRefusesAWrongPassword(t *testing.T) {
	users := userModuleWith(t, passwordHandler("alice", "secret"))

	ok, err := users.checkPassword("alice", []byte("guess"))

	if err != nil || ok {
		t.Fatalf("checkPassword = %v, %v; want false, nil", ok, err)
	}
}

func TestCheckPasswordFailsWhenTheUserModuleFails(t *testing.T) {
	users := userModuleWith(t, statusHandler(http.StatusInternalServerError))

	if _, err := users.checkPassword("alice", []byte("secret")); err == nil {
		t.Fatal("checkPassword succeeded against a failing user module")
	}
}

func TestHasKeyFindsTheOfferedKeyAmongTheAuthorizedKeys(t *testing.T) {
	sepalKey, userKey := aPublicKey(t), aPublicKey(t)
	users := userModuleWith(t, authorizedKeysHandler("alice", sepalKey, userKey))

	ok, err := users.hasKey("alice", userKey.Marshal())

	if err != nil || !ok {
		t.Fatalf("hasKey = %v, %v; want true, nil", ok, err)
	}
}

func TestHasKeyRefusesAKeyThatIsNotAuthorized(t *testing.T) {
	users := userModuleWith(t, authorizedKeysHandler("alice", aPublicKey(t)))

	ok, err := users.hasKey("alice", aPublicKey(t).Marshal())

	if err != nil || ok {
		t.Fatalf("hasKey = %v, %v; want false, nil", ok, err)
	}
}

// The user module answers an inactive or unknown user with an empty body.
func TestHasKeyRefusesEveryKeyWhenNoneAreAuthorized(t *testing.T) {
	users := userModuleWith(t, authorizedKeysHandler("alice"))

	ok, err := users.hasKey("alice", aPublicKey(t).Marshal())

	if err != nil || ok {
		t.Fatalf("hasKey = %v, %v; want false, nil", ok, err)
	}
}

func TestHasKeyFailsWhenTheUserModuleFails(t *testing.T) {
	users := userModuleWith(t, statusHandler(http.StatusBadGateway))

	if _, err := users.hasKey("alice", aPublicKey(t).Marshal()); err == nil {
		t.Fatal("hasKey succeeded against a failing user module")
	}
}

func userModuleWith(t *testing.T, handler http.Handler) *userModule {
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	return &userModule{baseURL: server.URL, client: server.Client()}
}

func passwordHandler(username, password string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && r.URL.Path == "/auth/password" &&
			r.PostFormValue("username") == username && r.PostFormValue("password") == password {
			return
		}
		w.WriteHeader(http.StatusUnauthorized)
	})
}

func authorizedKeysHandler(username string, keys ...ssh.PublicKey) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/auth/authorized-keys" || r.URL.Query().Get("username") != username {
			return
		}
		for _, key := range keys {
			_, _ = w.Write(ssh.MarshalAuthorizedKey(key))
		}
	})
}

func statusHandler(status int) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(status)
	})
}

func aPublicKey(t *testing.T) ssh.PublicKey {
	public, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	key, err := ssh.NewPublicKey(public)
	if err != nil {
		t.Fatal(err)
	}
	return key
}
