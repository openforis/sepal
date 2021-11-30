import React from 'react'

export class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props)
        this.state = {hasError: false}
    }

    static getDerivedStateFromError() {
        return {hasError: true}
    }

    componentDidCatch(_error, _errorInfo) {
        // TODO: Report error
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{margin: 'auto', marginTop: '30%', maxWidth: '40rem'}}>
                    <h3>
                    We are terribly sorry, but something went wrong with SEPAL.
                    </h3>
                    <p>
                        This is of course very embarrassing for us, and frustrating for you.
                        Please, reload the page and try again.
                        If this keeps on happening, report this to the SEPAL team and we will try to fix this issue
                        as quick as possible.
                    </p>
                </div>
            )
        }
        return this.props.children
    }
}
