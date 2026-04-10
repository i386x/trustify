import { argv, cwd } from "node:process";
import { basename } from "node:path";
import { statSync } from "node:fs";
import { styleText } from "node:util";

const SCRIPT_NAME_DEFAULT = "<script>";

export class FatalError extends Error {
  errorCode: number;

  constructor(message: string, errorCode = 1) {
    super(message);
    this.errorCode = errorCode;
  }
}

let scriptNameCached = SCRIPT_NAME_DEFAULT;

export function scriptName(): string {
  if (scriptNameCached === SCRIPT_NAME_DEFAULT && typeof argv[1] === "string")
    scriptNameCached = basename(argv[1]);
  return scriptNameCached;
}

export function stringify(obj: object, indent = "  "): string {
  let result = "";

  JSON.stringify(obj, null, "  ")
    .split("\n")
    .forEach((line) => {
      result += line !== "" ? `${indent}${line}\n` : "\n";
    });
  return result;
}

export function inform(...messages: string[]): void {
  messages.forEach((msg) => {
    console.log(styleText("blue", `${scriptName()}: ${msg}`));
  });
  if (messages.length > 0) console.log("");
}

export function warning(...messages: string[]): void {
  messages.forEach((msg) => {
    console.error(
      styleText("yellowBright", `WARNING[${scriptName()}]: ${msg}`),
    );
  });
  if (messages.length > 0) console.error("");
}

export function werror(message: string): void {
  console.error(styleText("red", message));
}

export function handleError(err: unknown): number {
  let message = "Unknown error";
  let exitCode = 1;

  if (err instanceof Error) {
    ({ message } = err);
    if (err instanceof FatalError) exitCode = err.errorCode;
  }
  werror(`ERROR[${scriptName()}]: ${message}.`);
  return exitCode;
}

export function workspace(): string {
  return cwd();
}

export function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export function isNonEmptyFile(path: string): boolean {
  try {
    const stat = statSync(path);

    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}
