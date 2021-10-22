import {Form, form} from 'widget/form/form'
import {Input} from 'widget/input'
import {Layout} from 'widget/layout'
import {Message} from 'widget/message'
import {Panel} from 'widget/panel/panel'
import {compose} from 'compose'
import {msg} from 'translate'
import {select} from 'store'
import Notifications from 'widget/notifications'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import api from 'api'
import moment from 'moment'
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
    const budgetUpdateRequest = select('user.currentUserReport.budgetUpdateRequest')
    if (budgetUpdateRequest) {
        const {message, instanceSpending, storageSpending, storageQuota} = budgetUpdateRequest
        return {
            budgetUpdateRequest,
            values: {
                instanceSpending,
                storageSpending,
                storageQuota,
                message
            }
        }
    }
    return null
}

export class _BudgetUpdateRequest extends React.Component {
    render() {
        const {budgetUpdateRequest, form} = this.props
        return (
            <Form.Panel
                className={styles.panel}
                form={form}
                statePath='userDetails'
                modal
                onApply={budgetUpdateRequest => this.save(budgetUpdateRequest)}
                onCancel={() => this.cancel()}>
                <Panel.Header
                    icon='user'
                    title={msg('user.quotaUpdate.title')}/>
                <Panel.Content>
                    <Layout>
                        {this.renderCreationTime(budgetUpdateRequest)}
                        {this.renderUpdateTime(budgetUpdateRequest)}
                        {this.renderMessage()}
                        {this.renderMonthlyLimits()}
                        {this.renderJustificationMessage()}
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons/>
            </Form.Panel>
        )
    }

    renderCreationTime() {
        const {budgetUpdateRequest: {creationTime} = {}} = this.props
        return creationTime
            ? (
                <Input
                    label={msg('user.quotaUpdate.form.created')}
                    readOnly
                    // value={moment(creationTime).format('LLLL')}
                    value={moment(creationTime).fromNow()}
                />
            )
            : null
    }

    renderUpdateTime() {
        const {budgetUpdateRequest: {updateTime} = {}} = this.props
        return updateTime
            ? (
                <Input
                    label={msg('user.quotaUpdate.form.modified')}
                    readOnly
                    // value={moment(updateTime).format('LLLL')}
                    value={moment(updateTime).fromNow()}
                />
            )
            : null
    }

    renderMessage() {
        return (
            <Message type='info' icon='comment'>
                {msg('user.quotaUpdate.info')}
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
                />
                <Form.Input
                    label={msg('user.userDetails.form.monthlyBudget.storageSpending.label')}
                    type='number'
                    input={storageSpending}
                    spellCheck={false}
                    prefix='US$/mo.'
                />
                <Form.Input
                    label={msg('user.userDetails.form.monthlyBudget.storageQuota.label')}
                    type='number'
                    input={storageQuota}
                    spellCheck={false}
                    prefix='GB'
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
                errorMessage={message}
            />
        )

    }

    save(budgetUpdateRequest) {
        api.user.updateBudgetUpdateRequest$(budgetUpdateRequest),
        this.props.stream({
            name: 'UPDATE_BUDGET_UPDATE_REQUEST',
            stream$: api.user.updateBudgetUpdateRequest$(budgetUpdateRequest),
            onError: error => {
                Notifications.error({message: msg('user.quotaUpdate.update.error'), error})
                this.cancel()
            },
            onComplete: () => {
                Notifications.success({message: msg('user.quotaUpdate.update.success')})
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
    form({fields, mapStateToProps})
)

BudgetUpdateRequest.propType = {
    onClose: PropTypes.func
}
