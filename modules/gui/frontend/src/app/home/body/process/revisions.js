import {Form, form} from 'widget/form/form'
import {PanelButtons} from 'widget/panel'
import {PanelContent, PanelHeader} from 'widget/panel'
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
    renderRevisions() {
        const {recipeId, inputs: {revision}} = this.props
        const options = getRevisions(recipeId).map(timestamp => {
            const date = moment(+timestamp)
            const label =
                <div className={styles.label}>
                    <div className={styles.date}>{date.format('MMM D YYYY, hh:mm:ss')}</div>
                    <div className={styles.fromNow}>{date.fromNow()}</div>
                </div>
            return {value: timestamp, label}
        })
        return (
            <Form.Buttons type='vertical-tight' uppercase={false} options={options} input={revision}/>
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
                <PanelHeader
                    icon='clock'
                    title={msg('process.revisions.title')}/>
                <PanelContent className={styles.content}>
                    {this.renderRevisions()}
                </PanelContent>
                <PanelButtons onEnter={confirm} onEscape={cancel}>
                    <PanelButtons.Main>
                        <PanelButtons.Confirm
                            label={msg('process.revisions.revert')}
                            disabled={form.isInvalid()}
                            onClick={confirm}/>
                    </PanelButtons.Main>
                    <PanelButtons.Extra>
                        <PanelButtons.Cancel onClick={cancel}/>
                    </PanelButtons.Extra>
                </PanelButtons>
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
