"""The phase 2 asset list for the fal candidate set: names, kinds, sizes and prompts.

Every prompt describes a knight and scenery and nothing else.
"""

RULES = (
    "Rules for this picture. It is the same knight as the first reference image: the same "
    "proportions, the same open-faced steel helm with a red plume (unless it is said to be off), "
    "the same blue tabard with the gold eye emblem, the same colours and pixel style. He is "
    "front-facing, the whole body is in the frame with both boots on one baseline, drawn at the "
    "same scale as in the first reference image, and his face is visible. When he holds the "
    "greatsword, both hands are on its grip, he has no shield, and no arm or hand is drawn over "
    "the blade or the crossguard: the arm nearest the blade passes behind it. "
)

FLAT_BG = (
    "The whole background is one flat solid pure green (#00FF00) with nothing else on it: no "
    "floor, no shadow, no gradient. Leave a margin round the figure and the sword. "
)

PIXEL = (
    "Pixel art in a chunky 16-bit style with a limited palette of flat colours, hard pixel edges, "
    "no anti-aliasing, no blur and no text. "
)

KNIGHT_LOOK = (
    "The character is a chibi knight: a big head on a small body, large dark eyes, an "
    "open-faced steel helm with a red plume, a blue tabard with a gold eye emblem on the chest, "
    "steel pauldrons and gauntlets, brown boots. He has no shield. "
)

KNIGHT_REFS = (
    "The first reference image is the approved knight. The second reference image shows the "
    "project's own drawing of him in three poses, the third with the helmet off. "
)

BARE = (
    "The helm and plume are off: he has the same face and the brown hair of the helmetless "
    "pose in the second reference image, and the same blue tabard, steel pauldrons and gauntlets, "
    "belt and boots. "
)

# name: (size, description). Helm-on frames first, then helm-off.
KNIGHT_FRAMES = {
    "walk-b": (
        "1024x1024",
        "Walking, mid-step: the boot on the right-hand side of the picture "
        "steps forward and the other boot trails behind. Helm on, "
        "cheerful face. The greatsword is carried in both hands across the body, point up.",
    ),
    "bloated": (
        "1024x1024",
        "Bloated and queasy: cheeks puffed out, a swollen round belly "
        "stretching the tabard, a greenish tinge on his face. Helm on, standing, the "
        "greatsword held upright in both hands.",
    ),
    "puzzled": (
        "1024x1024",
        "Puzzled: eyes looking sideways, the mouth a small o, helm on. "
        "The greatsword is held upright in both hands as in the first reference image.",
    ),
    "happy": (
        "1024x1024",
        "Happy: eyes closed in a big smile, helm on. The greatsword is held "
        "upright in both hands as in the first reference image.",
    ),
    "talking": (
        "1024x1024",
        "Talking: mouth open mid-word, eyes open, helm on. The greatsword "
        "is held upright in both hands as in the first reference image.",
    ),
    "carrying": (
        "1024x1024",
        "Carrying: no sword. Both arms are raised straight up holding one "
        "wooden crate above his head, straining, teeth gritted, helm on.",
    ),
    "swing-windup": (
        "1536x1024",
        "About to cut: the greatsword is raised back over his left "
        "shoulder, held in both hands, the blade pointing up and behind him, his "
        "body coiled. Helm on.",
    ),
    "swing-mid": (
        "1536x1024",
        "Mid-cut: the greatsword is level, swinging across his front "
        "from left to right, held in both hands, the blade horizontal and pointing to "
        "the right of the picture. Helm on, determined face.",
    ),
    "swing-end": (
        "1536x1024",
        "End of the cut: the greatsword is low to his right side, the "
        "blade slanting down towards the right of the picture, held in both hands. "
        "Helm on, determined face.",
    ),
    "angry-raised": (
        "1024x1024",
        "Angry, ready to strike: the greatsword is gripped in both hands "
        "and held high above his head: both arms are stretched straight up, both "
        "hands are above the top of his helm gripping the hilt, and the blade rises "
        "above that, pointing up. Brows drawn down hard, mouth open in a shout. "
        "Helm on.",
    ),
    "idle-bare": ("1024x1024", BARE + "Standing at ease, no sword, arms at his sides, calm face."),
    "hungry-bare": ("1024x1024", BARE + "Sad and hungry, one hand on his belly, no sword."),
    "happy-bare": ("1024x1024", BARE + "Smiling happily, standing, no sword, arms at his sides."),
    "eating-bare": (
        "1024x1024",
        "Draw exactly ONE figure, a single knight, not a sheet and not "
        "several poses. " + BARE + "Eating: he holds a roast drumstick to his mouth with "
        "one hand, no sword.",
    ),
    "yawning-bare": (
        "1024x1024",
        BARE + "Yawning widely with eyes shut, one fist raised to his mouth, no sword.",
    ),
    "hammer-up": (
        "1024x1024",
        BARE + "Working at a forge: a smith's hammer is raised in his "
        "right hand, and his left hand is held forward at waist height as if steadying "
        "work. No sword.",
    ),
    "hammer-down": (
        "1024x1024",
        BARE + "Working at a forge: he grips a clearly visible smith's "
        "hammer with a long wooden handle and a grey iron head in his right hand, "
        "the hammer struck down to waist height in front of him with the head "
        "pointing down, and his left hand is held forward at waist height steadying "
        "the work. No sword. The hammer must be in the picture.",
    ),
}

