# Remapping

Remaps its input images to classes: each legend entry is a class value, assigned where its constraints on the
inputs' bands hold.

## Inputs

`inputImagery.images` lists the input images, each a selected recipe or asset (`type`, `id`) with the bands chosen
from it (`includedBands`, each named by `band`). The editor is the one Stack shares
([Stack](stack.md#inputs)). `legend.entries` holds the classes, each with its `constraints` - each naming an input by
`imageId` and one of its bands - combined by `booleanOperator`.

## Output

Declared in `lib/js/shared/src/recipe/type/remapping.js`: one categorical band, `class`, using mode for pyramiding,
described from the legend alone without reading any input. A legend without entries describes no bands.

Execution (`lib/js/ee/src/remapping/remapping.js`) builds every input with every band it includes, but Earth Engine
evaluates lazily: only the bands a constraint reads are evaluated. On live Earth Engine
(`modules/gee/verify/classificationOutputBands.mjs`):

| An input band missing | Execution | Described |
| --- | --- | --- |
| none | builds `class` | `class` |
| one a constraint reads | refused: the band matches nothing | `class` |
| another of an input a constraint reads | builds `class` | `class` |
| one of an input no constraint reads | builds `class` | `class` |

So a band no constraint reads need not prevent execution, and refusing every missing selected band in the
description would refuse recipes that execute.

## Open issues

- **Its inputs are not marked above their editor.** The input editor marks a selected band its source no longer
  has, but nothing marks the input's row in Input imagery or the Input imagery button, as Stack and Band Math do
  from their output reads: Remapping's description reads no input, so its output read establishes nothing about
  them. A design was prototyped and set aside: an editor-only assessment of the bands the inputs select, apart from
  the output - a provider `assess`, a resolver assessment mode, an `ASSESS` runtime work type and a second editor
  question - marking every established missing band at all three levels while leaving the output, Retrieve and
  asset export unchanged, pending or failed evidence counting as unknown. It was judged too broad to land for this
  gap alone, and is better taken up as a foundation for editor validation across recipes, if at all.
- **A constraint naming a band its input does not include is not checked.** Execution reads a constraint's band
  from the input built with only the bands it includes, so by the code it is refused like a missing band a constraint
  reads; this is not verified live, and nothing says so before execution.

## Verification

- `modules/gee/verify/classificationOutputBands.mjs` - on live Earth Engine: the declared band against the image
  built, with and without legend entries, and each case of a missing input band above, built and at one pixel.
- `modules/gui/src/app/home/body/process/recipe/remapping/panelActivation.test.jsx` - which of its panels open and
  give way, an edited legend or input holding the others closed, and the set-up wizard.
