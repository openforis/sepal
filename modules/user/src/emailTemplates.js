// HTML email bodies, ported from the Java user module's email templates. Pure (no config) so they
// can be unit-tested directly; the links are built by the caller (email.js) from sepalHost.

const DOCS_FOOTER = `<p>
    SEPAL documentation:
    <a href="https://docs.sepal.io/en/latest/index.html">https://docs.sepal.io/en/latest/index.html</a>
    <br/>
    Google Group:
    <a href="https://groups.google.com/g/sepal-users">https://groups.google.com/g/sepal-users</a>
</p>`

const invitationContent = (user, activationLink) => `<h2>Hello ${user.name},</h2>

<p>
    An account on SEPAL has been created for you.
    <br>
    Please follow <a href="${activationLink}">this</a> link to activate it.
</p>
${DOCS_FOOTER}`

const passwordResetContent = (user, passwordResetLink) => `<h2>Hello ${user.name},</h2>

<p>
    We received a request for resetting your SEPAL password.
    <br>
    If you didn't make the request, you can safely ignore this email.
    <br>
    Otherwise, please follow <a href="${passwordResetLink}">this</a> link to reset your password.
</p>

${DOCS_FOOTER}`

export {invitationContent, passwordResetContent}
