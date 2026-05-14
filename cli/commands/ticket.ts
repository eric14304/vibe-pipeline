import * as pipelineDir from "../../server/lib/pipelineDir";
import { resolveProject, requireInit } from "../lib/project";
import type { ParsedArgs } from "../lib/args";
import { fail, isJsonMode, okJson, print, printLines, table } from "../lib/output";
import type { Ticket, TicketMode, TicketStatus } from "../../shared/types";

const TICKET_USAGE = `vbpl ticket — manage tickets within a pipeline

  vbpl ticket list   --pipeline <id>
  vbpl ticket show   --pipeline <id> --ticket <n|id>
  vbpl ticket add    --pipeline <id> --title <t> [--goal ...] [--acceptance "a;b"] [--prompt ...] [--mode step|iter] [--iter-limit <n>]
  vbpl ticket update --pipeline <id> --ticket <n|id> [--title ...] [--goal ...] [--prompt ...] [--acceptance "a;b"] [--mode step|iter] [--status ...] [--iter-limit <n>]
  vbpl ticket remove --pipeline <id> --ticket <n|id>

  --pipeline / --ticket also accept first / second positional arg.`;

export async function runTicket(sub: string | undefined, args: ParsedArgs): Promise<void> {
  if (sub === "help" || args.flags["help"] === true) {
    print(TICKET_USAGE);
    return;
  }
  switch (sub) {
    case "list":   return ticketList(args);
    case "show":   return ticketShow(args);
    case "add":    return ticketAdd(args);
    case "update": return ticketUpdate(args);
    case "remove": return ticketRemove(args);
    default:
      fail("INVALID_ARGS", `Unknown ticket subcommand: ${sub ?? "(none)"}. Use list|show|add|update|remove (or 'vbpl ticket help')`);
  }
}

function getPipelineId(args: ParsedArgs): string {
  const id = typeof args.flags["pipeline"] === "string" ? args.flags["pipeline"] : args.positional[0];
  if (!id) fail("INVALID_ARGS", "Specify pipeline id with --pipeline <id> or as first positional arg");
  return id;
}

async function readPipeline(projectPath: string, pipelineId: string) {
  const pipeline = await pipelineDir.readPipeline(projectPath, pipelineId) as {
    id: string;
    name: string;
    state: string;
    tickets: Ticket[];
    [k: string]: unknown;
  } | null;
  if (!pipeline) fail("NO_PIPELINE", `Pipeline not found: ${pipelineId}`);
  return pipeline!;
}

async function ticketList(args: ParsedArgs): Promise<void> {
  const proj = await resolveProject(args.flags);
  await requireInit(proj.path);
  const pipelineId = getPipelineId(args);
  const pipeline = await readPipeline(proj.path, pipelineId);
  const tickets = pipeline.tickets ?? [];

  if (isJsonMode()) {
    okJson(tickets);
    return;
  }
  if (tickets.length === 0) {
    print("No tickets.");
    return;
  }
  const rows: string[][] = [["N", "TITLE", "STATUS", "MODE"]];
  for (const t of tickets) {
    rows.push([String(t.n), t.title, t.status, t.mode]);
  }
  printLines([table(rows)]);
}

async function ticketShow(args: ParsedArgs): Promise<void> {
  const proj = await resolveProject(args.flags);
  await requireInit(proj.path);
  const pipelineId = typeof args.flags["pipeline"] === "string" ? args.flags["pipeline"] : args.positional[0];
  const ticketN = typeof args.flags["ticket"] === "string" ? args.flags["ticket"] : args.positional[1];
  if (!pipelineId || !ticketN) {
    fail("INVALID_ARGS", "Usage: vbpl ticket show --pipeline <id> --ticket <n|id>");
  }
  const pipeline = await readPipeline(proj.path, pipelineId!);
  const tickets = pipeline.tickets ?? [];
  const ticket = tickets.find((t) => String(t.n) === ticketN || t.id === ticketN);
  if (!ticket) fail("NO_TICKET", `Ticket ${ticketN} not found in pipeline ${pipelineId}`);

  if (isJsonMode()) {
    okJson(ticket);
    return;
  }
  printLines([
    `n:          ${ticket!.n}`,
    `id:         ${ticket!.id}`,
    `title:      ${ticket!.title}`,
    `mode:       ${ticket!.mode}`,
    `status:     ${ticket!.status}`,
    `goal:       ${ticket!.goal ?? "-"}`,
    `prompt:     ${ticket!.prompt ?? "-"}`,
    `acceptance: ${(ticket!.acceptance ?? []).join("; ") || "-"}`,
    `iterLimit:  ${ticket!.iterLimit ?? "-"}`,
  ]);
}

