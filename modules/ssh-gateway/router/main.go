// sepal-router is the sshpiperd plugin in front of the ssh-gateway: `user` logs in to the menu, `user+instance`
// to the sandbox of that running instance.
package main

import (
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/tg123/sshpiper/libplugin"
	"github.com/urfave/cli/v2"
)

func main() {
	libplugin.CreateAndRunPluginTemplate(&libplugin.PluginTemplate{
		Name:  "sepal-router",
		Usage: "routes SEPAL users to the SSH menu or to one of their running instances",
		Flags: []cli.Flag{
			&cli.StringFlag{Name: "user-url", Value: "http://user", Usage: "user module base URL"},
			&cli.StringFlag{Name: "worker-url", Value: "http://worker", Usage: "worker module base URL"},
			&cli.StringFlag{Name: "password-file", Value: "/etc/sepaladmin.passwd", Usage: "sepaladmin password file"},
			&cli.StringFlag{Name: "home-dir", Value: "/home", Usage: "directory holding each user's home, with their SEPAL key"},
		},
		CreateConfig: func(c *cli.Context) (*libplugin.SshPiperPluginConfig, error) {
			password, err := os.ReadFile(c.String("password-file"))
			if err != nil {
				return nil, fmt.Errorf("cannot read the sepaladmin password: %w", err)
			}
			client := &http.Client{Timeout: 10 * time.Second}
			r := newRouter(
				&userModule{baseURL: c.String("user-url"), client: client},
				&workerModule{baseURL: c.String("worker-url"), password: strings.TrimSpace(string(password)), client: client},
				c.String("home-dir"),
			)
			return &libplugin.SshPiperPluginConfig{
				PasswordCallback:            r.password,
				PublicKeyCallback:           r.publicKey,
				KeyboardInteractiveCallback: r.keyboardInteractive,
				// sshpiperd waits for this callback before it relays anything.
				PipeStartCallback: func(conn libplugin.ConnMetadata) { go r.pipeStart(conn) },
				PipeErrorCallback: r.pipeError,
				UpstreamAuthFailureCallback: func(conn libplugin.ConnMetadata, method string, err error, _ []string) {
					r.upstreamAuthFailure(conn, method, err)
				},
			}, nil
		},
	})
}