BEDS = {
    "bed-empty": "A side-on wooden bed with a pillow, made up with a blue blanket, nobody in it.",
    "bed-asleep": (
        "The same side-on wooden bed, blue blanket. The knight's bare head with brown "
        "hair rests on the pillow, eyes closed, the blanket pulled up to his chin."
    ),
    "bed-sick": (
        "The same side-on wooden bed, blue blanket. The knight's bare head with brown "
        "hair rests on the pillow, the blanket pulled up to his chin, his face green and "
        "sickly, a thermometer in his mouth and a small ice bag on his forehead."
    ),
}

STYLE_REF_NOTE = (
    "The reference image is the project's own pixel-art smithy. Match its pixel style, palette "
    "and lighting mood, but draw the different scene described. "
)

FLOOR = (
    "The lower sixth of the picture is an unbroken flat floor strip at one constant height across "
    "the whole width, its front edge at the bottom of the picture, with nothing standing in it. "
    "Nobody is in the scene. "
)

BACKDROPS = {
    "battlement": (
        "A castle wall walk at night: a low crenellated parapet behind, a starry sky, "
        "a crescent moon, one lit torch on a bracket."
    ),
    "camp": (
        "A forest clearing at night: a canvas tent on the left, a ring of stones for a "
        "fire on the right with NO flames and no fire, a log to sit on."
    ),
    "house": (
        "A dim timber-framed room at night: a window, a small table, a stone hearth on "
        "the right with NO flames and no fire, and a clear empty floor space on the "
        "left where a bed will be placed."
    ),
    "yard": (
        "A castle training yard at night: a dark starry sky with a crescent moon and a "
        "lit torch on the wall giving a warm light, a straw practice dummy right of "
        "centre and a weapon rack on the left. The whole scene is dark and night-time, "
        "no daylight and no sunset."
    ),
    "cellar": (
        "A stone vault cellar, dimly lit: shelves along the back, wooden crates "
        "stacked high at both sides, a clear floor in the middle."
    ),
    "court": (
        "A throne room, dimly lit: banners on the walls and an EMPTY golden throne "
        "with nobody on it on a low dais at the right. The camera looks straight at "
        "the back wall. The floor is a perfectly level, flat stone floor made of "
        "horizontal rows of paving, and a wide red carpet is a straight horizontal "
        "band running along the floor across the picture from the left edge to the "
        "foot of the dais steps, with no diagonal lines anywhere on the floor."
    ),
}

PROP_SHEETS = {
    "props-a": (
        "Sprite sheet of seven separate items on a flat background, wide gaps between "
        "them, none touching. Top row from left to right: a raspberry pie on a tin plate, "
        "drawn large, about two fifths of the picture's height; an empty tin plate with a "
        "few crumbs, drawn at exactly the same size and the same angle as the pie's plate; "
        "a closed wooden crate with its lid on, made of light pale wood so that it stands "
        "out on a dark scene; a red-and-white striped parachute canopy with its cords "
        "hanging down. Bottom row from left to right: a green goblin head with pointed ears "
        "and a toothy grin; a house fly with its wings raised up; the same house fly with its "
        "wings lowered down."
    ),
    "props-b": (
        "Sprite sheet of seven separate items on a flat background, wide gaps between "
        "them, none touching. Top row from left to right: a camp flame; the same camp "
        "flame in a slightly different shape, as the next frame of a flicker; a small "
        "torch flame; the same torch flame in a slightly different shape. Bottom row "
        "from left to right: a roast drumstick; a small old television with a lit blue "
        "screen; the same television with a lit yellow screen."
    ),
    "props-c": (
        "Sprite sheet of two separate items on a flat background, wide gap between them. "
        "Left: a seated king facing front, with a crown, a white beard, a red robe and a "
        "sceptre, his mouth closed. Right: the same seated king, identical in every way, "
        "with his mouth open."
    ),
}

PROP_STYLE = (
    "Match the pixel style of the reference image, but do not draw a room: draw only the "
    "items listed, each fully visible. "
)

# purpose -> (kind, size)
REGISTRY = {}
for _n, (_s, _d) in KNIGHT_FRAMES.items():
    REGISTRY[_n] = ("knight", _s)
for _n in BEDS:
    REGISTRY[_n] = ("bed", "1280x800")
for _n in BACKDROPS:
    REGISTRY[_n] = ("backdrop2", "1280x800")
for _n in PROP_SHEETS:
    REGISTRY[_n] = ("props", "1280x800")


def prompt_for(name: str) -> str:
    kind, _ = REGISTRY[name]
    if kind == "knight":
        return KNIGHT_REFS + PIXEL + KNIGHT_LOOK + RULES + KNIGHT_FRAMES[name][1] + " " + FLAT_BG
    if kind == "bed":
        return (
            "The reference images show the knight only so that the face and hair match. "
            + PIXEL
            + "A side-on prop on the flat background, a single bed that fits "
            "entirely inside the picture with a margin all round, about as wide as the "
            "picture's middle half. " + BEDS[name] + " Nothing else is in the picture: no "
            "standing knight, no sword, no shield, no armour, no other person. " + FLAT_BG
        )
    if kind == "backdrop2":
        return STYLE_REF_NOTE + PIXEL + "Wide scene: " + BACKDROPS[name] + " " + FLOOR
    return PROP_STYLE + PIXEL + PROP_SHEETS[name] + " " + FLAT_BG
