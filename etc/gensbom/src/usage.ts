import { HelpFormatter } from "./format.js";

const USAGE = (new HelpFormatter())
  .usage("%prog <FILE>")
  .par("or as the container:")
  .codeblock(
    "# Read a list of images from the <FILE>",
    [
      "podman run",
      "--rm",
      `-v "\${PWD}":/gensbom:Z`,
      "-e 'TPA_*'",
      "gensbom:latest <FILE>",
    ],
  )
  .par(
    "In the current working directory:",
    "",
    "  1. Read the list of images (one image per line) from <FILE>.",
    "  2. For every image from the list:",
    "       * generate an SBOM in CycloneDX 1.6 format using Syft",
    "       * ingest the SBOM to the Trusted Profile Analyzer (TPA)",
    "  3. The `sboms` directory and the `sboms.zip` archive contain the",
    "     generated SBOMs.",
  )
  .warning(
    "The `sboms` directory and the `sboms.zip` archive from the",
    "previous run will be removed!",
  )
  .section("Authentication")
  .term(
    "config.json",
    "File with the valid container registry credentials following the",
    "Docker format. This file must be in the current working directory",
  )
  .term(
    "trust.crt",
    "Optional custom trust anchors, needed to be installed on the container",
    "to make the TPA instance accessible from it, in case the TPA instance",
    "uses a certificate signed by these trust anchors",
  )
  .term("TPA_AUTH_TOKEN", "Authorization token for TPA")
  .section("Environment variables")
  .term("TPA_SERVICE_URL", "URL with running TPA instance")
  .term(
    "TPA_AUTH_TOKEN",
    "Valid authorization token for TPA. Required if the TPA instance",
    "requires authorization",
  )
  .section("See also")
  .term(
    "`config.json` format",
    "https://github.com/google/go-containerregistry/tree/main/pkg/authn#docker-config-auth",
    "https://github.com/anchore/syft/wiki/private-registry-authentication",
  );

export function usage(): void {
  console.log(USAGE.format({}));
}
