import PropTypes from 'prop-types'
import React from 'react'

import lookStyles from '~/style/look.module.css'
import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {ElementResizeDetector} from '~/widget/elementResizeDetector'
import {Icon} from '~/widget/icon'
import {Tooltip} from '~/widget/tooltip'

import styles from './breadcrumb.module.css'
import {DropTargetContext} from './dropTargetContext'
import {ROOT_LABEL} from './recipeListConstants'
import {at, folderPath, ROOT} from './recipeTree'

const Separator = () => (
    <span className={styles.separator} aria-hidden='true'>
        <Icon name='chevron-right' size='xs'/>
    </span>
)

export class Breadcrumb extends React.Component {
    static contextType = DropTargetContext

    current = React.createRef()

    render() {
        const {folders, folderId} = this.props
        return (
            <FittedPath folders={folders} folderId={folderId}>
                {({hidden, shown, ref}) => this.renderPath(hidden, shown, ref)}
            </FittedPath>
        )
    }

    // The root is a folder too, so a chevron follows it even when nothing else does.
    renderPath(hidden, shown, ref) {
        const {folderId} = this.props
        // A folderId with no path means the folder was removed underneath us: the root is then not the
        // current segment, so it stays clickable and the list never strands with no way out.
        const atRoot = !hidden.length && !shown.length && !folderId
        return (
            <nav ref={ref} className={styles.breadcrumb} aria-label={msg('process.recipeList.breadcrumb.label')}>
                <ol className={styles.segments}>
                    <li className={styles.fixed}>
                        {this.renderSegment({id: ROOT}, atRoot)}
                        <Separator/>
                    </li>
                    {hidden.length
                        ? (
                            <li className={styles.fixed}>
                                {this.renderHidden(hidden)}
                            </li>
                        )
                        : null}
                    {shown.map((segment, index) =>
                        <li key={segment.id} className={styles.segment}>
                            {index || hidden.length ? <Separator/> : null}
                            {this.renderSegment(segment, index === shown.length - 1)}
                        </li>
                    )}
                </ol>
            </nav>
        )
    }

    // The link that was clicked is gone once its folder is the current one. Unless something else has
    // taken the focus since, such as a search box mounted again, it goes to where the link led.
    componentDidUpdate() {
        if (this.focusCurrent) {
            this.focusCurrent = false
            if (!document.activeElement || document.activeElement === document.body) {
                this.current.current?.focus()
            }
        }
    }

    // The last segment names where you already are, so it reads as a label rather than a way out.
    // The underline sits on the label rather than the button: a flex container does not pass text
    // decoration down to its items. The root is an icon alone, so a screen reader is told what it stands for.
    renderSegment({id, name}, current) {
        const root = id === ROOT
        const ariaLabel = root ? msg('process.recipeList.root') : undefined
        return (
            <Tooltip msg={name} placement='bottom'>
                {current
                    ? (
                        <div ref={this.current} className={styles.current} aria-current='page' aria-label={ariaLabel} tabIndex={-1}>
                            {root ? <Icon name='house'/> : <span className={styles.name}>{name}</span>}
                        </div>
                    )
                    : (
                        <button
                            type='button'
                            className={this.linkClassName(this.dragHoverClassName(id))}
                            aria-label={ariaLabel}
                            {...(root ? {'data-drop-home': true} : {'data-drop-folder-id': id})}
                            onClick={() => this.navigate(id)}>
                            {root ? <Icon name='house'/> : <span className={[styles.name, styles.label].join(' ')}>{name}</span>}
                        </button>
                    )}
            </Tooltip>
        )
    }

    // The folders the path leaves out, in a tooltip over as many lines as they need, where each one still opens.
    renderHidden(hidden) {
        return (
            <Button
                chromeless
                shape='circle'
                size='small'
                air='less'
                icon='ellipsis'
                tooltip={({close}) => this.renderHiddenPath(hidden, close)}
                tooltipPlacement='bottom'
            />
        )
    }

    renderHiddenPath(hidden, close) {
        return (
            <ol
                className={[styles.segments, styles.wrapping].join(' ')}
                aria-label={msg('process.recipeList.breadcrumb.hidden', {count: hidden.length})}>
                {hidden.map(({id, name}, index) =>
                    <li key={id} className={styles.segment}>
                        {index ? <Separator/> : null}
                        <button
                            type='button'
                            className={this.linkClassName()}
                            onClick={() => {
                                close()
                                this.navigate(id)
                            }}>
                            <span className={[styles.name, styles.label].join(' ')}>{name}</span>
                        </button>
                    </li>
                )}
            </ol>
        )
    }

