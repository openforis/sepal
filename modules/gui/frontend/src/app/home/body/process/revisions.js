import {Field, form} from 'widget/form'
import {PanelButtons} from 'widget/panel'
import {PanelContent, PanelHeader} from 'widget/panel'
import {Scrollable, ScrollableContainer} from 'widget/scrollable'
import {activatable} from 'widget/activation/activatable'
import {getRevisions, revertToRevision$} from 'app/home/body/process/recipe'
import {map} from 'rxjs/operators'
import {msg} from 'translate'
import Buttons from 'widget/buttons'
import FormPanel from 'widget/formPanel'
import PropTypes from 'prop-types'
import React from 'react'
import moment from 'moment'
import styles from './revisions.module.css'

const fields = {
    revision: new Field().notBlank('process.revisions.required')
}

class Revisions extends React.Component {
    renderContent() {
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
            <Buttons type='vertical-tight' uppercase={false} options={options} input={revision}/>
        )
    }

    render() {
        const {form, inputs: {revision}, deactivate} = this.props
        return (
            <FormPanel
                className={styles.panel}
                form={form}
                isActionForm
                modal>
                <PanelHeader
                    icon='clock'
                    title={msg('process.revisions.title')}/>
                <PanelContent className={styles.content}>
                    <ScrollableContainer>
                        <Scrollable>
                            {this.renderContent()}
                        </Scrollable>
                    </ScrollableContainer>
                </PanelContent>
                <PanelButtons>
                    <PanelButtons.Main>
                        <PanelButtons.Confirm
                            label={msg('process.revisions.revert')}
                            disabled={form.isInvalid()}
                            onClick={() => this.revertToRevision(revision.value)}/>
                    </PanelButtons.Main>
                    <PanelButtons.Extra>
                        <PanelButtons.Cancel
                            onClick={() => deactivate()}/>
                    </PanelButtons.Extra>
                </PanelButtons>
            </FormPanel>
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

const policy = () => ({modal: true})

export default (
    activatable('revisions')(
        form({fields})(Revisions)
    )
)
