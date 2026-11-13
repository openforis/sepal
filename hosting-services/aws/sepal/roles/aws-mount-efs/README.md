# Restricted home mount

The main host keeps its existing EFS mount at `/data/sepal/home` for tasks and other normal workspace access.
`sepal-restricted-home.service` creates a separate bind view at `/data/sepal/restricted/home` and applies
`nosymfollow` to **that view only**. Both paths expose the same files.

The setup script first requires the original source to be an NFSv4 mount, checks that any existing target
refers to the same filesystem object, and uses an explicit bind followed by a remount. The second call
preserves existing mount flags and verifies that the kernel applied `nosymfollow`. Compose binds this
prepared view into the containers.

Docker requires the setup service, which starts after EFS and verifies the restricted mount before Docker
can start. Deployment reruns the idempotent script directly before recreating modules; it does not restart
the service, which could stop Docker through the dependency. Only `user` and `user-files` use the
restricted view. Development Compose overrides keep the normal source.

user-files resolves links itself and follows them only within each user's home (see
`modules/user-files/CLAUDE.md`). `downloads`, `.config` and `.config/earthengine` must be real directories
for privileged account/credential management; existing links are not removed or migrated. Credential storage migration is separate work. Task containers keep
normal symlink access through the original home mount.

Check host setup without changing mounts:

```sh
findmnt -rn -M /data/sepal/home -o TARGET,FSTYPE,VFS-OPTIONS
findmnt -rn -M /data/sepal/restricted/home -o TARGET,FSTYPE,VFS-OPTIONS
systemctl status sepal-restricted-home
```

Run the local setup regressions with:

```sh
python3 -m unittest discover -s hosting-services/aws/sepal/test -p 'sepal_restricted_home_test.py'
```

Release acceptance still requires checking the real EFS mount, both effective container mounts and reboot
ordering on the test server. This mount control addresses symlink traversal; it does not make separate
ownership checks and mutations atomic.