async function ticketAdd(args: ParsedArgs): Promise<void> {
  const proj = await resolveProject(args.flags);
  await requireInit(proj.path);

  // Pipeline id: --pipeline flag or first positional
  const pipelineId = typeof args.flags["pipeline"] === "string" ? args.flags["pipeline"] : args.positional[0];
  if (!pipelineId) fail("INVALID_ARGS", "Usage: vbpl ticket add --pipeline <id> --title <title> [--goal ...] [--acceptance ...] [--prompt ...] [--mode step|iter]");

  const title = typeof args.flags["title"] === "string" ? args.flags["title"] : undefined;
  if (!title) fail("INVALID_ARGS", "--title is required");

  const goal = typeof args.flags["goal"] === "string" ? args.flags["goal"] : "";
  const acceptance = typeof args.flags["acceptance"] === "string" ? args.flags["acceptance"].split(";").map((s) => s.trim()).filter(Boolean) : [];
  const prompt = typeof args.flags["prompt"] === "string" ? args.flags["prompt"] : "";
  const rawMode = typeof args.flags["mode"] === "string" ? args.flags["mode"] : "step";
  const mode: TicketMode = (rawMode === "iter" ? "iter" : "step");
  const iterLimit = typeof args.flags["iter-limit"] === "string" ? Number(args.flags["iter-limit"]) : undefined;

  const pipeline = await readPipeline(proj.path, pipelineId!);
  const tickets = pipeline.tickets ?? [];
  const n = tickets.reduce((m, t) => Math.max(m, typeof t.n === "number" ? t.n : 0), 0) + 1;
  const ts = Date.now().toString(16).padStart(12, "0");

  const ticket: Ticket = {
    id: `t${n}-${ts}`,
    n,
    title: title!,
    goal,
    acceptance,
    prompt,
    mode,
    status: "draft",
    ...(iterLimit != null && !isNaN(iterLimit) ? { iterLimit } : {}),
  };

  tickets.push(ticket);
  await pipelineDir.writePipeline(proj.path, pipelineId!, { ...pipeline, tickets });

  if (isJsonMode()) {
    okJson(ticket);
    return;
  }
  print(`Added ticket ${n}: ${title!} (${mode}) to pipeline ${pipelineId}`);
}

async function ticketUpdate(args: ParsedArgs): Promise<void> {
  const proj = await resolveProject(args.flags);
  await requireInit(proj.path);

  const pipelineId = typeof args.flags["pipeline"] === "string" ? args.flags["pipeline"] : args.positional[0];
  const ticketRef = typeof args.flags["ticket"] === "string" ? args.flags["ticket"] : args.positional[1];
  if (!pipelineId || !ticketRef) {
    fail("INVALID_ARGS", "Usage: vbpl ticket update --pipeline <id> --ticket <n|id> [--title ...] [--goal ...] [--prompt ...] [--acceptance \"a;b\"] [--mode step|iter] [--status ...] [--iter-limit <n>]");
  }

  const pipeline = await readPipeline(proj.path, pipelineId!);
  const tickets = pipeline.tickets ?? [];
  const idx = tickets.findIndex((t) => String(t.n) === ticketRef || t.id === ticketRef);
  if (idx === -1) fail("NO_TICKET", `Ticket ${ticketRef} not found`);

  const orig = tickets[idx];
  const updated: Ticket = { ...orig };

  if (typeof args.flags["title"] === "string") updated.title = args.flags["title"];
  if (typeof args.flags["goal"] === "string") updated.goal = args.flags["goal"];
  if (typeof args.flags["prompt"] === "string") updated.prompt = args.flags["prompt"];
  if (typeof args.flags["acceptance"] === "string") {
    updated.acceptance = args.flags["acceptance"].split(";").map((s) => s.trim()).filter(Boolean);
  }
  if (typeof args.flags["mode"] === "string") {
    const m = args.flags["mode"];
    updated.mode = (m === "iter" ? "iter" : "step") as TicketMode;
  }
  if (typeof args.flags["status"] === "string") {
    updated.status = args.flags["status"] as TicketStatus;
  }
  if (typeof args.flags["iter-limit"] === "string") {
    const n = Number(args.flags["iter-limit"]);
    if (!isNaN(n)) updated.iterLimit = n;
  }

  tickets[idx] = updated;
  await pipelineDir.writePipeline(proj.path, pipelineId!, { ...pipeline, tickets });

  if (isJsonMode()) {
    okJson(updated);
    return;
  }
  print(`Updated ticket ${orig.n}: ${updated.title}`);
}

async function ticketRemove(args: ParsedArgs): Promise<void> {
  const proj = await resolveProject(args.flags);
  await requireInit(proj.path);

  const pipelineId = typeof args.flags["pipeline"] === "string" ? args.flags["pipeline"] : args.positional[0];
  const ticketRef = typeof args.flags["ticket"] === "string" ? args.flags["ticket"] : args.positional[1];
  if (!pipelineId || !ticketRef) {
    fail("INVALID_ARGS", "Usage: vbpl ticket remove --pipeline <id> --ticket <n|id>");
  }

  const pipeline = await readPipeline(proj.path, pipelineId!);
  const tickets = pipeline.tickets ?? [];
  const idx = tickets.findIndex((t) => String(t.n) === ticketRef || t.id === ticketRef);
  if (idx === -1) fail("NO_TICKET", `Ticket ${ticketRef} not found`);

  const removed = tickets[idx];
  tickets.splice(idx, 1);
  await pipelineDir.writePipeline(proj.path, pipelineId!, { ...pipeline, tickets });

  if (isJsonMode()) {
    okJson({ removed: true, id: removed.id, n: removed.n });
    return;
  }
  print(`Removed ticket ${removed.n}: ${removed.title}`);
}
