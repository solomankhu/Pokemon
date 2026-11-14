"""Re-emit MONSTER TRAIL's data tables from the Python build into the HTML build.

The .py file is the source of truth for MOVES, SPECIES, STARTERS, MAP and
ZONES, plus the sandbox tables MATERIALS, BLOCKS and RECIPES, and
CONDITIONS and REGION_CONDITIONS (battle weather), and the loot tables GOODS,
LOOT_AREA and LOOT_TYPE, and the item icons ICON_PALETTE, ICON_SHADOW and ICONS. This script imports it (layers 1-3 are import-safe, no window opens),
renders each table in the exact house style of the .html build, and either
prints a diff or splices the result in place.

    .venv/Scripts/python.exe .claude/skills/add-monster/emit_tables.py           # dry run: show diff
    .venv/Scripts/python.exe .claude/skills/add-monster/emit_tables.py --write   # splice into the .html

Translation rules (the two builds spell things differently):
    def_            -> def              (stat keys, also inside move eff)
    catch_rate      -> catchRate
    base_exp        -> baseExp
    high_crit       -> highCrit
    eff=(s, n, t)   -> eff: { stat, stages, target }
    evo=(id, lvl)   -> evo: { into, level }  /  None -> null
    RGB tuples      -> '#rrggbb'
    ore_one_in      -> oreOneIn         (sandbox BLOCKS)
    authored_only   -> authoredOnly     (sandbox BLOCKS, only emitted when true)
    tool            -> tool             (sandbox BLOCKS: 'pick' or 'axe', always emitted)
    sets_tier       -> setsTier         (sandbox RECIPES, only emitted when set)
    sets_tool       -> setsTool         (sandbox RECIPES, [flag, level], only emitted when set)
    cap             -> cap              (sandbox RECIPES, only emitted when present)
    {k: n} dicts    -> { k: n }
    REGION_CONDITIONS tuples -> [id, weight] arrays
    LOOT_AREA tuples         -> [id, weight] arrays
    GOODS bonus / heal       -> only emitted when present
Constants (BALL_PRICE, COINS_MAX, ...) are hand-ported; PARITY compares them.
"""
import difflib
import importlib.util
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PY_PATH = os.path.join(ROOT, "claude's monsters.py")
HTML_PATH = os.path.join(ROOT, "claude's monsters.html")
sys.path.insert(0, ROOT)  # the game imports sibling packages (combat/) relative to its own folder

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")
spec = importlib.util.spec_from_file_location("mt", PY_PATH)
mt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mt)


def js(v):
    """A Python scalar or list as a JS literal, single-quoted strings."""
    if v is True:
        return "true"
    if v is False:
        return "false"
    if v is None:
        return "null"
    if isinstance(v, str):
        return "'" + v.replace("\\", "\\\\").replace("'", "\\'") + "'"
    if isinstance(v, (list, tuple)):
        return "[" + ", ".join(js(x) for x in v) + "]"
    return repr(v)


def stat(k):
    return "def" if k == "def_" else k


def colour(v):
    if isinstance(v, tuple) and len(v) == 3:
        return "'#%02x%02x%02x'" % v
    return js(v)


def emit_moves():
    out = ["const MOVES = {"]
    for k, m in mt.MOVES.items():
        parts = ["name: %s" % js(m["name"]), "type: %s" % js(m["type"]),
                 "pow: %d" % m["pow"], "acc: %d" % m["acc"], "cat: %s" % js(m["cat"])]
        if "eff" in m:
            s, n, t = m["eff"]
            parts.append("eff: { stat: %s, stages: %d, target: %s }" % (js(stat(s)), n, js(t)))
        if m.get("prio"):
            parts.append("prio: %d" % m["prio"])
        if m.get("high_crit"):
            parts.append("highCrit: true")
        out.append("  %s{ %s }," % ((k + ":").ljust(15), ", ".join(parts)))
    out.append("};")
    return out


def emit_species():
    out = ["const SPECIES = {"]
    items = list(mt.SPECIES.items())
    for i, (k, s) in enumerate(items):
        base = ", ".join("%s: %d" % (stat(sk), s["base"][sk]) for sk in mt.STAT_KEYS)
        art = ", ".join("%s: %s" % (ak, colour(av)) for ak, av in s["art"].items())
        learn = ", ".join("[%d, %s]" % (lvl, js(mv)) for lvl, mv in s["learn"])
        evo = "{ into: %s, level: %d }" % (js(s["evo"][0]), s["evo"][1]) if s["evo"] else "null"
        out += ["  %s: {" % k,
                "    name: %s, types: %s," % (js(s["name"]), js(s["types"])),
                "    base: { %s }," % base,
                "    catchRate: %d, baseExp: %d, art: { %s }," % (s["catch_rate"], s["base_exp"], art),
                "    learn: [%s]," % learn,
                "    evo: %s" % evo,
                "  },"]
    out.append("};")
    return out


def emit_starters():
    return ["const STARTERS = %s;" % js(list(mt.STARTERS))]


def emit_map():
    return ["const MAP = ["] + ["  %s," % js(r) for r in mt.MAP] + ["];"]


def emit_zones():
    out = ["const ZONES = ["]
    for i, z in enumerate(mt.ZONES):
        pool = ", ".join("[%s, %d]" % (js(a), b) for a, b in z["pool"])
        out += ["  { x1: %d, y1: %d, x2: %d, y2: %d, min: %d, max: %d," % (
                    z["x1"], z["y1"], z["x2"], z["y2"], z["min"], z["max"]),
                "    pool: [%s] }," % pool]
    out.append("];")
    return out


def obj(d):
    """A flat {str: scalar} dict as a JS object literal."""
    if not d:
        return "{}"
    return "{ " + ", ".join("%s: %s" % (k, js(v)) for k, v in d.items()) + " }"


