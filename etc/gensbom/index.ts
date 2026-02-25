#!/usr/bin/env node

// Converted from `./gensbom.sh` by Claude Code

import { readFileSync, existsSync, mkdirSync, rmSync, statSync, readdirSync } from 'fs';
import { join } from 'path';
import { execSync, spawn } from 'child_process';
import { createInterface } from 'readline';
import { createReadStream, createWriteStream } from 'fs';
import axios, { AxiosError } from 'axios';
import https from 'https';
import archiver from 'archiver';

const WORKSPACE = process.cwd();
const SYFT_COMMAND = 'syft';

interface ColorScheme {
  BOLD: string;
  RED: string;
  BROWN: string;
  VIOLET: string;
  AZURE: string;
  YELLOW: string;
  RESET: string;
  Q1: string;
  Q0: string;
}

function initColors(): ColorScheme {
  const isTTY = process.stdin.isTTY && process.stdout.isTTY && process.stderr.isTTY;

  if (!isTTY) {
    process.env.NO_COLOR = '1';
  }

  const noColor = process.env.NO_COLOR || '0';
  const disableColors = /^(n|no|0|f|false)$/.test(noColor);

  if (disableColors) {
    return {
      BOLD: '\x1b[1m',
      RED: '\x1b[31m',
      BROWN: '\x1b[33m',
      VIOLET: '\x1b[35m',
      AZURE: '\x1b[36m',
      YELLOW: '\x1b[93m',
      RESET: '\x1b[0m',
      Q1: '\x1b[35m',
      Q0: '\x1b[0m',
    };
  } else {
    return {
      BOLD: '',
      RED: '',
      BROWN: '',
      VIOLET: '',
      AZURE: '',
      YELLOW: '',
      RESET: '',
      Q1: '`',
      Q0: '`',
    };
  }
}

const colors = initColors();

function inform(message: string): void {
  console.log(`${process.argv[1]}: ${message}`);
}

function warning(message: string): void {
  console.error(`${colors.YELLOW}WARNING[${process.argv[1]}]: ${message}${colors.RESET}`);
}

function error(message: string): never {
  console.error(`${colors.RED}ERROR[${process.argv[1]}]: ${message}${colors.RESET}`);
  process.exit(1);
}

function usage(): void {
  console.log(`Usage: ${colors.AZURE}${process.argv[1]} <FILE>${colors.RESET}

or as the container:

  ${colors.BROWN}# Read a list of images from the <FILE>${colors.RESET}
  ${colors.AZURE}podman run --rm -v "\${PWD}":/gensbom:Z -e 'TPA_*' gensbom:latest <FILE>${colors.RESET}

In the current working directory:

  1. Read the list of images (one image per line) from ${colors.VIOLET}<FILE>${colors.RESET}.
  2. For every image from the list:
       * generate an SBOM in CycloneDX 1.6 format using Syft
       * ingest the SBOM to the Trusted Profile Analyzer (TPA)
  3. The ${colors.Q1}sboms${colors.Q0} directory and the ${colors.Q1}sboms.zip${colors.Q0} archive contain the
     generated SBOMs.

${colors.YELLOW}WARNING:${colors.RESET} The ${colors.Q1}sboms${colors.Q0} directory and the ${colors.Q1}sboms.zip${colors.Q0} archive from the
         previous run will be removed!

${colors.BOLD}Authentication${colors.RESET}

  ${colors.VIOLET}config.json${colors.RESET}
    A file with the valid container registry credentials following the
    Docker format. This file must be in the current working directory

  ${colors.VIOLET}trust.crt${colors.RESET}
    Optional custom trust anchors, needed to be installed on the container
    to make the TPA instance accessible from it, in case the TPA instance
    uses a certificate signed by these trust anchors

  ${colors.VIOLET}TPA_AUTH_TOKEN${colors.RESET}
    Authorization token for TPA

${colors.BOLD}Environment variables${colors.RESET}

  ${colors.VIOLET}TPA_SERVICE_URL${colors.RESET}
    URL with running TPA instance

  ${colors.VIOLET}TPA_AUTH_TOKEN${colors.RESET}
    Valid authorization token for TPA. Required if the TPA instance
    requires authorization

${colors.BOLD}See also${colors.RESET}

  ${colors.VIOLET}config.json${colors.RESET} format
    https://github.com/google/go-containerregistry/tree/main/pkg/authn#docker-config-auth
    https://github.com/anchore/syft/wiki/private-registry-authentication
`);
}

