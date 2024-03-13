import {Form} from 'widget/form'
import {Layout} from 'widget/layout'
import {Notifications} from 'widget/notifications'
import {Panel} from 'widget/panel/panel'
import {actionBuilder} from 'action-builder'
import {compose} from 'compose'
import {msg} from 'translate'
import {select} from 'store'
import {updateCurrentUserSession$} from 'user'
import {withForm} from 'widget/form/form'
import React from 'react'
import format from 'format'
import moment from 'moment'
import styles from './userSession.module.css'

const fields = {
    id: new Form.Field(),
    keepAlive: new Form.Field()
}

const mapStateToProps = () => {
    const id = select('ui.selectedSessionId')
    const session = select('user.currentUserReport.sessions', {id})
    return {
        session,
        values: {
            id,
            keepAlive: session.earliestTimeoutHours
        }
    }
}

class _UserSession extends React.Component {
    suspendSession(session) {
        const {stream} = this.props
        stream('SUSPEND_USER_SESSION',
            updateCurrentUserSession$(session),
            () => Notifications.success({message: msg('user.userSession.suspend.success')}),
            error => Notifications.error({message: msg('user.userSession.suspend.error'), error})
        )
    }

    unselectSession() {
        actionBuilder('UNSELECT_SESSION')
            .del('ui.selectedSessionId')
            .dispatch()
    }

    updateSession(session) {
        updateCurrentUserSession$(session).subscribe(
            () => {
                actionBuilder('UPDATE_USER_SESSION')
                    .set(['users.currentUserReport.sessions.earliestTimeoutHours'], session.earliestTimeoutHours)
                    .dispatch()
                Notifications.success({message: msg('user.userSession.update.success')})
            },
            error => Notifications.error({message: msg('user.userSession.update.error'), error})
        )
    }

    render() {
        const {session, form, inputs: {keepAlive}} = this.props
        const sliderMessage = value => {
            const keepAliveUntil = moment().add(value, 'hours').fromNow(true)
            return msg('user.userSession.form.keepAlive.info', {keepAliveUntil})
        }
        return (
            <Form.Panel
                className={styles.panel}
                form={form}
                statePath='userSessions.userSessionPanel'
                type='modal'
                onApply={session => this.updateSession(session)}
                onClose={() => this.unselectSession()}>
                <Panel.Header
                    title={`${session.instanceType.name} (${session.instanceType.description})`}
                    label={`${format.dollars(session.costSinceCreation)} (${format.dollarsPerHour(session.instanceType.hourlyCost)})`}
                />
                <Panel.Content>
                    <Layout>
                        <Form.Slider
                            input={keepAlive}
                            decimals={2}
                            ticks={[0, 1, 3, 6, 12, 24, 36, 48, 72]}
                            scale='log'
                            info={sliderMessage}
                        />
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons/>
            </Form.Panel>
        )
    }
}

export const UserSession = compose(
    _UserSession,
    withForm({fields, mapStateToProps})
)

UserSession.propTypes = {}
