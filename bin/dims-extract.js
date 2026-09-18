#!/usr/bin/env node

import { runCli } from "../src/cli.js";

runCli().catch((err) => {
  console.error(`[dims-extract Error] ${err.message || err}`);
  process.exit(1);
});
