import { argv, env } from "node:process";
import { createReadStream, mkdirSync, rmSync } from "node:fs";
import { isNonEmptyFile, warning, workspace } from "./utils.js";
import { Config } from "./config.js";
import { TPAService } from "./tpa.js";
import { createInterface } from "node:readline";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { usage } from "./usage.js";

const SBOM_ID_WIDTH = 10;
const SYFT_CMD = "syft";
const SBOMS_DIR_NAME = "sboms";
const SBOMS_ARCHIVE_NAME = `${SBOMS_DIR_NAME}.zip`;

function validateImage(image: string): string | null {
  const result = image.trim();

  if (!/^[0-9a-zA-Z.:/_-]+$/u.test(result)) {
    warning(
      `Image URI ${JSON.stringify(result)} contains invalid characters. Only\n`
        + "alphanumeric characters, underscore (_), dot (.), colon (:),\n"
        + "hyphen (-), and slash (/) are allowed.",
    );
    return null;
  }
  return result;
}

function execSyft(image: string, sbom: string, shell: string): boolean {
  try {
    execSync(`${SYFT_CMD} -v scan ${image} -o cyclonedx-json=${sbom}`, {
      stdio: "inherit",
      shell,
    });
  } catch {
    return false;
  }
  return true;
}

class SbomGenerator {
  private shell: string;
  private tpaService: TPAService;
  private prepared: boolean;
  private imageCount: number;
  private sbomsDir: string;

  constructor(config: Config) {
    this.shell = config.shell;
    this.tpaService = new TPAService(config);
    this.prepared = false;
    this.imageCount = 0;
    this.sbomsDir = join(workspace(), SBOMS_DIR_NAME);
  }

  prepare(): void {
    if (this.prepared) return;

    rmSync(this.sbomsDir, { force: true, recursive: true });
    rmSync(join(workspace(), SBOMS_ARCHIVE_NAME), { force: true });
    mkdirSync(this.sbomsDir, { recursive: true });

    this.imageCount = 0;
    this.prepared = true;
  }

  sbomFileFromImageURI(image: string): string {
    const paddedId = this.imageCount.toString().padStart(SBOM_ID_WIDTH, "0");
    const sanitizedImage = image.replace(":", "-").replace("/", "-");
    const fileName = `sbom${paddedId}-${sanitizedImage}.json`;

    this.imageCount += 1;
    return join(this.sbomsDir, fileName);
  }

  runSyft(image: string): string | null {
    const validatedImage = validateImage(image);

    if (validatedImage === null) return null;

    this.prepare();

    const sbomFile = this.sbomFileFromImageURI(validatedImage);

    if (
      !execSyft(validatedImage, sbomFile, this.shell)
      || !isNonEmptyFile(sbomFile)
    ) {
      /* Remove possibly corrupted SBOM file so it will not be included in the
         final archive */
      warning(`File \`${sbomFile}\` was not created.`);
      rmSync(sbomFile, { force: true });
      return null;
    }

    return sbomFile;
  }

  async generate(inputFile: string): Promise<void> {
    const rl = createInterface({
      input: createReadStream(inputFile),
      crlfDelay: Infinity,
    });

    this.prepared = false;

    await this.tpaService.ping();

    for await (const image of rl)
      await this.tpaService.ingest(this.runSyft(image));
  }
}

export async function main(): Promise<number> {
  if (typeof argv[2] !== "string") {
    usage();
    return 1;
  }

  const config = new Config(env);

  config.validate();

  const generator = new SbomGenerator(config);

  await generator.generate(argv[2]);
  return 0;
}
