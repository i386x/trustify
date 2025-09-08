#!/bin/bash

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

WORKSPACE=${WORKSPACE:-${HERE}/.gensbom}
HTTP_COMMAND=${HTTP_COMMAND:-http}
SYFT_COMMAND=${SYFT_COMMAND:-syft}
SBOM_ENDPOINT=${SBOM_ENDPOINT:-localhost:8080/api/v2/sbom}

function error() {
    echo "$0: $*" >&2
}

mkdir -p ${WORKSPACE}

if [[ -z "${1:-}" ]]; then
    error "Missing file with the list of images"
    exit 1
fi

if [[ ! -f "$1" ]]; then
    error "\`$1\` is not a file"
    exit 1
fi

_RUN="$(mktemp -d "${WORKSPACE}/run-$(date '+%Y%m%d-%H%M%S')-XXXXX")"
_SBOMS_DIR="${_RUN}/sboms"

mkdir -p "${_SBOMS_DIR}"

for _IMAGE in $(cat $1); do
    if [[ -z "${_IMAGE}" ]]; then
        continue
    fi

    _SBOM="${_SBOMS_DIR}/$(echo "${_IMAGE}" | tr '/:' '--').json"

    if ! ${SYFT_COMMAND} -q scan "${_IMAGE}" -o "cyclonedx-json=${_SBOM}"; then
        continue
    fi

    if [[ ! -s "${_SBOM}" ]]; then
        error "File \`${_SBOM}\` was not created"
        continue
    fi

    if ! cat "${_SBOM}" | ${HTTP_COMMAND} POST ${SBOM_ENDPOINT}; then
        error "Failed to ingest \`${_SBOM}\`"
    fi
done

pushd "${_SBOMS_DIR}" >/dev/null

_SBOMS_ARCHIVE="sboms.zip"

if [[ -n "$(find -name '*.json' -type f -print)" ]]; then
    rm -f "${_SBOMS_ARCHIVE}"
    find -name '*.json' -type f -print | zip "${_SBOMS_ARCHIVE}" -@
    mv "${_SBOMS_ARCHIVE}" "../${_SBOMS_ARCHIVE}"
fi

popd >/dev/null
