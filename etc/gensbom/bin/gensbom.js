#!/usr/bin/env node

import { exit } from "node:process";
import { handleError } from "../dist/utils.js";
import { main } from "../dist/index.js";

try {
  exit(await main());
} catch (err) {
  exit(handleError(err));
}
