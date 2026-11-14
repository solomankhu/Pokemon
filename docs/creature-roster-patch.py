# Proposed roster: exec'd at the end of a scratch copy of claude's monsters.py.
MOVES["xscissor"] = dict(name="X-SCISSOR", type="Bug", pow=80, acc=100, cat="phys")

NEW = {
    "finnow": dict(
        name="FINNOW", types=["Water"],
        base=dict(hp=40, atk=52, def_=42, spa=38, spd=40, spe=78),
        catch_rate=220, base_exp=56,
        art=dict(kind="fish", c1=(232, 150, 70), c2=(255, 230, 190)),
        learn=[(1, "tackle"), (1, "tailwhip"), (5, "bubble"), (10, "quickattack"),
               (16, "waterpulse"), (23, "bite"), (30, "aquatail")],
        evo=None),
    "croaklet": dict(
        name="CROAKLET", types=["Poison", "Water"],
        base=dict(hp=58, atk=48, def_=50, spa=56, spd=52, spe=50),
        catch_rate=180, base_exp=64,
        art=dict(kind="frog", c1=(92, 150, 96), c2=(214, 196, 120), warts=True),
        learn=[(1, "poisonsting"), (1, "growl"), (6, "bubble"), (13, "waterpulse"),
               (19, "sludge"), (26, "bodyslam"), (32, "brinejet")],
        evo=None),
    "hootle": dict(
        name="HOOTLE", types=["Psychic", "Flying"],
        base=dict(hp=62, atk=42, def_=52, spa=74, spd=72, spe=56),
        catch_rate=110, base_exp=86,
        art=dict(kind="owl", c1=(122, 96, 150), c2=(236, 214, 176)),
        learn=[(1, "gust"), (1, "growl"), (8, "confusion"), (14, "wingattack"),
               (20, "psybeam"), (27, "agility"), (33, "aerialace"), (40, "psychic")],
        evo=None),
    "brambuck": dict(
        name="BRAMBUCK", types=["Normal", "Grass"],
        base=dict(hp=64, atk=78, def_=60, spa=42, spd=54, spe=72),
        catch_rate=100, base_exp=100,
        art=dict(kind="stag", c1=(150, 108, 70), c2=(200, 226, 140)),
        learn=[(1, "tackle"), (1, "leer"), (9, "vinewhip"), (15, "razorleaf"),
               (20, "howl"), (25, "bodyslam"), (31, "leafblade"), (42, "rockslide")],
        evo=None),
    "chithorn": dict(
        name="CHITHORN", types=["Bug"],
        base=dict(hp=62, atk=88, def_=86, spa=30, spd=52, spe=46),
        catch_rate=90, base_exp=108,
        art=dict(kind="beetle", c1=(70, 92, 120), c2=(176, 196, 214)),
        learn=[(1, "tackle"), (1, "harden"), (10, "bugbite"), (15, "metalclaw"),
               (21, "howl"), (33, "xscissor"), (38, "irontail"), (44, "rockslide")],
        evo=None),
    "driftjelly": dict(
        name="DRIFTJELLY", types=["Water", "Psychic"],
        base=dict(hp=66, atk=38, def_=48, spa=70, spd=74, spe=50),
        catch_rate=130, base_exp=92,
        art=dict(kind="jelly", c1=(176, 150, 230), c2=(250, 214, 240)),
        learn=[(1, "bubble"), (1, "confusion"), (8, "dazzle"), (15, "waterpulse"),
               (21, "psybeam"), (29, "brinejet"), (37, "psychic")],
        evo=None),
}
import os as _os
if _os.environ.get("NO_XSCISSOR"):
    NEW["chithorn"]["learn"] = [(l, m) for l, m in NEW["chithorn"]["learn"] if m != "xscissor"]
    del MOVES["xscissor"]
SPECIES.update(NEW)

# Zone edits: index -> new pool (weights sum to 100 where the old pool did).
ZONES[2]["pool"] = [("nibbit", 22), ("mirepuff", 18), ("psywisp", 22), ("galebeak", 20), ("croaklet", 18)]
ZONES[3]["pool"] = [("mirepuff", 22), ("flutterfly", 24), ("nibbit", 16), ("pebblit", 18), ("croaklet", 20)]
ZONES[5]["pool"] = [("psywisp", 22), ("lanternfly", 22), ("galebeak", 14), ("nibbit", 12), ("gnawtl", 10), ("hootle", 20)]
ZONES[6]["pool"] = [("tidewhisk", 30), ("galebeak", 20), ("nibbit", 24), ("gnawtl", 10), ("brambuck", 16)]
ZONES[9]["pool"] = [("pebblit", 30), ("boulderon", 15), ("cogling", 20), ("cinderpaw", 20), ("chithorn", 15)]
ZONES[10]["pool"] = [("pebblit", 33), ("zapmote", 20), ("gnawtl", 16), ("boulderon", 15), ("brambuck", 16)]
WATER_ZONES[0]["pool"] = [("dripling", 40), ("finnow", 40), ("mirepuff", 20)]
WATER_ZONES[1]["pool"] = [("brinecrab", 28), ("tidewhisk", 22), ("dripling", 22), ("driftjelly", 20), ("tidecoil", 8)]
