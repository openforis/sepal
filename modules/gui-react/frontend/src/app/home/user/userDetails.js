import PropTypes from 'prop-types'
import React from 'react'
import {map} from 'rxjs/operators'
import {msg, Msg} from 'translate'
import {Panel, PanelContent, PanelHeader} from 'widget/panel'
import PanelButtons from 'widget/panelButtons'
import Portal from 'widget/portal'
import styles from './userDetails.module.css'
import Http from 'http-client'
import {Field, ErrorMessage, form, Input} from 'widget/form'
import {updateUserDetails$} from 'user'
import Notifications from 'app/notifications'

const fields = {
    name: new Field()
        .notBlank('user.panel.form.name.required'),
    email: new Field()
        .notBlank('user.panel.form.email.required'),
    organization: new Field()
}

const useUserGoogleAccount = (e) => {
    e.preventDefault()
    Http.get$(`/api/user/google/access-request-url?destinationUrl=${window.location.hostname}`).pipe(
        map(({response: {url}}) => url)
    ).subscribe(url => {
        console.log({url})
        return window.location = url
    })
}

const mapStateToProps = (state) => {
    const user = state.user.currentUser
    return {
        values: {
            name: user.name,
            email: user.email,
            organization: user.organization
        }
    }
}

class UserDetails extends React.Component {
    closePanel() {
        this.props.close()
    }

    updateUserDetails(userDetails) {
        this.closePanel()
        updateUserDetails$(userDetails)
            .subscribe(
                () => Notifications.success('user.updateDetails').dispatch(),
                (error) => Notifications.caught('user.updateDetails', null, error).dispatch()
            )
            
    }

    cancel() {
        this.closePanel()
    }

    render() {
        const {form, inputs: {name, email, organization}} = this.props
        return (
            <Portal>
                <Panel className={styles.panel} center modal>
                    <PanelHeader
                        icon='user'
                        title={msg('user.panel.title')}/>

                    <PanelContent>
                        <div>
                            <label><Msg id='user.panel.form.name.label'/></label>
                            <Input
                                autoFocus
                                input={name}
                                spellCheck={false}
                            />
                        </div>
                        <div>
                            <label><Msg id='user.panel.form.email.label'/></label>
                            <Input
                                autoFocus
                                input={email}
                                spellCheck={false}
                            />
                        </div>
                        <div>
                            <label><Msg id='user.panel.form.organization.label'/></label>
                            <Input
                                autoFocus
                                input={organization}
                                spellCheck={false}
                            />
                        </div>
                        <button onClick={(e) => useUserGoogleAccount(e)}>User user Google account</button>
                    </PanelContent>
                    <PanelButtons
                        form={form}
                        statePath='userDetails'
                        onApply={userDetails => this.updateUserDetails(userDetails)}
                        onCancel={() => this.cancel()}/>
                </Panel>
            </Portal>
        )
    }
}

UserDetails.propTypes = {
    close: PropTypes.func.isRequired,
    form: PropTypes.object,
    inputs: PropTypes.object
}

export default form({fields, mapStateToProps})(UserDetails)
