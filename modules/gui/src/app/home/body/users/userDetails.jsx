import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {select} from '~/store'
import {msg} from '~/translate'
import {Confirm} from '~/widget/confirm'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'

import styles from './userDetails.module.css'

const isUniqueUser = (id, check) => !(select('users.users') || []).find(user => user.id !== id && check(user))

const fields = {
    id: new Form.Field(),
    revision: new Form.Field(),
    username: new Form.Field()
        .notBlank('user.userDetails.form.username.required')
        .username('user.userDetails.form.username.format')
        .predicate((username, {id}) => isUniqueUser(id, user => user.username?.toLowerCase() === username?.toLowerCase()), 'user.userDetails.form.username.unique'),
    name: new Form.Field()
        .notBlank('user.userDetails.form.name.required'),
    email: new Form.Field()
        .notBlank('user.userDetails.form.email.required')
        .email('user.userDetails.form.email.format')
        .predicate((email, {id}) => isUniqueUser(id, user => user.email?.toLowerCase() === email?.toLowerCase()), 'user.userDetails.form.email.unique'),
    organization: new Form.Field()
        .notBlank('user.userDetails.form.organization.required'),
    intendedUse: new Form.Field(),
    // .notBlank('user.userDetails.form.intendedUse.required'),
    admin: new Form.Field()
}

const mapStateToProps = (state, ownProps) => {
    const {userDetails} = ownProps
    const {id, revision, username, name, email, organization, intendedUse, admin = false} = userDetails
    return {
        values: {id, revision, username, name, email, organization, intendedUse, admin}
    }
}

// The user module's side of a user: details and role. Opened from the account panel, and saved on its
// own, so it never carries the budget along.
class _UserDetails extends React.Component {
    // Returns the save observable: the panel waits for the backend, spinning its Apply button, and
    // closes on completion. On failure it stays open with the edits, for another try.
    save(userDetails) {
        const {onSave} = this.props
        return onSave({...userDetails})
    }

    cancel() {
        const {onCancel} = this.props
        onCancel()
    }

    // The record changed underneath the panel (an accepted live update): the form is rebuilt from
    // it, and any local edits go. The revision tells a changed record from a re-rendered row.
    componentDidUpdate({userDetails: previous}) {
        const {userDetails, form} = this.props
        if (userDetails.revision !== previous.revision) {
            form.setInitialValues(mapStateToProps(null, this.props).values)
        }
    }

    isLocked() {
        const {locked} = this.props
        return !!locked
    }

    render() {
        const {form, inputs: {username, name, email, organization, intendedUse, admin}} = this.props
        const locked = this.isLocked()
        return (
            <Form.Panel
                className={styles.panel}
                placement='modal'
                form={form}
                locked={locked}
                statePath='userDetails'
                confirmation={
                    admin.isDirty() ?
                        ({confirm, cancel}) =>
                            <Confirm
                                message={msg('user.userDetails.confirmation.message', {role: msg(`user.role.${admin.value ? 'admin' : 'user'}`)})}
                                onConfirm={confirm}
                                onCancel={cancel}
                            />
                        : null
                }
                onApply={userDetails => this.save(userDetails)}
                onClose={() => this.cancel()}>
                <Panel.Header
                    icon='user'
                    title={msg('user.userDetails.title')}
                    label={this.renderUserRoleButtons()}
                />
                <Panel.Content>
                    <Layout>
                        <Form.Input
                            label={msg('user.userDetails.form.username.label')}
                            input={username}
                            disabled
                            autoComplete={false}
                            spellCheck={false}
                        />
                        <Form.Input
                            label={msg('user.userDetails.form.name.label')}
                            input={name}
                            disabled={locked}
                            autoComplete={false}
                            spellCheck={false}
                            autoFocus
                        />
                        <Form.Input
                            label={msg('user.userDetails.form.email.label')}
                            input={email}
                            disabled={locked}
                            autoComplete={false}
                            spellCheck={false}
                        />
                        <Form.Input
                            label={msg('user.userDetails.form.organization.label')}
                            input={organization}
                            disabled={locked}
                            autoComplete={false}
                            spellCheck={false}
                        />
                        <Form.Input
                            label={msg('user.userDetails.form.intendedUse.label')}
                            input={intendedUse}
                            disabled={locked}
                            spellCheck={false}
                            textArea
                            minRows={4}
                        />
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons/>
            </Form.Panel>
        )
    }

    renderUserRoleButtons() {
        const {inputs: {admin}} = this.props
        return (
            <Form.Buttons
                input={admin}
                disabled={this.isLocked()}
                multiple={false}
                options={[{
                    value: false,
                    label: msg('user.role.user')
                }, {
                    value: true,
                    label: msg('user.role.admin')
                }]}
            />
        )
    }
}

export const UserDetails = compose(
    _UserDetails,
    withForm({fields, mapStateToProps})
)

UserDetails.propTypes = {
    userDetails: PropTypes.object.isRequired,
    onCancel: PropTypes.func.isRequired,
    onSave: PropTypes.func.isRequired,
    locked: PropTypes.any
}
