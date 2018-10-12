import {Field, Label, form} from 'widget/form'
import {Panel, PanelContent} from 'widget/panel'
import {PropTypes} from 'prop-types'
import {msg} from 'translate'
import {stopUserSession$, updateUserSession$} from 'user'
import Notifications from 'app/notifications'
import PanelButtons from 'widget/panelButtons'
import React from 'react'
import Slider from 'widget/slider'
import styles from './userSession.module.css'

const fields = {
    id: new Field(),
    keepAlive: new Field()
}

const mapStateToProps = (state, ownProps) => {
    const {session} = ownProps
    return {
        values: {
            id: session.id,
            keepAlive: session.earliestTimeoutHours
        }
    }
}

class UserSession extends React.Component {
    suspendSession(session) {
        this.props.stream('SUSPEND_USER_SESSION',
            updateUserSession$(session),
            () => Notifications.success('user.userSession.suspend').dispatch(),
            error => Notifications.caught('user.userSession.suspend', {}, error).dispatch()
        )
    }

    stopSession(session) {
        this.props.stream('STOP_USER_SESSION',
            stopUserSession$(session),
            () => {
                Notifications.success('user.userSession.stop').dispatch()
                this.props.onClose()
            },
            error => Notifications.caught('user.userSession.stop', {}, error).dispatch()
        )
    }

    updateSession(session) {
        this.props.stream('UPDATE_USER_SESSION',
            updateUserSession$(session),
            () => {
                Notifications.success('user.userSession.update').dispatch()
                this.props.onClose()
            },
            error => Notifications.caught('user.userSession.update', {}, error).dispatch()
        )
    }

    cancel() {
        this.props.onClose()
    }

    render() {
        const {session, form, inputs: {keepAlive}} = this.props
        form.onDirty(this.props.onDirty)
        return (
            <Panel className={styles.panel} inline>
                <PanelContent>
                    <div>
                        <Label msg={msg('user.userSession.form.keepAlive.label')}/>
                        <Slider
                            input={keepAlive}
                            minValue={0}
                            maxValue={72}
                            ticks={[0, 1, 3, 6, 12, 24, 36, 48, 60, 72]}
                            snap
                            logScale
                            info={value => msg('user.userSession.form.keepAlive.info', {value})}
                        />
                    </div>
                </PanelContent>
                <PanelButtons
                    form={form}
                    statePath='userSession'
                    onApply={session => this.updateSession(session)}
                    onCancel={() => this.cancel()}
                    additionalButtons={[{
                        key: 'suspend',
                        label: msg('user.userSession.suspend.label'),
                        tooltip: msg('user.userSession.suspend.tooltip'),
                        // disabled: form.isDirty(),
                        disabled: true,
                        onClick: () => this.suspendSession(session)
                    }, {
                        key: 'stop',
                        label: msg('user.userSession.stop.label'),
                        tooltip: msg('user.userSession.stop.tooltip'),
                        disabled: form.isDirty(),
                        onClick: () => this.stopSession(session)
                    }]}/>
            </Panel>
        )
    }
}

UserSession.propTypes = {
    session: PropTypes.object.isRequired,
    onClose: PropTypes.func.isRequired,
    closable: PropTypes.func
}

export default form({fields, mapStateToProps})(UserSession)
