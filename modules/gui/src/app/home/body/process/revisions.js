import moment from 'moment'
// import PropTypes from 'prop-types'
import React from 'react'
import {map} from 'rxjs'

import {getRevisions, revertToRevision$} from '~/app/home/body/process/recipe'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {withActivatable} from '~/widget/activation/activatable'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {Layout} from '~/widget/layout'
import {NoData} from '~/widget/noData'
import {Panel} from '~/widget/panel/panel'

import styles from './revisions.module.css'

const fields = {
    revision: new Form.Field().notBlank('process.revisions.required')
}

class _Revisions extends React.Component {
    renderContent() {
        const {recipeId} = this.props
        const revisions = getRevisions(recipeId)
        return revisions.length
            ? this.renderRevisions(revisions)
            : this.renderNoRevisions()
    }

    getOptions(revisions) {
        return revisions.map(timestamp => {
            const date = moment(+timestamp)
            const content =
                <Layout type='horizontal-nowrap' alignment='spaced'>
                    <div className={styles.date}>{date.format('MMM D YYYY, hh:mm:ss')}</div>
                    <div className={styles.fromNow}>{date.fromNow()}</div>
                </Layout>
            return {value: timestamp, content}
        })
    }

    renderRevisions(revisions) {
        const {inputs: {revision}} = this.props
        return (
            <Form.Buttons
                layout='vertical'
                alignment='fill'
                spacing='tight'
                width='fill'
                uppercase={false}
                options={this.getOptions(revisions)}
                input={revision}/>
        )
    }

    renderNoRevisions() {
        return (
            <NoData message={msg('process.revisions.none')}/>
        )
    }

    render() {
        const {form, inputs: {revision}, activatable: {deactivate}} = this.props
        const confirm = () => this.revertToRevision(revision.value)
        const cancel = () => deactivate()
        return (
            <Form.Panel
                className={styles.panel}
                form={form}
                isActionForm
                onCancel={cancel}
                modal>
                <Panel.Header
                    icon='clock'
                    title={msg('process.revisions.title')}/>
                <Panel.Content className={styles.content}>
                    {this.renderContent()}
                </Panel.Content>
                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Confirm
                            label={msg('process.revisions.revert')}
                            disabled={form.isInvalid()}
                            keybinding='Enter'
                            onClick={confirm}/>
                    </Panel.Buttons.Main>
                    <Panel.Buttons.Extra>
                        <Panel.Buttons.Cancel
                            keybinding='Escape'
                            onClick={cancel}
                        />
                    </Panel.Buttons.Extra>
                </Panel.Buttons>
            </Form.Panel>
        )
    }

    revertToRevision(revision) {
        const {recipeId, stream, activatable: {deactivate}} = this.props
        stream('REVERT_TO_REVISION',
            revertToRevision$(recipeId, revision).pipe(
                map(() => deactivate())
            )
        )
    }
}

const policy = () => ({_: 'allow'})

export const Revisions = compose(
    _Revisions,
    withForm({fields}),
    withActivatable({id: 'revisions', policy})
)

Revisions.propTypes = {
    // recipeId: PropTypes.string.isRequired
}
