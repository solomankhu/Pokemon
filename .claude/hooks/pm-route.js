// UserPromptSubmit hook: when a prompt is about game work, remind the main
// session to act as the game-pm and route work to the expert agents/skills.
// Silent (no output) for everything else, slash commands included.
let raw = '';
process.stdin.on('data', c => (raw += c));
process.stdin.on('end', () => {
  let prompt = '';
  try { prompt = JSON.parse(raw).prompt || ''; } catch (e) { return; }
  if (!prompt || prompt.trim().startsWith('/')) return;

  const GAME = /\b(game|monster|species|creature|pok[eé]mon|evol|type chart|catch|xp|level|zone|trainer|gym|battle|move|map|tile|sprite|minecraft|terraria|roblox|sandbox|craft|mining|mine|block|voxel|terrain|biome|chunk|day.?night|juice|shake|hit.?stop|particle|feel|fps|frame|lag|timestep|refresh|sound|sfx|audio|playtest|mobile|phone|tablet|touch|ui|hud|menu|button|controls|remap|accessib|colou?rblind|responsive|screenshot|balance|nerf|buff|three\.?js|canvas|pygame|static below|last signal|monster trail)/i;
  if (!GAME.test(prompt)) return;

  const ctx = [
    'Game-work prompt detected. Act as the game PM: follow the `game-pm` skill',
    '(.claude/skills/game-pm/SKILL.md). State the lane first: FAST (do it yourself),',
    'STANDARD (brief -> worker -> verify -> game-reviewer), DEEP (plan-with-review first;',
    'any risky surface: rng, step queue, saves, campaign.js, MAP, shared tables, SIM rates).',
    'Workers: creature-designer, sandbox-designer, game-feel-engineer, game-chore;',
    'judges: game-reviewer (JSON verdict, 2 rounds max), playtester (game:/mode:).',
    'Gate: `node .claude/scripts/verify.js --auto`. Not a git repo: never two agents on one file.',
    'Close with reflect-and-learn / capture-knowledge / wiki-sync as due and a final LOOP: line.'
  ].join(' ');
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: ctx }
  }));
});
