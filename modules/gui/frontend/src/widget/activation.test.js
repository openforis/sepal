import {policesAllowActivation} from './activation'
import _ from 'lodash'

/* eslint-disable no-undef */

it('disallow activation when [a] has no policy', () => {
    expect(policesAllowActivation('a', {})).toEqual(false)
})

it('allow activation when element is not active and no other elements exist', () => {
    expect(policesAllowActivation('a', {
        a: {
            active: false
        }
    })).toEqual(true)
})

it('disallow activation when element is active', () => {
    expect(policesAllowActivation('a', {
        a: {
            active: true
        }
    })).toEqual(false)
})

it('allow activation when no element is active', () => {
    expect(policesAllowActivation('a', {
        a: {
            active: false
        },
        b: {
            active: false
        }
    })).toEqual(true)
})

it('allow activation when other elements are active with default policy', () => {
    expect(policesAllowActivation('a', {
        a: {
            active: false
        },
        b: {
            active: true
        }
    })).toEqual(true)
})

it('allow activation when other elements are active with empty compatibleWith', () => {
    expect(policesAllowActivation('a', {
        a: {
            active: false
        },
        b: {
            active: true,
            compatibleWith: {}
        }
    })).toEqual(true)
})

it('disallow activation when other elements are active and not allowing others to activate', () => {
    expect(policesAllowActivation('a', {
        a: {
            active: false
        },
        b: {
            active: true,
            compatibleWith: {
                include: []
            }
        }
    })).toEqual(false)
})

it('allow activation of [a] when [b] is active and allowing [a] to activate', () => {
    expect(policesAllowActivation('a', {
        a: {
            active: false
        },
        b: {
            active: true,
            compatibleWith: {
                include: ['a']
            }
        }
    })).toEqual(true)
})

it('disallow activation of [a] when [b] is active and not allowing [a] to activate', () => {
    expect(policesAllowActivation('a', {
        a: {
            active: false
        },
        b: {
            active: true,
            compatibleWith: {
                exclude: ['a']
            }
        }
    })).toEqual(false)
})

it('disallow activation of [a] when [b] is active and allowing [a] to activate, but [a] is not allowing [b]', () => {
    expect(policesAllowActivation('a', {
        a: {
            active: false,
            compatibleWith: {
                exclude: ['b']
            }
        },
        b: {
            active: true,
            compatibleWith: {
                include: ['a']
            }
        }
    })).toEqual(false)
})

it(`allow activation of [a] when 
    [a] is not allowing [b]
    [b] is active, allowing [a] to activate and willing to deactivate when [a] activates
    `, () => {
    expect(policesAllowActivation('a', {
        a: {
            active: false,
            compatibleWith: {
                exclude: ['b']
            }
        },
        b: {
            active: true,
            compatibleWith: {
                include: ['a']
            },
            deactivateWhen: {
                include: ['a']
            }
        }
    })).toEqual(true)
})

it(`allow activation of [a] when 
    [a] is allowing [b] to activate and willing to deactivate when [b] activates
    [b] is active, allowing [a] to activate and not willing to deactivate when [a] activates
    `, () => {
    expect(policesAllowActivation('a', {
        a: {
            active: false,
            compatibleWith: {
                include: ['b']
            },
            deactivateWhen: {
                include: ['b']
            }
        },
        b: {
            active: true,
            compatibleWith: {
                include: ['a']
            },
            deactivateWhen: {
                exclude: ['a']
            }
        }
    })).toEqual(false)
})

it(`disallow activation of [a] when 
    [a] is allowing [b] to activate and is willing to deactivate when [b] activates
    [b] is active, allowing [a] to activate and not willing to deactivate when [a] activates
    `, () => {
    expect(policesAllowActivation('a', {
        a: {
            active: false,
            deactivateWhen: {
                include: ['b']
            }
        },
        b: {
            active: true
        }
    })).toEqual(false)
})
