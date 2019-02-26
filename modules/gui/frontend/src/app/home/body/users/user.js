import {Field, Input, InputGroup, form} from 'widget/form'
import {PanelContent, PanelHeader} from 'widget/panel'
import {Scrollable, ScrollableContainer} from 'widget/scrollable'
import {isMobile} from 'widget/userAgent'
import {msg} from 'translate'
import FormPanel, {FormPanelButtons} from 'widget/formPanel'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './user.module.css'

const fields = {
    username: new Field()
        .notBlank('user.userDetails.form.username.required')
        .match(/^[a-zA-Z_][a-zA-Z0-9]{0,29}$/, 'user.userDetails.form.username.format'),
    name: new Field()
        .notBlank('user.userDetails.form.name.required'),
    email: new Field()
        .notBlank('user.userDetails.form.email.required')
        .email('user.userDetails.form.email.required'),
    organization: new Field()
        .notBlank('user.userDetails.form.organization.required'),
    monthlyBudgetInstanceSpending: new Field()
        .notBlank('user.userDetails.form.monthlyBudget.instanceSpending.atLeast1')
        .int('user.userDetails.form.monthlyBudget.instanceSpending.atLeast1')
        .min(1, 'user.userDetails.form.monthlyBudget.instanceSpending.atLeast1'),
    monthlyBudgetStorageSpending: new Field()
        .notBlank('user.userDetails.form.monthlyBudget.storageSpending.atLeast1')
        .int('user.userDetails.form.monthlyBudget.storageSpending.atLeast1')
        .min(1, 'user.userDetails.form.monthlyBudget.storageSpending.atLeast1'),
    monthlyBudgetStorageQuota: new Field()
        .notBlank('user.userDetails.form.monthlyBudget.storageQuota.atLeast1')
        .int('user.userDetails.form.monthlyBudget.storageQuota.atLeast1')
        .min(1, 'user.userDetails.form.monthlyBudget.storageQuota.atLeast1')
}

const mapStateToProps = (state, ownProps) => {
    const userDetails = ownProps.userDetails
    return {
        values: {
            newUser: userDetails.newUser,
            username: userDetails.username,
            name: userDetails.name,
            email: userDetails.email,
            organization: userDetails.organization,
            monthlyBudgetInstanceSpending: userDetails.monthlyBudgetInstanceSpending,
            monthlyBudgetStorageSpending: userDetails.monthlyBudgetStorageSpending,
            monthlyBudgetStorageQuota: userDetails.monthlyBudgetStorageQuota
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
            inputs: {name, email, organization, monthlyBudgetInstanceSpending, monthlyBudgetStorageSpending, monthlyBudgetStorageQuota}
        } = this.props
        const newUser = !this.props.userDetails.username
        return (
            <FormPanel
                className={[styles.panel, newUser ? styles.newUser : styles.existingUser].join(' ')}
                form={form}
                statePath='userDetails'
                // isActionForm={true}
                modal
                onApply={userDetails => this.save(userDetails)}
                close={() => this.cancel()}>
                <PanelHeader
                    icon='user'
                    title={msg('user.userDetails.title')}/>
                <PanelContent>
                    <ScrollableContainer>
                        <Scrollable>
                            <Input
                                label={msg('user.userDetails.form.name.label')}
                                autoFocus={!isMobile()}
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
                                errorMessage={[monthlyBudgetInstanceSpending, monthlyBudgetStorageSpending, monthlyBudgetStorageQuota]}>
                                <div className={styles.monthlyLimits}>
                                    <Input
                                        label={msg('user.userDetails.form.monthlyBudget.instanceSpending.label')}
                                        type='number'
                                        input={monthlyBudgetInstanceSpending}
                                        spellCheck={false}
                                    />
                                    <Input
                                        label={msg('user.userDetails.form.monthlyBudget.storageSpending.label')}
                                        type='number'
                                        input={monthlyBudgetStorageSpending}
                                        spellCheck={false}
                                    />
                                    <Input
                                        label={msg('user.userDetails.form.monthlyBudget.storageQuota.label')}
                                        type='number'
                                        input={monthlyBudgetStorageQuota}
                                        spellCheck={false}
                                    />
                                </div>
                            </InputGroup>
                        </Scrollable>
                    </ScrollableContainer>
                </PanelContent>
                <FormPanelButtons/>
            </FormPanel>
        )
    }
}

UserDetails.propTypes = {
    userDetails: PropTypes.object.isRequired,
    onCancel: PropTypes.func.isRequired,
    onSave: PropTypes.func.isRequired,
}

export default form({fields, mapStateToProps})(UserDetails)
