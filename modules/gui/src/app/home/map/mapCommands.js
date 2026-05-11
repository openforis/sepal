import {Subject} from 'rxjs'

// Side-channel for chat-driven map control. The Map component subscribes to
// this on mount and dispatches the command to its area maps. Each command
// carries `recipeId` so multi-tab sessions can filter.
export const mapCommand$ = new Subject()