async function processImages(inputFile: string): Promise<void> {
  const TPA_SERVICE_URL = process.env.TPA_SERVICE_URL;
  const TPA_AUTH_TOKEN = process.env.TPA_AUTH_TOKEN;

  if (!TPA_SERVICE_URL) {
    error('TPA_SERVICE_URL environment variable is not set or it is empty');
  }

  const dockerConfig = join(WORKSPACE, 'config.json');
  if (!existsSync(dockerConfig)) {
    warning(`Docker configuration with credentials (\`${dockerConfig}\`) not present`);
    warning('Syft will not be able to access private container registries');
  } else {
    process.env.DOCKER_CONFIG = WORKSPACE;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (!TPA_AUTH_TOKEN) {
    warning('TPA_AUTH_TOKEN environment variable is not set or it is empty');
    warning(`Authorized communication with ${TPA_SERVICE_URL} will not be possible`);
  } else {
    headers['Authorization'] = TPA_AUTH_TOKEN;
  }

  const trustCert = join(WORKSPACE, 'trust.crt');
  const httpsAgent = existsSync(trustCert)
    ? new https.Agent({
        ca: readFileSync(trustCert),
      })
    : undefined;

  const sbomsDir = join(WORKSPACE, 'sboms');
  const sbomsArchive = 'sboms.zip';

  rmSync(sbomsDir, { recursive: true, force: true });
  rmSync(join(WORKSPACE, sbomsArchive), { force: true });
  mkdirSync(sbomsDir, { recursive: true });

  let sbomCounter = 0;

  // Service ping: verify connectivity and auth
  try {
    await axios.get(`${TPA_SERVICE_URL}/api/v2/sbom?limit=1`, {
      headers,
      httpsAgent,
      validateStatus: () => true,
    });
  } catch (err) {
    // Continue even if ping fails
  }

  const fileStream = createReadStream(inputFile);
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const image = line.trim();
    if (!image) {
      continue;
    }

    const sbomFilename = `sbom${sbomCounter.toString().padStart(10, '0')}-${image.replace(/[/:]/g, '--')}.json`;
    const sbomPath = join(sbomsDir, sbomFilename);
    sbomCounter++;

    try {
      execSync(`"${SYFT_COMMAND}" -v scan "${image}" -o "cyclonedx-json=${sbomPath}"`, {
        stdio: 'inherit',
        shell: true,
      });
    } catch (err) {
      rmSync(sbomPath, { force: true });
      continue;
    }

    if (!existsSync(sbomPath) || statSync(sbomPath).size === 0) {
      warning(`File \`${sbomPath}\` was not created`);
      rmSync(sbomPath, { force: true });
      continue;
    }

    try {
      const sbomData = readFileSync(sbomPath, 'utf8');
      await axios.post(`${TPA_SERVICE_URL}/api/v2/sbom`, sbomData, {
        headers,
        httpsAgent,
      });
      console.log('\n\n');
    } catch (err) {
      warning(`Failed to ingest \`${sbomPath}\``);
    }
  }

  // Create ZIP archive
  const jsonFiles = readdirSync(sbomsDir).filter(f => f.endsWith('.json'));

  if (jsonFiles.length > 0) {
    await createZipArchive(sbomsDir, join(WORKSPACE, sbomsArchive));
  }
}

async function createZipArchive(sourceDir: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = archiver('zip', {
      zlib: { level: 9 },
    });

    output.on('close', () => {
      resolve();
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);

    const files = readdirSync(sourceDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      archive.file(join(sourceDir, file), { name: file });
    }

    archive.finalize();
  });
}

// Main execution
const inputFile = process.argv[2];

if (!inputFile) {
  usage();
  process.exit(0);
}

if (!existsSync(inputFile) || !statSync(inputFile).isFile()) {
  error(`\`${inputFile}\` is not a file`);
}

processImages(inputFile).catch(err => {
  console.error(err);
  process.exit(1);
});
