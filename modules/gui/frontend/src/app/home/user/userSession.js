import {Button} from 'widget/button'
import {Field, form} from 'widget/form'
import {PanelContent} from 'widget/panel'
import {PropTypes} from 'prop-types'
import {msg} from 'translate'
import {stopUserSession$, updateUserSession$} from 'user'
import FormPanel, {FormPanelButtons} from 'widget/formPanel'
import Notifications from 'widget/notifications'
import React from 'react'
import Slider from 'widget/slider'
import moment from 'moment'
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
        const {stream} = this.props
        stream('SUSPEND_USER_SESSION',
            updateUserSession$(session),
            () => Notifications.success({message: msg('user.userSession.suspend.success')}),
            error => Notifications.error({message: msg('user.userSession.suspend.error'), error})
        )
    }

    stopSession(session) {
        const {stream, onClose} = this.props
        stream('STOP_USER_SESSION',
            stopUserSession$(session),
            () => {
                Notifications.success({message: msg('user.userSession.stop.success')})
                onClose()
            },
            error => Notifications.error({message: msg('user.userSession.stop.error'), error})
        )
    }

    updateSession(session) {
        const {stream, onClose} = this.props
        stream('UPDATE_USER_SESSION',
            updateUserSession$(session),
            () => {
                Notifications.success({message: msg('user.userSession.update.success')})
                onClose()
            },
            error => Notifications.error({message: msg('user.userSession.update.error'), error})
        )
    }

    render() {
        const {session, form, inputs: {keepAlive}, onClose} = this.props
        form.onDirty(this.props.onDirty)
        const sliderMessage = value => {
            const keepAliveUntil = moment().add(value, 'hours').fromNow(true)
            return msg('user.userSession.form.keepAlive.info', {keepAliveUntil})
        }
        return (
            <FormPanel
                className={styles.panel}
                form={form}
                statePath='userSessions.userSessionPanel'
                inline
                onApply={session => this.updateSession(session)}
                close={() => onClose()}>
                <PanelContent className={styles.panelContent}>
                    <div>
                        <Slider
                            input={keepAlive}
                            decimals={2}
                            ticks={[0, 1, 3, 6, 12, 24, 36, 48, 60, 72]}
                            logScale
                            info={sliderMessage}
                        />
                    </div>
                </PanelContent>
                <FormPanelButtons>
                    <Button
                        label={msg('user.userSession.stop.label')}
                        tooltip={msg('user.userSession.stop.tooltip')}
                        onClick={() => this.stopSession(session)}/>
                </FormPanelButtons>
            </FormPanel>
        )
    }
}

UserSession.propTypes = {
    session: PropTypes.object.isRequired,
    onClose: PropTypes.func.isRequired,
    closable: PropTypes.func
}

export default form({fields, mapStateToProps})(UserSession)
