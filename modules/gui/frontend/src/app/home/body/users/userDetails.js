import {ErrorMessage, Field, Input, Label, form} from 'widget/form'
import {Panel, PanelContent, PanelHeader} from 'widget/panel'
import {msg} from 'translate'
// import {relativeTimeThreshold} from 'moment'
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

    renderPanel() {
        const {form, newUser = !this.props.userDetails.username,
            inputs: {username, name, email, organization, monthlyInstanceBudget, monthlyStorageBudget, storageQuota}
        } = this.props
        const renderUsername = () =>
            <div>
                <Label msg={msg('user.userDetails.form.username.label')}/>
                <Input
                    input={username}
                    spellCheck={false}
                />
                <ErrorMessage for={username}/>
            </div>
        
        return (
            <React.Fragment>
                <PanelContent>
                    <div>
                        <Label msg={msg('user.userDetails.form.name.label')}/>
                        <Input
                            autoFocus
                            input={name}
                            spellCheck={false}
                        />
                        <ErrorMessage for={name}/>
                    </div>
                    {newUser ? renderUsername() : null}
                    <div>
                        <Label msg={msg('user.userDetails.form.email.label')}/>
                        <Input
                            input={email}
                            spellCheck={false}
                        />
                        <ErrorMessage for={email}/>
                    </div>
                    <div>
                        <Label msg={msg('user.userDetails.form.organization.label')}/>
                        <Input
                            input={organization}
                            spellCheck={false}
                        />
                        <ErrorMessage for={organization}/>
                    </div>
                    <Label msg={msg('user.userDetails.form.monthlyLimits.label')}/>
                    <div className={styles.monthlyLimits}>
                        <div>
                            <Label msg={msg('user.userDetails.form.monthlyInstanceBudget.label')}/>
                            <Input
                                type='number'
                                input={monthlyInstanceBudget}
                                spellCheck={false}
                            />
                        </div>
                        <div>
                            <Label msg={msg('user.userDetails.form.monthlyStorageBudget.label')}/>
                            <Input
                                type='number'
                                input={monthlyStorageBudget}
                                spellCheck={false}
                            />
                        </div>
                        <div>
                            <Label msg={msg('user.userDetails.form.storageQuota.label')}/>
                            <Input
                                type='number'
                                input={storageQuota}
                                spellCheck={false}
                            />
                        </div>
                    </div>
                    <ErrorMessage for={[monthlyInstanceBudget, monthlyStorageBudget, storageQuota]}/>
                </PanelContent>
                <PanelButtons
                    form={form}
                    statePath='userDetails'
                    isActionForm={true}
                    onApply={userDetails => this.save(userDetails)}
                    onCancel={() => this.cancel()}/>
            </React.Fragment>
        )
    }

    render() {
        const newUser = !this.props.userDetails.username
        return (
            <Portal>
                <Panel className={[styles.panel, newUser ? styles.newUser : styles.existingUser].join(' ')} center modal>
                    <PanelHeader
                        icon='user'
                        title={msg('user.userDetails.title')}/>
                    {this.renderPanel()}
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
