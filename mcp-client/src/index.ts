#!/usr/bin/env node
import process from "node:process";

import { buildCli } from "./cli/commands";

const program = buildCli();

program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
