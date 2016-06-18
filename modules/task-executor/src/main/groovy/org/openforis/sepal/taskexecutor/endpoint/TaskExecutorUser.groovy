package org.openforis.sepal.taskexecutor.endpoint

import groovymvc.security.User
import groovymvc.security.UserProvider
import groovymvc.security.UsernamePasswordVerifier

import javax.naming.AuthenticationException
import javax.naming.Context
import javax.naming.directory.InitialDirContext

class TaskExecutorUser implements User {
    String username
    String name
    String email
    Set<String> roles

    boolean hasUsername(String username) {
        this.username.equalsIgnoreCase(username)
    }

    boolean hasRole(String role) {
        role in roles
    }
}

class TaskExecutorUserProvider implements UserProvider {
    User lookup(String username) {
        return null
    }
}

class LdapUsernamePasswordVerifier implements UsernamePasswordVerifier {
    private final String ldapHost

    LdapUsernamePasswordVerifier(String ldapHost) {
        this.ldapHost = ldapHost
    }

    boolean verify(String username, String password) {
        def env = [
                (Context.INITIAL_CONTEXT_FACTORY): 'com.sun.jndi.ldap.LdapCtxFactory',
                (Context.PROVIDER_URL)           : "ldap://$ldapHost" as String,
                (Context.SECURITY_AUTHENTICATION): 'simple',
                (Context.SECURITY_PRINCIPAL)     : "uid=${escapeDN(username)},ou=People,dc=sepal,dc=org" as String,
                (Context.SECURITY_CREDENTIALS)   : password
        ]
        try {
            new InitialDirContext(new Hashtable(env)).close()
            return true
        } catch (AuthenticationException ignore) {
            return false
        }
    }


    public static String escapeDN(String name) {
        StringBuffer sb = new StringBuffer() // If using JDK >= 1.5 consider using StringBuilder
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
