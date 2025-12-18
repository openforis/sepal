import moment from 'moment'
import PropTypes from 'prop-types'
import React from 'react'

import api from '~/apiRegistry'
import {compose} from '~/compose'
import {publishEvent} from '~/eventPublisher'
import {select} from '~/store'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {Input} from '~/widget/input'
import {Layout} from '~/widget/layout'
import {Message} from '~/widget/message'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'

import styles from './userBudgetUpdateRequest.module.css'

const fields = {
    instanceSpending: new Form.Field()
        // .notBlank('user.userDetails.form.monthlyBudget.instanceSpending.atLeast1')
        .int('user.userDetails.form.monthlyBudget.instanceSpending.atLeast1')
        .min(1, 'user.userDetails.form.monthlyBudget.instanceSpending.atLeast1'),
    storageSpending: new Form.Field()
        // .notBlank('user.userDetails.form.monthlyBudget.storageSpending.atLeast1')
        .int('user.userDetails.form.monthlyBudget.storageSpending.atLeast1')
        .min(1, 'user.userDetails.form.monthlyBudget.storageSpending.atLeast1'),
    storageQuota: new Form.Field()
        // .notBlank('user.userDetails.form.monthlyBudget.storageQuota.atLeast1')
        .int('user.userDetails.form.monthlyBudget.storageQuota.atLeast1')
        .min(1, 'user.userDetails.form.monthlyBudget.storageQuota.atLeast1'),
    message: new Form.Field()
        .notBlank('user.quotaUpdate.form.message.required')
}

const mapStateToProps = () => {
    const spending = select('user.currentUserReport.spending')
    const budgetUpdateRequest = select('user.currentUserReport.budgetUpdateRequest')
    const values = {
        instanceSpending: budgetUpdateRequest ? budgetUpdateRequest.instanceSpending : spending.monthlyInstanceBudget,
        storageSpending: budgetUpdateRequest ? budgetUpdateRequest.storageSpending : spending.monthlyStorageBudget,
        storageQuota: budgetUpdateRequest ? budgetUpdateRequest.storageQuota : spending.storageQuota,
        message: budgetUpdateRequest && budgetUpdateRequest.message
    }
    return {budgetUpdateRequest, values}
}

export class _BudgetUpdateRequest extends React.Component {
    constructor(props) {
        super(props)
        this.save = this.save.bind(this)
        this.cancel = this.cancel.bind(this)
    }

    render() {
        const {form} = this.props
        return (
            <Form.Panel
                className={styles.panel}
                type='modal'
                form={form}
                statePath='userDetails'
                onApply={this.save}
                onCancel={this.cancel}>
                <Panel.Header
                    icon='user'
                    title={msg('user.quotaUpdate.title')}/>
                <Panel.Content>
                    <Layout>
                        {this.renderMessage()}
                        {this.renderUpdateRequest()}
                        {this.renderMonthlyLimits()}
                        {this.renderJustificationMessage()}
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons/>
            </Form.Panel>
        )
    }

    renderUpdateRequest() {
        const {budgetUpdateRequest} = this.props
        return budgetUpdateRequest ? (
            <Layout type='horizontal'>
                {this.renderCreationTime()}
                {this.renderUpdateTime()}
            </Layout>
        ) : null
    }

    renderCreationTime() {
        const {budgetUpdateRequest: {creationTime}} = this.props
        if (creationTime) {
            return (
                <Input
                    label={msg('user.quotaUpdate.form.created')}
                    readOnly
                    // value={moment(creationTime).format('LLLL')}
                    value={moment(creationTime).fromNow()}
                />
            )
        }
    }

    renderUpdateTime() {
        const {budgetUpdateRequest: {updateTime}} = this.props
        if (updateTime) {
            return (
                <Input
                    label={msg('user.quotaUpdate.form.modified')}
                    readOnly
                    // value={moment(updateTime).format('LLLL')}
                    value={moment(updateTime).fromNow()}
                />
            )
        }
    }

    renderMessage() {
        return (
            <Message type='info' icon='comment' iconSize='2x'>
                <Layout type='vertical' spacing='compact'>
                    <div>{msg('user.quotaUpdate.info1')}</div>
                    <div>{msg('user.quotaUpdate.info2')}</div>
                </Layout>
            </Message>
        )
    }

    renderMonthlyLimits() {
        const {inputs: {instanceSpending, storageSpending, storageQuota}} = this.props
        return (
            <Form.FieldSet
                className={styles.monthlyLimits}
                layout='horizontal'
                label={msg('user.userDetails.form.monthlyLimits.label')}
                tooltip={msg('user.userDetails.form.monthlyLimits.tooltip')}
                tooltipPlacement='topLeft'
                errorMessage={[instanceSpending, storageSpending, storageQuota]}>
                <Form.Input
                    label={msg('user.userDetails.form.monthlyBudget.instanceSpending.label')}
                    type='number'
                    input={instanceSpending}
                    spellCheck={false}
                    prefix='US$/mo.'
                    errorMessage={false}
                />
                <Form.Input
                    label={msg('user.userDetails.form.monthlyBudget.storageSpending.label')}
                    type='number'
                    input={storageSpending}
                    spellCheck={false}
                    prefix='US$/mo.'
                    errorMessage={false}
                />
                <Form.Input
                    label={msg('user.userDetails.form.monthlyBudget.storageQuota.label')}
                    type='number'
                    input={storageQuota}
                    spellCheck={false}
                    prefix='GB'
                    errorMessage={false}
                />
            </Form.FieldSet>
        )
    }

    renderJustificationMessage() {
        const {inputs: {message}} = this.props
        return (
            <Form.Input
                label={msg('user.quotaUpdate.form.message.label')}
                input={message}
                textArea={true}
                spellCheck={false}
                minRows={3}
                maxRows={10}
            />
        )

    }

    save(budgetUpdateRequest) {
        const {stream} = this.props
        api.user.updateBudgetUpdateRequest$(budgetUpdateRequest)
        stream({
            name: 'UPDATE_BUDGET_UPDATE_REQUEST',
            stream$: api.user.updateBudgetUpdateRequest$(budgetUpdateRequest),
            onError: error => {
                Notifications.error({message: msg('user.quotaUpdate.update.error'), error})
                this.cancel()
            },
            onComplete: () => {
                Notifications.success({message: msg('user.quotaUpdate.update.success')})
                publishEvent('requested_budget_update')
                this.cancel()
            }
        })
    }

    cancel() {
        const {onClose} = this.props
        onClose && onClose()
    }
}

export const BudgetUpdateRequest = compose(
    _BudgetUpdateRequest,
    withForm({fields, mapStateToProps})
)

BudgetUpdateRequest.propType = {
    onClose: PropTypes.func
}
