import {Field, Input, InputGroup, form} from 'widget/form'
import Panel, { PanelContent, PanelHeader} from 'widget/panel'
import {msg} from 'translate'
import PanelButtons from 'widget/panelButtons'
import Portal from 'widget/portal'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './userDetails.module.css'

const fields = {
    username: new Field()
        .notBlank('user.userDetails.form.username.required')
        .match(/^[a-zA-Z_][a-zA-Z0-9]{0,29}$/, 'user.userDetails.form.username.format'),
    name: new Field()
        .notBlank('user.userDetails.form.name.required'),
    email: new Field()
        .notBlank('user.userDetails.form.email.required'),
    organization: new Field()
        .notBlank('user.userDetails.form.organization.required'),
    monthlyInstanceBudget: new Field()
        .int('user.userDetails.form.monthlyInstanceBudget.atLeast1')
        .min(1, 'user.userDetails.form.monthlyInstanceBudget.atLeast1'),
    monthlyStorageBudget: new Field()
        .int('user.userDetails.form.monthlyStorageBudget.atLeast1')
        .min(1, 'user.userDetails.form.monthlyStorageBudget.atLeast1'),
    storageQuota: new Field()
        .int('user.userDetails.form.storageQuota.atLeast1')
        .min(1, 'user.userDetails.form.storageQuota.atLeast1'),
}

const mapStateToProps = (state, ownProps) => {
    const userDetails = ownProps.userDetails
    return {
        values: {
            username: userDetails.username,
            name: userDetails.name,
            email: userDetails.email,
            organization: userDetails.organization,
            monthlyInstanceBudget: userDetails.monthlyInstanceBudget,
            monthlyStorageBudget: userDetails.monthlyStorageBudget,
            storageQuota: userDetails.storageQuota
        }
    }
}

class UserDetails extends React.Component {
    save(userDetails) {
        this.props.onSave(userDetails)
    }

    cancel() {
        this.props.onCancel()
    }

    renderUsername(newUser) {
        const {inputs: {username}} = this.props
        return newUser ? (
            <Input
                label={msg('user.userDetails.form.username.label')}
                input={username}
                spellCheck={false}
                errorMessage
            />
        ) : null
    }

    render() {
        const {form,
            inputs: {name, email, organization, monthlyInstanceBudget, monthlyStorageBudget, storageQuota}
        } = this.props
        const newUser = !this.props.userDetails.username
        return (
            <Portal>
                <Panel
                    className={[styles.panel, newUser ? styles.newUser : styles.existingUser].join(' ')}
                    form={form}
                    statePath='userDetails'
                    isActionForm={true}
                    center
                    modal
                    onApply={userDetails => this.save(userDetails)}
                    onCancel={() => this.cancel()}>
                    <PanelHeader
                        icon='user'
                        title={msg('user.userDetails.title')}/>
                    <PanelContent>
                        <Input
                            label={msg('user.userDetails.form.name.label')}
                            autoFocus
                            input={name}
                            spellCheck={false}
                            errorMessage
                        />
                        {this.renderUsername(newUser)}
                        <Input
                            label={msg('user.userDetails.form.email.label')}
                            input={email}
                            spellCheck={false}
                            errorMessage
                        />
                        <Input
                            label={msg('user.userDetails.form.organization.label')}
                            input={organization}
                            spellCheck={false}
                            errorMessage
                        />
                        <InputGroup
                            label={msg('user.userDetails.form.monthlyLimits.label')}
                            errorMessage={[monthlyInstanceBudget, monthlyStorageBudget, storageQuota]}>
                            <div className={styles.monthlyLimits}>
                                <Input
                                    label={msg('user.userDetails.form.monthlyInstanceBudget.label')}
                                    type='number'
                                    input={monthlyInstanceBudget}
                                    spellCheck={false}
                                />
                                <Input
                                    label={msg('user.userDetails.form.monthlyStorageBudget.label')}
                                    type='number'
                                    input={monthlyStorageBudget}
                                    spellCheck={false}
                                />
                                <Input
                                    label={msg('user.userDetails.form.storageQuota.label')}
                                    type='number'
                                    input={storageQuota}
                                    spellCheck={false}
                                />
                            </div>
                        </InputGroup>
                    </PanelContent>
                    <PanelButtons/>
                </Panel>
            </Portal>
        )
    }
}

UserDetails.propTypes = {
    userDetails: PropTypes.object.isRequired,
    onCancel: PropTypes.func.isRequired,
    onSave: PropTypes.func.isRequired,
}

export default form({fields, mapStateToProps})(UserDetails)
