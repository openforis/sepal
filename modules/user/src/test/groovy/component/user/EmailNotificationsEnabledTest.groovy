package component.user

class EmailNotificationsEnabledTest extends AbstractUserTest {
    def 'A newly invited user have email notifications enabled'() {
        def user = activeUser()

        expect:
        emailNotificationsEnabled(user.email)
    }

    def 'A user can disable email notifications'() {
        def user = activeUser()

        when:
        def userWithNotificationsDisabled = updateUserDetails(user.disableEmailNotifications())

        then:
        !emailNotificationsEnabled(userWithNotificationsDisabled.email)
    }

    def 'A user can re-enable email notifications'() {
        def user = activeUser()
        def userWithNotificationsDisabled = updateUserDetails(user.disableEmailNotifications())

        when:
        def userWithNotificationsEnabled = updateUserDetails(userWithNotificationsDisabled.enableEmailNotifications())

        then:
        emailNotificationsEnabled(userWithNotificationsEnabled.email)
    }
}
