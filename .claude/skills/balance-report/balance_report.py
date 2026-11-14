"""Numbers, not vibes: a balance readout for MONSTER TRAIL's tables.

Imports the Python build's pure layers (no window opens) and prints:
  1. species   - base stat total, types, catch rate, evolution, where it spawns wild
  2. zones     - level band per encounter zone and the BST spread of its pool
  3. types     - per type: species carrying it, damaging moves of it, what it hits/fears
  4. duel      - hits-to-KO matrix at a fixed level using each side's best move
                 (deterministic: no crit, no miss, mid damage roll)

    .venv/Scripts/python.exe .claude/skills/balance-report/balance_report.py
    .venv/Scripts/python.exe .claude/skills/balance-report/balance_report.py --level 30
    .venv/Scripts/python.exe .claude/skills/balance-report/balance_report.py --species emberling
    .venv/Scripts/python.exe .claude/skills/balance-report/balance_report.py --section zones
"""
import argparse
import importlib.util
import math
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, ROOT)  # the game imports sibling packages (combat/) relative to its own folder
os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")
spec = importlib.util.spec_from_file_location("mt", os.path.join(ROOT, "claude's monsters.py"))
mt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mt)

TYPES = list(mt.TYPE_COLOR)


def bst(sid):
    return sum(mt.SPECIES[sid]["base"].values())


def wild_spots():
    spots = {}
    for z in mt.ZONES:
        for sid, _w in z["pool"]:
            spots.setdefault(sid, []).append((z["min"], z["max"]))
    for z in getattr(mt, "WATER_ZONES", []):
        for sid, _w in z.get("pool", []):
            spots.setdefault(sid, []).append((z["min"], z["max"]))
    return spots


def fixed_rng():
    # damage_calc draws: accuracy, crit, roll.  0.5 passes any acc >= 51,
    # never crits (0.5 >= 0.125), and lands mid-roll (0.925x).
    return lambda: 0.5


def best_hit(att, dfn):
    best = (0, None)
    for mv in att.moves:
        if mt.MOVES[mv]["cat"] == "status":
            continue
        dmg = mt.damage_calc(att, dfn, mv, {}, {}, rng=fixed_rng())["dmg"]
        # expected damage, so a 75%-accurate nuke is not oversold
        exp = dmg * min(100, mt.MOVES[mv]["acc"]) / 100
        if exp > best[0]:
            best = (exp, mv)
    return best


def hits_to_ko(att, dfn):
    exp, mv = best_hit(att, dfn)
    return (math.inf if exp <= 0 else math.ceil(dfn.maxhp / exp)), mv


def section_species():
    spots = wild_spots()
    print("== SPECIES  (BST = base stat total)")
    print("%-12s %-17s %4s %5s  %-16s %s" % ("id", "types", "BST", "catch", "evolves", "wild levels"))
    for sid, s in sorted(mt.SPECIES.items(), key=lambda kv: bst(kv[0])):
        evo = "%s@%d" % s["evo"] if s["evo"] else "-"
        lv = ", ".join("%d-%d" % r for r in spots.get(sid, [])) or ("starter" if sid in mt.STARTERS else "not wild")
        print("%-12s %-17s %4d %5d  %-16s %s" % (sid, "/".join(s["types"]), bst(sid), s["catch_rate"], evo, lv))


def section_zones():
    print("\n== ZONES  (south -> north as listed)")
    for i, z in enumerate(mt.ZONES):
        b = [bst(sid) for sid, _ in z["pool"]]
        print("#%-2d %-12s Lv %2d-%-2d  BST %3d-%-3d  %s" % (
            i, mt.region_name(z["y1"]), z["min"], z["max"], min(b), max(b),
            ", ".join("%s:%d" % p for p in z["pool"])))


def section_types():
    print("\n== TYPES")
    print("%-9s %7s %6s  %-34s %s" % ("type", "species", "moves", "super-effective vs", "weak to"))
    for t in TYPES:
        carriers = sum(1 for s in mt.SPECIES.values() if t in s["types"])
        moves = sum(1 for m in mt.MOVES.values() if m["type"] == t and m["cat"] != "status")
        hits = [d for d, v in mt.TYPE_CHART.get(t, {}).items() if v > 1]
        fears = [a for a in TYPES if mt.TYPE_CHART.get(a, {}).get(t, 1) > 1]
        immune = [a for a in TYPES if mt.TYPE_CHART.get(a, {}).get(t, 1) == 0]
        flag = "  <- no species" if not carriers else "  <- no damaging moves" if not moves else ""
        print("%-9s %7d %6d  %-34s %s%s%s" % (t, carriers, moves, ",".join(hits) or "-", ",".join(fears) or "-",
                                             ("  immune to " + ",".join(immune)) if immune else "", flag))


def section_duel(level, only=None):
    ids = list(mt.SPECIES)
    mons = {sid: mt.make_mon(sid, level) for sid in ids}
    print("\n== DUEL at Lv %d  (hits for ROW to KO COLUMN with its best move; lower = stronger)" % level)
    if only:
        me = mons[only]
        print("%-12s %8s %-14s %8s %-14s %s" % ("foe", "I KO in", "with", "it KOs", "with", "verdict"))
        for sid in ids:
            a, am = hits_to_ko(me, mons[sid])
            d, dm = hits_to_ko(mons[sid], me)
            fast = me.spe >= mons[sid].spe
            win = a < d or (a == d and fast)
            print("%-12s %8s %-14s %8s %-14s %s" % (sid, a, am, d, dm, "WIN" if win else "lose"))
        return
    score = {}
    for r in ids:
        row = [hits_to_ko(mons[r], mons[c])[0] for c in ids]
        taken = [hits_to_ko(mons[c], mons[r])[0] for c in ids]
        wins = sum(1 for a, d in zip(row, taken) if a < d)
        score[r] = (wins, sum(x for x in row if x != math.inf) / len(ids))
    print("%-12s %5s %9s %4s" % ("species", "wins", "avg-hits", "BST"))
    for sid, (w, avg) in sorted(score.items(), key=lambda kv: (-kv[1][0], kv[1][1])):
        print("%-12s %5d %9.1f %4d" % (sid, w, avg, bst(sid)))
    print("(wins = matchups this species takes strictly faster than the foe; tiers should track BST and evolution stage)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--level", type=int, default=25)
    ap.add_argument("--species", help="detailed duel table for one species id")
    ap.add_argument("--section", choices=["species", "zones", "types", "duel"])
    a = ap.parse_args()
    if a.species and a.species not in mt.SPECIES:
        raise SystemExit("unknown species %r; ids: %s" % (a.species, ", ".join(mt.SPECIES)))
    run = {"species": section_species, "zones": section_zones, "types": section_types,
           "duel": lambda: section_duel(a.level, a.species)}
    for name in ([a.section] if a.section else ["species", "zones", "types", "duel"]):
        run[name]()


if __name__ == "__main__":
    main()
