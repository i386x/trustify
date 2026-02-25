# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

This tool generates SBOMs (Software Bill of Materials) from container images using Syft and ingests them into a TPA (Trusted Profile Analyzer) service. It can run as either a standalone script or a containerized application.

## Usage

### Using the Bash Script

```bash
./gensbom.sh images.txt
```

### Using the TypeScript Script

First, install dependencies:
```bash
npm install
```

Build the TypeScript code:
```bash
npm run build
```

Run the compiled script:
```bash
node index.js images.txt
```

Or run directly with tsx (development):
```bash
npm run dev images.txt
```

### Using the Container

Build the container:
```bash
podman build -t gensbom -f Containerfile .
```

Run the container:
```bash
podman run --rm -v "${PWD}":/gensbom:Z -e 'TPA_*' gensbom:latest images.txt
```

The input file should contain one container image per line (see `example-images.txt`).

## Environment Variables

**Required:**
- `TPA_SERVICE_URL` - URL to the running TPA service (e.g., `my.tpa.instance.abc:8765`)

**Optional:**
- `TPA_AUTH_TOKEN` - Authorization token for TPA (e.g., `Bearer XXXXXXXXXX`)
- `NO_COLOR` - Set to disable colored output (automatically set for non-TTY environments)

## Authentication Files

These files must be in the current working directory:

- **config.json** (required for private registries) - Docker-format container registry credentials. For Quay.io: Account Settings → Generate Encrypted Password → Docker Configuration
- **trust.crt** (optional) - Custom trust anchors if TPA uses certificates signed by custom CAs

## Container Build Arguments

When building the container, you can customize:
- `SYFT_REGISTRY` - Container registry for Syft (default: `ghcr.io/anchore`)
- `SYFT_IMAGE` - Syft image name (default: `syft`)
- `SYFT_TAG` - Syft version tag (default: `v1.36.0`)

Example:
```bash
podman build -t gensbom -f Containerfile --build-arg SYFT_TAG=v1.37.0 .
```

## Output

After running, the tool produces:
- `sboms/` directory with individual SBOM JSON files
- `sboms.zip` archive containing all generated SBOMs

Each SBOM is generated in CycloneDX 1.6 format and automatically uploaded to the TPA service.

## Script Behavior

Both `gensbom.sh` and `index.ts` implement the same functionality:
1. Validates environment variables and required files
2. Pings the TPA service to verify connectivity and auth
3. For each image in the input file:
   - Generates an SBOM using Syft
   - Uploads the SBOM to TPA via POST to `/api/v2/sbom`
   - Continues on errors (failed images won't stop processing)
4. Creates a ZIP archive of all successfully generated SBOMs
5. Removes empty/corrupted SBOM files from the archive

The scripts are designed to be run both natively (with Syft installed) and within a container environment.
