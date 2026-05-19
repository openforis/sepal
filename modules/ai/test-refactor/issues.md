# issues.md — AI test refactor deferred items

Append-only log of entries the implementation loop could not land. Each entry
has the full attempt log so a future pass can pick it up.

## Format

```
### <entry id or path>

- Reason deferred: (3 Replan / coverage drop / needs prod change / quality bar)
- Attempts: <n>
- Attempt log:
    - <date> Implementer: <summary>
    - <date> Reviewer: <verdict + red flag>
    - ...
- Next action when revisited: <e.g. expose side-effect surface in src/...>
```

## Entries

_(none yet)_
