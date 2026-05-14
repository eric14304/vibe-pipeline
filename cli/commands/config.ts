import * as userConfig from "../../server/lib/userConfig";
import type { ParsedArgs } from "../lib/args";
import { fail, isJsonMode, okJson, print, printLines, table } from "../lib/output";
import { TASK_CLASSES } from "../../shared/types";

const CONFIG_USAGE = `vbpl config — user-level per-task-class model defaults (~/.vibe-pipeline/config.json)

  vbpl config list
  vbpl config get <key>             e.g. runner.model
  vbpl config set <key> <value>     e.g. runner.model claude-opus-4-7

  key 形式:<taskClass>.<field>,taskClass = qa|split|runner|executor|critic|merge,field = provider|model|effort`;

export async function runConfig(sub: string | undefined, args: ParsedArgs): Promise<void> {
  if (sub === "help" || args.flags["help"] === true) {
    print(CONFIG_USAGE);
    return;
  }
  switch (sub) {
    case "list": return configList();
    case "get":  return configGet(args);
    case "set":  return configSet(args);
    default:
      fail("INVALID_ARGS", `Unknown config subcommand: ${sub ?? "(none)"}. Use list|get|set (or 'vbpl config help')`);
  }
}

async function configList(): Promise<void> {
  const cfg = await userConfig.loadUserConfig();
  if (isJsonMode()) {
    okJson(cfg);
    return;
  }
  const rows: string[][] = [["TASK_CLASS", "PROVIDER", "MODEL", "EFFORT"]];
  for (const tc of TASK_CLASSES) {
    const t = cfg.defaults[tc];
    rows.push([tc, t.provider, t.model, t.effort]);
  }
  printLines([table(rows)]);
}

async function configGet(args: ParsedArgs): Promise<void> {
  const key = args.positional[0] ?? (typeof args.flags["key"] === "string" ? args.flags["key"] : undefined);
  if (!key) fail("INVALID_ARGS", "Usage: vbpl config get <task_class[.field]>");

  const cfg = await userConfig.loadUserConfig();
  const parts = key.split(".");
  const tc = parts[0];
  const field = parts[1];

  if (!TASK_CLASSES.includes(tc as never)) {
    fail("INVALID_ARGS", `Unknown task class: ${tc}. Valid: ${TASK_CLASSES.join(", ")}`);
  }

  const tcCfg = cfg.defaults[tc as (typeof TASK_CLASSES)[number]];
  if (!field) {
    if (isJsonMode()) {
      okJson(tcCfg);
      return;
    }
    printLines([
      `${tc}.provider: ${tcCfg.provider}`,
      `${tc}.model:    ${tcCfg.model}`,
      `${tc}.effort:   ${tcCfg.effort}`,
    ]);
    return;
  }

  const validFields = ["provider", "model", "effort"];
  if (!validFields.includes(field)) {
    fail("INVALID_ARGS", `Unknown field: ${field}. Valid: ${validFields.join(", ")}`);
  }

  const val = tcCfg[field as "provider" | "model" | "effort"];
  if (isJsonMode()) {
    okJson({ [key]: val });
    return;
  }
  print(`${key}: ${val}`);
}

async function configSet(args: ParsedArgs): Promise<void> {
  // Usage: vbpl config set <task_class.field> <value>
  // Or: vbpl config set <task_class> --provider <p> --model <m> --effort <e>
  const keyArg = args.positional[0];
  const valueArg = args.positional[1];

  if (!keyArg) fail("INVALID_ARGS", "Usage: vbpl config set <task_class[.field]> [value]");

  const parts = keyArg.split(".");
  const tc = parts[0];
  const field = parts[1];

  if (!TASK_CLASSES.includes(tc as never)) {
    fail("INVALID_ARGS", `Unknown task class: ${tc}. Valid: ${TASK_CLASSES.join(", ")}`);
  }

  let patchDefaults: Record<string, unknown>;

  if (field && valueArg !== undefined) {
    patchDefaults = { [tc]: { [field]: valueArg } };
  } else {
    // multi-field patch via flags
    const patch: Record<string, unknown> = {};
    if (typeof args.flags["provider"] === "string") patch.provider = args.flags["provider"];
    if (typeof args.flags["model"] === "string") patch.model = args.flags["model"];
    if (typeof args.flags["effort"] === "string") patch.effort = args.flags["effort"];
    if (Object.keys(patch).length === 0) {
      fail("INVALID_ARGS", "Specify value as positional or --provider/--model/--effort flags");
    }
    patchDefaults = { [tc]: patch };
  }

  try {
    const updated = await userConfig.patchUserConfig({ defaults: patchDefaults });
    if (isJsonMode()) {
      okJson(updated);
      return;
    }
    const tcCfg = updated.defaults[tc as (typeof TASK_CLASSES)[number]];
    print(`Updated ${tc}: provider=${tcCfg.provider} model=${tcCfg.model} effort=${tcCfg.effort}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    fail("INVALID_ARGS", msg);
  }
}