    navigate(folderId) {
        const {onNavigate} = this.props
        this.focusCurrent = true
        onNavigate(folderId)
    }

    // The look gives a segment the same hover as the buttons beside it, which a drop target then wears
    // while the pointer is over it.
    linkClassName(dragHoverClassName) {
        return [
            lookStyles.look,
            lookStyles.transparent,
            lookStyles.chromeless,
            dragHoverClassName,
            styles.link
        ].filter(className => className).join(' ')
    }

    dragHoverClassName(id) {
        const drag = this.context
        if (!drag) {
            return null
        }
        return drag.target && at(drag.target.folderId) === at(id)
            ? [lookStyles.hoverForcedOn, styles.dropTarget].join(' ')
            : lookStyles.hoverForcedOff
    }
}

Breadcrumb.propTypes = {
    folders: PropTypes.array.isRequired,
    onNavigate: PropTypes.func.isRequired,
    folderId: PropTypes.string
}

// A path read by the breadcrumb's rule where it names a place rather than leads to it: the root as a
// slash, and the folders above the ones that fit gathered in an ellipsis that names them on hover.
export const BreadcrumbLabel = ({folders, folderId}) => (
    <FittedPath folders={folders} folderId={folderId}>
        {({hidden, shown, ref}) => (
            <span ref={ref} className={styles.readOnly}>
                <span className={styles.fixed}>{ROOT_LABEL}</span>
                {hidden.length
                    ? (
                        <Tooltip msg={hidden.map(({name}) => name).join(' > ')} placement='bottom'>
                            <span className={styles.fixed}>…</span>
                        </Tooltip>
                    )
                    : null}
                {shown.map(({id, name}, index) =>
                    <React.Fragment key={id}>
                        {index || hidden.length ? <Separator/> : null}
                        <span className={styles.name}>{name}</span>
                    </React.Fragment>
                )}
            </span>
        )}
    </FittedPath>
)

BreadcrumbLabel.propTypes = {
    folders: PropTypes.array.isRequired,
    folderId: PropTypes.string
}

// Shows as many of a path's last folders as fit beside each other without cutting a name, and never fewer
// than the last one. How the path looks is up to the children: they are given the folders to show, those
// left out, and a ref for the element the path has to fit, whose names carry the name style.
class FittedPath extends React.Component {
    state = {maxFolders: Infinity}

    element = React.createRef()

    constructor(props) {
        super(props)
        this.refit = this.refit.bind(this)
    }

    render() {
        const {folders, folderId, children} = this.props
        const {maxFolders} = this.state
        const {hidden, shown} = splitPath(folderPath(folders, folderId), maxFolders)
        return (
            <ElementResizeDetector targetRef={this.element} onResize={this.refit}>
                {children({hidden, shown, ref: this.element})}
            </ElementResizeDetector>
        )
    }

    componentDidMount() {
        this.fit()
    }

    componentDidUpdate(prevProps) {
        const {folders, folderId} = this.props
        if (folders !== prevProps.folders || folderId !== prevProps.folderId) {
            this.refit()
        } else {
            this.fit()
        }
    }

    // The whole path is laid out again, as a new path or a wider element may hold more of it than before.
    refit() {
        this.setState({maxFolders: Infinity})
    }

    // One folder gathers at a time, until no name is cut. Each pass runs before the browser paints, so
    // only the path that fits is ever seen.
    fit() {
        const {folders, folderId} = this.props
        const {maxFolders} = this.state
        const shown = Math.min(maxFolders, folderPath(folders, folderId).length)
        if (shown > 1 && this.isNameCut()) {
            this.setState({maxFolders: shown - 1})
        }
    }

    isNameCut() {
        return [...this.element.current.querySelectorAll(`.${styles.name}`)]
            .some(name => name.scrollWidth > name.clientWidth)
    }
}

FittedPath.propTypes = {
    children: PropTypes.func.isRequired,
    folders: PropTypes.array.isRequired,
    folderId: PropTypes.string
}

// Only the last folders show; those above them gather behind one mark.
const splitPath = (path, maxFolders) => {
    const shown = path.slice(Math.max(0, path.length - maxFolders))
    return {hidden: path.slice(0, path.length - shown.length), shown}
}
