import EventBus from '../event/event-bus'
import Events from '../event/events'
import {random as guid} from '../guid/guid'
import Loader from '../loader/loader'

const messageTemplate = require('./message.html')

export default class MessageView {
    constructor({
                    $element = $(messageTemplate({})),
                    message = {id: guid()},
                    onSave
                }) {
        this.$element = $element
        this.message = message
        this.onSave = onSave

        this.$delete = $element.find('.btn-delete')
        this.$submit = $element.find('.btn-submit')
        this.$reset = $element.find('.btn-reset')
        this.$subject = $element.find('input[name=subject]')
        this.$contents = $element.find('textarea[name=contents]')

        this.$delete.click(e => {
            e.preventDefault()
            this.delete()
        })
        this.$submit.click(e => {
            e.preventDefault()
            this.save()
        })
        this.$reset.click(e => {
            e.preventDefault()
            this.reset(this.message)
            this.$subject.focus()
        })

        this.reset(message)
    }

    delete() {
        var params = {
            url: `/notification/messages/${this.message.id}`,
            beforeSend: () => Loader.show(),
            success: () => {
                Loader.hide({delay: 200})
                this.$element.remove()
            }
        }
        EventBus.dispatch(Events.AJAX.DELETE, this, params)
    }

    reset(message = {id: guid()}) {
        this.message = message
        this.$subject.val(message.subject)
        this.$contents.val(message.contents)
    }

    save() {
        const {id, subject, contents} = this.message = {
            id: this.message.id,
            subject: this.$subject.val(),
            contents: this.$contents.val()
        }
        var params = {
            url: `/notification/messages/${id}`,
            data: {subject, contents, type: 'SYSTEM'},
            beforeSend: () => Loader.show(),
            success: () => {
                Loader.hide({delay: 200})
                this.onSave && this.onSave(this)
            }
        }
        EventBus.dispatch(Events.AJAX.POST, this, params)
    }

    clone() {
        return new MessageView({
            message: {
                id: this.message.id,
                subject: this.$subject.val(),
                contents: this.$contents.val()
            }
        })
    }
}
