"""Prompts for the art bake-off. They describe a knight and scenery and nothing else."""

STYLE = (
    "Pixel art in a chunky 16-bit style with a limited palette of flat colours, hard pixel edges, "
    "no anti-aliasing, no gradients, no blur, no outline glow and no text. "
    "The character is a chibi knight: a big head on a small body, large dark eyes, an open-faced "
    "steel helm with a red plume, a blue tabard with a gold eye emblem on the chest, steel "
    "pauldrons and gauntlets, brown boots. He holds one greatsword in BOTH hands. He has no "
    "shield. "
    "No arm is ever drawn in front of the blade or its crossguard: the arm on the side the blade "
    "leans towards is drawn behind the blade. His face is always fully visible."
)

FLAT = (
    "The whole background is one flat solid pure green (#00FF00) with nothing else on it: no "
    "floor, no shadow, no gradient, no scenery. The knight is a single full-length figure, "
    "centred, with the whole body and the whole sword inside the frame and a margin all round."
)

STATES = {
    "idle": (
        "Reference sheet of the knight, front-facing and standing at ease with the helm on. The "
        "greatsword is held upright in both hands in front of the body, point up, with the blade "
        "leaning slightly towards the right-hand side of the picture. Calm, neutral face."
    ),
    "angry": (
        "The same knight, angry. Front-facing, brows drawn down, mouth open in a shout, helm on. "
        "The greatsword is raised high, held in both hands over his shoulder with the point up "
        "and leaning towards the right-hand side of the picture."
    ),
    "sweating": (
        "The same knight, exhausted. Front-facing, slightly hunched, mouth open and panting, "
        "sweat drops flying off his face, helm on. The greatsword point rests low and slanted, "
        "still held in both hands."
    ),
    "asleep": (
        "The same knight, asleep, with the helmet off. His brown hair is visible, eyes closed, "
        "head tilted to one side, small and peaceful. He is standing and leaning on the "
        "greatsword, point down, both hands resting on the hilt. No helmet on him."
    ),
    "walking": (
        "The same knight, walking mid-step, front three-quarter view, one boot forward and "
        "the other behind, helm on, cheerful face. The greatsword is carried in both hands "
        "across the body, tilted with the point up."
    ),
}

REF_NOTE_CODE = (
    "The reference image shows the knight as the project already draws him, three poses on one "
    "grey sheet. Copy his proportions, helm, plume, tabard, emblem, colours and pixel style. "
)
REF_NOTE_KNIGHT = (
    "The first reference image is the approved knight; keep him exactly the same knight. The "
    "second reference image shows the project's own drawing of him. "
)

BACKDROP = (
    "Pixel art in a chunky 16-bit style with a limited palette, hard pixel edges, no "
    "anti-aliasing, no text. Wide scene: the interior of a medieval smithy at night. A glowing "
    "brick forge with a hood stands against the right wall, throwing warm orange light. An anvil "
    "stands left of centre. Tools hang on the back wall, a water barrel and a small table stand "
    "on the left, the room is otherwise dark blue and brown. The flat stone floor is in the "
    "lower fifth of the picture with its front edge at the bottom. Nobody is in the scene, and "
    "the centre of the floor is clear so a character can stand on it."
)


def knight_prompt(state: str, with_knight_ref: bool) -> str:
    ref = REF_NOTE_KNIGHT if with_knight_ref else REF_NOTE_CODE
    return " ".join([ref, STYLE, STATES[state], FLAT])


BACKDROP_REF_NOTE = (
    "The reference image shows some of the project's own scenery in the same pixel style: wall "
    "tools, a barrel, a table, and a forge with a glowing fire. Match its look, but draw one "
    "complete new wide scene. "
)
