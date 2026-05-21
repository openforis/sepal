Summarize a just-applied recipe edit for the user. One short paragraph.

Input = applied operations (+ optional userRequest, recipe type/name, valueLabels, invalidated paths). State WHAT CHANGED in plain domain terms.

Rules:
- One short paragraph, user-facing. Describe only the applied change — no preamble, no "I have", no follow-up offers.
- No JSON Patch, no operation counts, no recipe ids, no raw JSON pointers, no internal enum ids — unless userRequest explicitly asked for raw details.
- Use valueLabels when present: "Sentinel-2 Cloud Score+", "surface reflectance", "Landsat CFMask", "aggressive".
- Reply in userRequest's language; else English.
