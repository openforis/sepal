import {ErrorMessage, Field, Input, form} from 'widget/form'
import {Msg, msg} from 'translate'
import {Panel, PanelContent, PanelHeader} from 'widget/panel'
import {showChangePassword, closePanel} from './userProfile'
import {map} from 'rxjs/operators'
import {updateUserDetails$} from 'user'
import Http from 'http-client'
import Notifications from 'app/notifications'
import PanelButtons from 'widget/panelButtons'
import Portal from 'widget/portal'
import React from 'react'
import styles from './userDetails.module.css'

const fields = {
    name: new Field()
        .notBlank('user.userDetails.form.name.required'),
    email: new Field()
        .notBlank('user.udpateDetails.form.email.required'),
    organization: new Field()
}

const useUserGoogleAccount = (e) => {
    e.preventDefault()
    Http.get$(`/api/user/google/access-request-url?destinationUrl=${window.location.hostname}`).pipe(
        map(({response: {url}}) => url)
    ).subscribe(url => {
        // console.log({url})
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
    updateUserDetails(userDetails) {
        closePanel()
        updateUserDetails$(userDetails)
            .subscribe(
                () => Notifications.success('user.userDetails').dispatch(),
                (error) => Notifications.caught('user.userDetails', null, error).dispatch()
            )
    }

    cancel() {
        closePanel()
    }

    render() {
        const {form, inputs: {name, email, organization}} = this.props
        return (
            <Portal>
                <Panel className={styles.panel} center modal>
                    <PanelHeader
                        icon='user'
                        title={msg('user.userDetails.title')}/>

                    <PanelContent>
                        <div>
                            <label><Msg id='user.userDetails.form.name.label'/></label>
                            <Input
                                autoFocus
                                input={name}
                                spellCheck={false}
                            />
                            <ErrorMessage for={name}/>
                        </div>
                        <div>
                            <label><Msg id='user.userDetails.form.email.label'/></label>
                            <Input
                                input={email}
                                spellCheck={false}
                            />
                            <ErrorMessage for={email}/>
                        </div>
                        <div>
                            <label><Msg id='user.userDetails.form.organization.label'/></label>
                            <Input
                                input={organization}
                                spellCheck={false}
                            />
                        </div>
                    </PanelContent>
                    <PanelButtons
                        form={form}
                        statePath='userDetails'
                        onApply={userDetails => this.updateUserDetails(userDetails)}
                        onCancel={() => this.cancel()}
                        additionalButtons={[{
                            key: 'changePassword',
                            label: msg('user.changePassword.title'),
                            disabled: form.isDirty(),
                            onClick: () => showChangePassword()
                        }, {
                            key: 'useGoogleAccount',
                            label: msg('user.userDetails.useGoogleAccount'),
                            disabled: form.isDirty(),
                            onClick: (e) => useUserGoogleAccount(e)
                        }]}/>
                </Panel>
            </Portal>
        )
    }
}

UserDetails.propTypes = {}

export default form({fields, mapStateToProps})(UserDetails)
