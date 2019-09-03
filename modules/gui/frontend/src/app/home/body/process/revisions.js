import {Form, form} from 'widget/form/form'
import {NoData} from 'widget/noData'
import {Panel} from 'widget/panel/panel'
import {activatable} from 'widget/activation/activatable'
import {compose} from 'compose'
import {getRevisions, revertToRevision$} from 'app/home/body/process/recipe'
import {map} from 'rxjs/operators'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'
import moment from 'moment'
import styles from './revisions.module.css'

const fields = {
    revision: new Form.Field().notBlank('process.revisions.required')
}

class Revisions extends React.Component {
    renderContent() {
        const {recipeId} = this.props
        const revisions = getRevisions(recipeId)
        return revisions.length
            ? this.renderRevisions(revisions)
            : this.renderNoRevisions()
    }

    renderRevisions(revisions) {
        const {inputs: {revision}} = this.props
        const options = revisions.map(timestamp => {
            const date = moment(+timestamp)
            const label =
                <div className={styles.label}>
                    <div className={styles.date}>{date.format('MMM D YYYY, hh:mm:ss')}</div>
                    <div className={styles.fromNow}>{date.fromNow()}</div>
                </div>
            return {value: timestamp, label}
        })
        return (
            <Form.Buttons layout='vertical-tight' uppercase={false} options={options} input={revision}/>
        )
    }

    renderNoRevisions() {
        return (
            <div>
                <NoData message={msg('process.revisions.none')}/>
            </div>
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
                close={() => deactivate()}
                modal>
                <Panel.Header
                    icon='clock'
                    title={msg('process.revisions.title')}/>
                <Panel.Content className={styles.content}>
                    {this.renderContent()}
                </Panel.Content>
                <Panel.Buttons onEnter={confirm} onEscape={cancel}>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Confirm
                            label={msg('process.revisions.revert')}
                            disabled={form.isInvalid()}
                            onClick={confirm}/>
                    </Panel.Buttons.Main>
                    <Panel.Buttons.Extra>
                        <Panel.Buttons.Cancel onClick={cancel}/>
                    </Panel.Buttons.Extra>
                </Panel.Buttons>
            </Form.Panel>
        )
    }

    revertToRevision(revision) {
        const {recipeId, stream, deactivate} = this.props
        stream('REVERT_TO_REVISION',
            revertToRevision$(recipeId, revision).pipe(
                map(() => deactivate())
            )
        )
    }
}

Revisions.propTypes = {
    recipeId: PropTypes.string.isRequired
}

const policy = () => ({_: 'allow'})

export default compose(
    Revisions,
    form({fields}),
    activatable({id: 'revisions', policy})
)
