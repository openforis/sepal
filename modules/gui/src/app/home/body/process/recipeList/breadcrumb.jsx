import PropTypes from 'prop-types'
import React from 'react'

import lookStyles from '~/style/look.module.css'
import {msg} from '~/translate'
import {Icon} from '~/widget/icon'

import styles from './breadcrumb.module.css'
import {DropTargetContext} from './dropTargetContext'
import {at, folderPath, ROOT} from './recipeTree'

export class Breadcrumb extends React.Component {
    static contextType = DropTargetContext

    segments = React.createRef()

    render() {
        const {folders, folderId} = this.props
        const path = folderPath(folders, folderId)
        // A folderId with no path means the folder was removed underneath us: home is then not the
        // current segment, so it stays clickable and the list never strands with no way out.
        const atHome = path.length === 0 && !folderId
        return (
            <div ref={this.segments} className={styles.segments}>
                {this.renderSegment({id: ROOT, name: msg('process.recipeList.root'), icon: 'house'}, atHome)}
                {path.map((segment, index) =>
                    <React.Fragment key={segment.id}>
                        <div className={styles.separator}>/</div>
                        {this.renderSegment(segment, index === path.length - 1)}
                    </React.Fragment>
                )}
            </div>
        )
    }

    componentDidMount() {
        this.showCurrentFolder()
    }

    componentDidUpdate() {
        this.showCurrentFolder()
    }

    // The last segment names where you already are, so it reads as a label rather than a way out.
    // The underline sits on the label rather than the button: a flex container does not pass text
    // decoration down to its items.
    renderSegment({id, name, icon}, current) {
        const {onNavigate} = this.props
        return current
            ? (
                <div className={styles.current}>
                    {icon ? <Icon name={icon}/> : null}
                    <span>{name}</span>
                </div>
            )
            : (
                <button
                    type='button'
                    className={this.linkClassName(id)}
                    {...(id === ROOT ? {'data-drop-home': true} : {'data-drop-folder-id': id})}
                    onClick={() => onNavigate(id)}>
                    {icon ? <Icon name={icon}/> : null}
                    <span className={styles.label}>{name}</span>
                </button>
            )
    }

    // The look gives a segment the same hover as the buttons beside it, which a drop target then wears
    // while the pointer is over it.
    linkClassName(id) {
        return [
            lookStyles.look,
            lookStyles.transparent,
            lookStyles.chromeless,
            this.dragHoverClassName(id),
            styles.link
        ].filter(className => className).join(' ')
    }

    // A path wider than its row scrolls, and the end of a path is the folder you are in, so that is the
    // end worth seeing.
    showCurrentFolder() {
        const segments = this.segments.current
        segments.scrollLeft = segments.scrollWidth
    }

    dragHoverClassName(id) {
        const drag = this.context
        if (!drag) {
            return null
        }
        return drag.target && at(drag.target.folderId) === at(id)
            ? lookStyles.hoverForcedOn
            : lookStyles.hoverForcedOff
    }
}

Breadcrumb.propTypes = {
    folders: PropTypes.array.isRequired,
    folderId: PropTypes.string,
    onNavigate: PropTypes.func.isRequired
}
