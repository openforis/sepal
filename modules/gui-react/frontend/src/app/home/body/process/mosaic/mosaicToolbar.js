import React from 'react'
import Icon from 'widget/icon'
import styles from './mosaicToolbar.module.css'
import PropTypes from 'prop-types'
import Tooltip from 'widget/tooltip'

class MosaicToolbar extends React.Component {
    render() {
        const {className} = this.props
        return (
            <div className={className}>
                <div className={styles.toolbar}>
                    <div className={styles.action}>
                        <Tooltip msg={'process.mosaic.toolbar.auto'} left>
                            <button>
                                <Icon name={'magic'}/>
                            </button>
                        </Tooltip>
                        <Tooltip msg={'process.mosaic.toolbar.preview'} left>
                            <button>
                                <Icon name={'eye'}/>
                            </button>
                        </Tooltip>
                        <Tooltip msg={'process.mosaic.toolbar.retrieve'} left>
                            <button>
                                <Icon name={'cloud-download-alt'}/>
                            </button>
                        </Tooltip>
                    </div>
                    <div className={styles.configuration}>
                        <Tooltip msg={'process.mosaic.toolbar.where'} left>
                            <button>
                                AOI
                                {/* <Icon name={'globe'}/> */}
                            </button>
                        </Tooltip>
                        <Tooltip msg={'process.mosaic.toolbar.when'} left>
                            <button>
                                DAT
                                {/* <Icon name={'calendar-alt'}/> */}
                            </button>
                        </Tooltip>
                        <Tooltip msg={'process.mosaic.toolbar.sensors'} left>
                            <button>
                                SAT
                            </button>
                        </Tooltip>
                        <Tooltip msg={'process.mosaic.toolbar.scenes'} left>
                            <button>
                                SCN
                            </button>
                        </Tooltip>
                        <Tooltip msg={'process.mosaic.toolbar.composite'} left>
                            <button>
                                CMP
                            </button>
                        </Tooltip>
                    </div>
                </div>
            </div>
        )
    }
}

MosaicToolbar.propTypes = {
    className: PropTypes.string,
    id: PropTypes.string
}

export default MosaicToolbar