def emit_materials():
    return ["const MATERIALS = %s;" % js(list(mt.MATERIALS))]


def emit_blocks():
    out = ["const BLOCKS = {"]
    for k, b in mt.BLOCKS.items():
        extra = ", authoredOnly: true" if b.get("authored_only") else ""
        out.append("  %s: { name: %s, drops: %s, oreOneIn: %d, leaves: %s, tier: %d, tool: %s%s }," % (
            js(k), js(b["name"]), obj(b["drops"]), b["ore_one_in"], js(b["leaves"]), b["tier"],
            js(b.get("tool", "pick")), extra))
    out.append("};")
    return out


def emit_recipes():
    out = ["const RECIPES = ["]
    for r in mt.RECIPES:
        extra = ", setsTier: %d" % r["sets_tier"] if r.get("sets_tier") else ""
        if r.get("sets_tool"):
            extra += ", setsTool: %s" % js(list(r["sets_tool"]))
        if "cap" in r:
            extra += ", cap: %d" % r["cap"]
        out.append("  { id: %s, out: %s, count: %d, needs: %s%s }," % (
            js(r["id"]), js(r["out"]), r["count"], obj(r["needs"]), extra))
    out.append("];")
    return out


def emit_conditions():
    out = ["const CONDITIONS = {"]
    for k, c in mt.CONDITIONS.items():
        out.append("  %s: { name: %s, msg: %s, boost: %s, acc: %d }," % (
            k, js(c["name"]), js(c["msg"]), obj(c["boost"]) if c["boost"] else "{}", c["acc"]))
    out.append("};")
    return out


def emit_region_conditions():
    out = ["const REGION_CONDITIONS = {"]
    for k, pool in mt.REGION_CONDITIONS.items():
        out.append("  %s: [%s]," % (js(k), ", ".join("[%s, %d]" % (js(c), w) for c, w in pool)))
    out.append("};")
    return out


def emit_goods():
    out = ["const GOODS = {"]
    for k, v in mt.GOODS.items():
        parts = ["name: %s" % js(v["name"]), "kind: %s" % js(v["kind"]), "price: %d" % v["price"]]
        for opt in ("bonus", "heal"):
            if opt in v:
                parts.append("%s: %s" % (opt, js(v[opt])))
        parts.append("desc: %s" % js(v["desc"]))
        out.append("  %s: { %s }," % (k, ", ".join(parts)))
    out.append("};")
    return out


def emit_loot_area():
    out = ["const LOOT_AREA = {"]
    for k, pool in mt.LOOT_AREA.items():
        out.append("  %s: [%s]," % (js(k), ", ".join("[%s, %d]" % (js(i), w) for i, w in pool)))
    out.append("};")
    return out


def emit_loot_type():
    body = obj(mt.LOOT_TYPE)[2:-2]
    return ["const LOOT_TYPE = {", "  " + body + ",", "};"]


def emit_icon_palette():
    out = ["const ICON_PALETTE = {"]
    for k, rgb in mt.ICON_PALETTE.items():
        out.append("  %s: %s," % (js(k), js(list(rgb))))
    return out + ["};"]


def emit_icon_shadow():
    return ["const ICON_SHADOW = %s;" % js(list(mt.ICON_SHADOW))]


def emit_icons():
    out = ["const ICONS = {"]
    for name, rows in mt.ICONS.items():
        out.append("  %s: [" % name)
        out.extend("    %s," % js(row) for row in rows)
        out.append("  ],")
    return out + ["};"]


BLOCKS = [("const MOVES = {", "};", emit_moves),
          ("const SPECIES = {", "};", emit_species),
          ("const STARTERS = ", None, emit_starters),
          ("const MAP = [", "];", emit_map),
          ("const ZONES = [", "];", emit_zones),
          ("const MATERIALS = ", None, emit_materials),
          ("const BLOCKS = {", "};", emit_blocks),
          ("const RECIPES = [", "];", emit_recipes),
          ("const CONDITIONS = {", "};", emit_conditions),
          ("const REGION_CONDITIONS = {", "};", emit_region_conditions),
          ("const GOODS = {", "};", emit_goods),
          ("const LOOT_AREA = {", "};", emit_loot_area),
          ("const LOOT_TYPE = {", "};", emit_loot_type),
          ("const ICON_PALETTE = {", "};", emit_icon_palette),
          ("const ICON_SHADOW = ", None, emit_icon_shadow),
          ("const ICONS = {", "};", emit_icons)]


def splice(lines):
    lines = list(lines)
    for head, tail, fn in BLOCKS:
        start = next((i for i, l in enumerate(lines) if l.startswith(head)), None)
        if start is None:
            sys.exit("could not find %r in the .html build" % head)
        end = start if tail is None else next(i for i in range(start, len(lines)) if lines[i] == tail)
        lines[start:end + 1] = fn()
    return lines


def main():
    with open(HTML_PATH, encoding="utf-8", newline="") as f:
        text = f.read()
    nl = "\r\n" if "\r\n" in text else "\n"
    old = text.split(nl)
    new = splice(old)
    delta = list(difflib.unified_diff(old, new, "html (current)", "html (from .py)", lineterm="", n=1))
    if not delta:
        print("HTML tables already match the Python build.")
        return
    if "--write" in sys.argv:
        with open(HTML_PATH, "w", encoding="utf-8", newline="") as f:
            f.write(nl.join(new))
        print("Spliced %d changed lines into %s" % (sum(1 for d in delta if d[:1] in "+-") - 2,
                                                  os.path.basename(HTML_PATH)))
    else:
        print(nl.join(delta) if nl == "\n" else "\n".join(delta))
        print("\n(dry run - pass --write to apply)")


if __name__ == "__main__":
    main()
