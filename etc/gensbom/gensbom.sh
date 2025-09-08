#!/bin/bash

set -euo pipefail

HTTP_COMMAND=${HTTP_COMMAND:-http}
SYFT_COMMAND=${SYFT_COMMAND:-syft}
SBOM_ENDPOINT=${SBOM_ENDPOINT:-localhost:8080/api/v2/sbom}

if [[ -z "${1:-}" ]]; then
    echo "$0: Missing file with the list of images" >&2
    exit 1
fi

for _image in $(cat $1); do
    ${SYFT_COMMAND} -q scan ${_image} -o cyclonedx-json | ${HTTP_COMMAND} POST ${SBOM_ENDPOINT}
done
