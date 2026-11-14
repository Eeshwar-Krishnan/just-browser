/**
 * Interactive & scriptable CLI entrypoint for `just-browser`.
 * Launches `just-bash` with `agent-browser` + in-process Kitesurf WASM browser preloaded.
 */

import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createJustBrowser } from "./index.ts";

function parseCliArgs(argv: string[]): { command?: string; allowNetwork: boolean } {
  let command: string | undefined;
  let allowNetwork = true;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if ((arg === "-c" || arg === "--command") && i + 1 < argv.length) {
      command = argv[++i]!;
    } else if (arg === "--offline" || arg === "--no-network") {
      allowNetwork = false;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`just-browser - just-bash + agent-browser + Kitesurf WASM

Usage:
  just-browser                      Start interactive virtual bash shell
  just-browser -c "<script>"        Execute bash commands and exit
  just-browser --offline -c "..."   Disable external HTTP(S) egress

Example:
  just-browser -c 'echo "<h1>Hi</h1><button>Go</button>" > p.html && agent-browser open p.html && agent-browser snapshot -i'
`);
      process.exit(0);
    }
  }
  return { command, allowNetwork };
}

async function main(): Promise<void> {
  const opts = parseCliArgs(process.argv.slice(2));
  const jb = createJustBrowser({ allowDirectNetwork: opts.allowNetwork });

  try {
    if (opts.command !== undefined) {
      const res = await jb.exec(opts.command);
      if (res.stdout) process.stdout.write(res.stdout);
      if (res.stderr) process.stderr.write(res.stderr);
      process.exitCode = res.exitCode;
      return;
    }

    console.log("just-browser shell ready (just-bash + agent-browser + Kitesurf WASM). Type `exit` to quit.");
    const rl = readline.createInterface({ input, output });
    try {
      while (true) {
        const line = await rl.question("just-browser$ ");
        const trimmed = line.trim();
        if (trimmed === "exit" || trimmed === "quit") break;
        if (!trimmed) continue;
        const res = await jb.exec(line);
        if (res.stdout) process.stdout.write(res.stdout);
        if (res.stderr) process.stderr.write(res.stderr);
      }
    } finally {
      rl.close();
    }
  } finally {
    await jb.close();
  }
}

main()
  .then(() => {
    process.exit(typeof process.exitCode === "number" ? process.exitCode : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
