# CLAUDE.md - modules/user

User management microservice. Groovy/Java, hexagonal architecture. Handles authentication, LDAP, Google OAuth.

## Build & Test

```bash
./gradlew :sepal-user:classes   # Compile
./gradlew :sepal-user:test      # Run all tests (Spock)
```

Entry point: `org.openforis.sepal.component.user.Main`

## Key Subsystems

### LDAP Integration
- `adapter/LdapUsernamePasswordVerifier.groovy`: Simple BIND to `ldap://ldap` with DN pattern `uid={username},ou=People,dc=sepal,dc=org`
- Shell scripts in `script/`: `add-sepal-user`, `change-sepal-user-password`, `delete-sepal-user` manage LDAP entries and Linux users via `ldapscripts`

### Google OAuth
- `adapter/GoogleOAuthClient.groovy` / `RestBackedGoogleOAuthClient`: Full OAuth flow (consent URL, token exchange, refresh, revocation)
- Scopes: Earth Engine, Drive, Cloud Platform projects
- Tokens stored in DB and as file at `/sepal/home/{username}/.config/earthengine/credentials`

### reCAPTCHA Enterprise v3
- `adapter/RestGoogleRecaptcha.groovy`: Validates signup/username/email endpoints
- Score-based validation with configurable minimum threshold

### Email
- `adapter/SmtpEmailGateway.groovy`: Sends invite, password reset emails
- HTML templates in `src/main/resources/.../adapter/email-*.html`

## Command/Query Pattern

18 commands (write operations), 6 queries (read operations). Key flows:

- **Signup**: `SignUpUser` -> reCAPTCHA validation -> create PENDING user -> async LDAP user creation + email
- **Activation**: `ActivateUser` -> validate token -> set password via LDAP -> status ACTIVE
- **Auth**: `Authenticate` -> LDAP BIND verification -> update last_login_time

### RabbitMQ Events
Published to `user` topic on `sepal.topic` exchange:
- `UserUpdated` - on signup, activate, update details, change password, OAuth changes
- `UserLocked` - on lock (gateway subscribes to destroy sessions)

Async processing uses `MessageBroker` queues backed by `rmb_message` DB tables for reliable delivery.

## Validation Constraints
- Username: `^[a-zA-Z_][a-zA-Z0-9]{0,29}$`
- Password: 12-100 characters
- Token expiry: 1 day (`MAX_AGE_DAYS = 1`)

## Database
- Schema: `sepal_user` (15 Flyway migrations, V1_0 through V15)
- Main table: `sepal_user` with status enum (PENDING, ACTIVE, LOCKED)

## Test Infrastructure

19 Spock test files. `AbstractUserTest` provides:
- H2 in-memory database
- `FakeMailServer` (captures emails and tokens)
- `FakeExternalUserDataGateway` (tracks user creation/deletion)
- `FakeGoogleOAuthClient` (simulates OAuth flow)
- `FakeClock` (time manipulation for expiry testing)
- `FakeGoogleRecaptcha` (always validates)
