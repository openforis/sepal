package org.openforis.sepal.component.user.adapter

import groovymvc.security.UsernamePasswordVerifier
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import javax.naming.AuthenticationException
import javax.naming.directory.InitialDirContext

import static javax.naming.Context.*

class LdapUsernamePasswordVerifier implements UsernamePasswordVerifier {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final String ldapHost

    LdapUsernamePasswordVerifier(String ldapHost) {
        this.ldapHost = ldapHost
    }

    boolean verify(String username, String password) {
        def env = [
                (INITIAL_CONTEXT_FACTORY): 'com.sun.jndi.ldap.LdapCtxFactory',
                (PROVIDER_URL)           : "ldap://$ldapHost" as String,
                (SECURITY_AUTHENTICATION): 'simple',
                (SECURITY_PRINCIPAL)     : "uid=${escapeDN(username)},ou=People,dc=sepal,dc=org" as String,
                (SECURITY_CREDENTIALS)   : password
        ]
        try {
            new InitialDirContext(new Hashtable(env)).close()
            LOG.debug("Successfully authenticated " + username)
            return true
        } catch (AuthenticationException e) {
            LOG.debug("Failed to authenticate " + username + ": " + (env + [(SECURITY_CREDENTIALS): '*****']), e)
            return false
        }
    }


    static String escapeDN(String name) {
        def sb = new StringBuilder()
        if ((name.length() > 0) && ((name.charAt(0) as String == ' ') || (name.charAt(0) as String == '#')))
            sb.append('\\') // add the leading backslash if needed
        for (int i = 0; i < name.length(); i++) {
            char curChar = name.charAt(i)
            switch (curChar) {
                case '\\':
                    sb.append("\\\\")
                    break
                case ',':
                    sb.append("\\,")
                    break
                case '+':
                    sb.append("\\+")
                    break
                case '"':
                    sb.append("\\\"")
                    break
                case '<':
                    sb.append("\\<")
                    break
                case '>':
                    sb.append("\\>")
                    break
                case '':
                    sb.append("\\")
                    break
                default:
                    sb.append(curChar)
            }
        }
        if ((name.length() > 1) && (name.charAt(name.length() - 1) as String == ' '))
            sb.insert(sb.length() - 1, '\\') // add the trailing backslash if needed
        return sb.toString()
    }
}
