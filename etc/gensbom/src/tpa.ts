import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from "axios";
import { inform, stringify, warning, werror } from "./utils.js";
import { Agent } from "node:https";
import { Config } from "./config.js";
import { readFileSync } from "node:fs";
import { styleText } from "node:util";

const TIMEOUT = 300000;

function textifyResponse(response: AxiosResponse, indent = "| "): string {
  // Make strict eslint happy
  const status = response.status.toFixed(0);
  let result = `${indent}Status: ${status} ${response.statusText}`;

  if (
    response.data
    && response.headers["Content-Type"] === "application/json"
  ) {
    result += `\n${indent}Data:\n`;
    result += stringify(
      response.data as object,
      indent + indent.replace("|", " "),
    );
  }

  return result;
}

function printError(err: unknown, indent = "| "): void {
  if (err instanceof AxiosError && err.response)
    werror(textifyResponse(err.response, indent));
  else if (err instanceof Error) werror(`${indent}{Error: ${err.message}`);
  else werror(`${indent}Unknown error`);
}

export class TPAService {
  baseUrl: string;
  service: AxiosInstance | null;

  constructor(config: Config) {
    this.baseUrl = config.tpaServiceUrl;

    const cfg: AxiosRequestConfig = {
      baseURL: this.baseUrl,
      timeout: TIMEOUT,
    };

    if (config.tpaAuthToken !== "")
      cfg.headers = { Authorization: `Bearer ${config.tpaAuthToken}` };
    if (config.trustCert !== "")
      cfg.httpsAgent = new Agent({ ca: readFileSync(config.trustCert) });

    if (config.tpaServiceUrl !== "") {
      const service = axios.create(cfg);

      service.interceptors.response.use(
        (response) => {
          console.log(styleText("blue", textifyResponse(response)));
          return response;
        },
        async (err) => {
          printError(err);
          if (err instanceof Error) return Promise.reject(err);
          return Promise.reject(new Error("Unknown error"));
        },
      );
      this.service = service;
    } else this.service = null;
  }

  async ping(): Promise<void> {
    if (this.service === null) return;
    try {
      inform(`Pinging ${this.baseUrl} ...`);
      await this.service.get("/api/v2/sbom?limit=1");
    } catch {
      /* Ignore all errors here, problems are printed to the standard error
         output via response interceptors */
    }
  }

  async ingest(sbom: string | null): Promise<void> {
    if (this.service === null || sbom === null) return;
    try {
      inform(`Ingesting ${sbom} ...`);
      await this.service.post("/api/v2/sbom", readFileSync(sbom, "utf-8"), {
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      warning(`Failed to ingest \`${sbom}\`.`);
    }
  }
}
