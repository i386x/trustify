import { FatalError, isFile, warning, workspace } from "./utils.js";
import { Buffer } from "node:buffer";
import { join } from "node:path";
import { readFileSync } from "node:fs";

const DOCKER_CONFIG = "config.json";
const TRUST_CERT = "trust.crt";

interface ProcessEnv {
  SHELL?: string;
  TPA_SERVICE_URL?: string;
  TPA_AUTH_TOKEN?: string;
}

interface Auth {
  auth?: string;
  email?: string;
}

interface DockerConfigAuths {
  "quay.io"?: Auth;
  [anotherAuth: string]: Auth;
}

interface DockerConfig {
  auths?: DockerConfigAuths;
}

class ConfigError extends Error {
  constructor(cfgfile: string, message: string) {
    super(`${cfgfile}: ${message}`);
  }
}

class InsecureConfigError extends FatalError {
  constructor(cfgfile: string, message: string) {
    super(
      `Docker config file \`${cfgfile}\` does not pass security validations\n`
        + "and therefore the operation must be terminated.\n"
        + `Reason: ${message}`,
    );
  }
}

class UnsupportedOCIRegistryError extends InsecureConfigError {
  constructor(cfgfile: string, registry: string) {
    super(
      cfgfile,
      `OCI registry \`${registry}\` is not supported - credentials for\n`
        + `\`${registry}\` cannot be validated`,
    );
  }
}

function validateQuayIO(cfgfile: string, auth: Auth): void {
  if (!auth.auth)
    throw new ConfigError(cfgfile, "Missing or empty `quay.io` credentials");

  let token = auth.auth;
  if (!token.includes(":"))
    token = Buffer.from(token, "base64").toString("ascii");
  // Accept only robot accounts tokens
  if (!/^[a-z][0-9a-z_]*\+[a-z][0-9a-z_]*:[0-9A-Za-z]+$/u.test(token)) {
    throw new InsecureConfigError(
      cfgfile,
      "Detected `quay.io` credentials that are not for robot account. For\n"
        + "the security reasons, please create a robot account on `quay.io`\n"
        + "and use these to access the OCI registry. It is recommended to\n"
        + "set the robot account to have only read-only access",
    );
  }
}

export class Config {
  shell: string;
  tpaServiceUrl: string;
  dockerConfig: string;
  tpaAuthToken: string;
  trustCert: string;

  constructor(environ: ProcessEnv) {
    this.shell = environ.SHELL ?? "/bin/sh";
    this.tpaServiceUrl = environ.TPA_SERVICE_URL ?? "";
    this.dockerConfig = join(workspace(), DOCKER_CONFIG);
    this.tpaAuthToken = environ.TPA_AUTH_TOKEN ?? "";
    this.trustCert = join(workspace(), TRUST_CERT);
  }

  validate(): void {
    this.checkTpaServiceUrl();
    this.validateDockerConfig();
    this.checkTpaAuthToken();
    this.checkTrustCert();
  }

  checkTpaServiceUrl(): void {
    if (this.tpaServiceUrl.length === 0) {
      warning(
        "TPA_SERVICE_URL environment variable is not set or it is empty.",
        "Generated SBOMs will not be uploaded.",
      );
    }
  }

  validateDockerConfig(): void {
    try {
      const config = JSON.parse(
        readFileSync(this.dockerConfig, "utf8"),
      ) as DockerConfig;
      if (!config.auths) {
        throw new ConfigError(
          this.dockerConfig,
          "Missing or empty `auths` property",
        );
      }
      Object.keys(config.auths).forEach((registry) => {
        switch (registry) {
          case "quay.io":
            validateQuayIO(this.dockerConfig, config.auths?.[registry] ?? {});
            break;
          default:
            throw new UnsupportedOCIRegistryError(this.dockerConfig, registry);
        }
      });
    } catch (err: unknown) {
      if (err instanceof FatalError) throw err;

      const detail = err instanceof Error ? err.message : "Unknown error";
      warning(
        `Docker configuration with credentials (\`${this.dockerConfig}\`) is\n`
          + "not present or cannot be opened for reading or it is corrupted.\n"
          + "Syft will not be able to access private container registries.\n"
          + `Error detail: ${detail}.`,
      );
      this.dockerConfig = "";
    }
  }

  checkTpaAuthToken(): void {
    if (this.tpaAuthToken.length === 0) {
      const service = this.tpaServiceUrl || "the TPA service";
      warning(
        "TPA_AUTH_TOKEN environment variable is not set or it is empty.",
        `Authorized communication with ${service} will not be possible.`,
      );
    }
  }

  checkTrustCert(): void {
    if (!isFile(this.trustCert)) this.trustCert = "";
  }
}
