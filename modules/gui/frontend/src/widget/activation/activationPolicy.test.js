import {activationAllowed} from './activationPolicy'

/* eslint-disable no-undef */

it('throw error when policy is missing the fallback behavior (_) ', () => {
    expect(() => activationAllowed('a', {
        a: {
            policy: {}
        }
    })).toThrow()
})

it('disallow activation when [a] has no policy', () => {
    expect(activationAllowed('a', {})).toEqual(false)
})

it('allow activation when element is not active and no other elements exist', () => {
    expect(activationAllowed('a', {
        a: {
            active: false
        }
    })).toEqual(true)
})

it('disallow activation when element is active', () => {
    expect(activationAllowed('a', {
        a: {
            active: true
        }
    })).toEqual(false)
})

it('allow activation when no element is active', () => {
    expect(activationAllowed('a', {
        a: {
            active: false
        },
        b: {
            active: false
        }
    })).toEqual(true)
})

it('allow activation when other elements are active with default policy', () => {
    expect(activationAllowed('a', {
        a: {
            active: false
        },
        b: {
            active: true
        }
    })).toEqual(true)
})

it('allow activation when other elements are active with empty compatibleWith', () => {
    expect(activationAllowed('a', {
        a: {
            active: false
        },
        b: {
            active: true,
            policy: {
                _: 'allow'
            }
        }
    })).toEqual(true)
})

it('disallow activation when other elements are active and not allowing others to activate', () => {
    expect(activationAllowed('a', {
        a: {
            active: false
        },
        b: {
            active: true,
            policy: {
                _: 'disallow'
            }
        }
    })).toEqual(false)
})

it('allow activation of [a] when [b] is active and allowing [a] to activate', () => {
    expect(activationAllowed('a', {
        a: {
            active: false
        },
        b: {
            active: true,
            policy: {
                _: 'disallow',
                a: 'allow'
            }
        }
    })).toEqual(true)
})

it('disallow activation of [a] when [b] is active and not allowing [a] to activate', () => {
    expect(activationAllowed('a', {
        a: {
            active: false
        },
        b: {
            active: true,
            policy: {
                _: 'allow',
                a: 'disallow'
            }
        }
    })).toEqual(false)
})

it('disallow activation of [a] when [b] is active and allowing [a] to activate, but [a] is not allowing [b]', () => {
    expect(activationAllowed('a', {
        a: {
            active: false,
            policy: {
                _: 'allow',
                b: 'disallow'
            }
        },
        b: {
            active: true,
            policy: {
                _: 'disallow',
                a: 'allow'
            }
        }
    })).toEqual(false)
})

it(`allow activation of [a] when
    [a] is not allowing [b]
    [b] is active, allowing [a] to activate and willing to deactivate when [a] activates
    `, () => {
    expect(activationAllowed('a', {
        a: {
            active: false,
            policy: {
                _: 'allow',
                b: 'disallow'
            }
        },
        b: {
            active: true,
            policy: {
                _: 'disallow',
                a: 'allow-then-deactivate'
            }
        }
    })).toEqual(true)
})

it(`allow activation of [a] when
    [a] is allowing [b] to activate and will deactivate when [b] activates
    [b] is active, allowing [a] to activate
    `, () => {
    expect(activationAllowed('a', {
        a: {
            active: false,
            policy: {
                _: 'disallow',
                b: 'allow-then-deactivate'
            }
        },
        b: {
            active: true,
            policy: {
                _: 'disallow',
                a: 'allow'
            }
        }
    })).toEqual(false)
})

it(`disallow activation of [a] when
    [a] is allowing [b] to activate and is willing to deactivate when [b] activates
    [b] is active, allowing [a] to activate and not willing to deactivate when [a] activates
    `, () => {
    expect(activationAllowed('a', {
        a: {
            active: false,
            policy: {
                _: 'allow',
                b: 'allow-then-deactivate'
            }
        },
        b: {
            active: true
        }
    })).toEqual(false)
})
