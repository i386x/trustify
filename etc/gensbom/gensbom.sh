#!/bin/bash

set -euo pipefail

WORKSPACE="${PWD}/.gensbom"
HTTP_COMMAND="http"
SYFT_COMMAND="syft"

function inform() {
    echo "$0: $*"
}

function error() {
    echo "$0: $*" >&2
}

if [[ -z "${TPA_SERVICE_URL:-}" ]]; then
    error "TPA_SERVICE_URL environment variable is not set or it is empty"
    exit 1
fi

mkdir -p "${WORKSPACE}"

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

_SBOM_COUNTER=0

while IFS="" read -r _IMAGE || [[ -n "${_IMAGE}" ]]; do
    if [[ -z "${_IMAGE}" ]]; then
        continue
    fi

    _SBOM="${_SBOMS_DIR}/$(printf 'sbom%010d' "${_SBOM_COUNTER}")-$(echo "${_IMAGE}" | tr '/:' '--').json"
    _SBOM_COUNTER=$(( _SBOM_COUNTER + 1 ))

    if ! "${SYFT_COMMAND}" scan "${_IMAGE}" -o "cyclonedx-json=${_SBOM}"; then
        continue
    fi

    if [[ ! -s "${_SBOM}" ]]; then
        error "File \`${_SBOM}\` was not created"
        # Remove empty file so it will not be included in the final archive
        rm -f "${_SBOM}"
        continue
    fi

    if "${HTTP_COMMAND}" \
        --check-status \
        --ignore-stdin \
        GET \
        "${TPA_SERVICE_URL}/api/v2/sbom/sha512:$(sha512sum "${_SBOM}" | awk '{print $1}')/download" \
        "Authorization:${TPA_AUTH_TOKEN:-Bearer XXX-INVALID-XXX}" \
        2>&1 >/dev/null; \
    then
        # Do not ingest already ingested SBOM
        inform "File \`${_SBOM}\` is already ingested"
        continue
    fi

    if ! "${HTTP_COMMAND}" \
        --check-status \
        --ignore-stdin \
        POST \
        "${TPA_SERVICE_URL}/api/v2/sbom" \
        "Authorization:${TPA_AUTH_TOKEN:-Bearer XXX-INVALID-XXX}" \
        "Content-Type:application/json" \
        "@${_SBOM}"; \
    then
        error "Failed to ingest \`${_SBOM}\`"
    fi
done < "$1"

pushd "${_SBOMS_DIR}" >/dev/null

_SBOMS_ARCHIVE="sboms.zip"

if find -name '*.json' -type f | grep -q .; then
    rm -f "${_SBOMS_ARCHIVE}"
    find -name '*.json' -type f -print | zip "${_SBOMS_ARCHIVE}" -@
    mv "${_SBOMS_ARCHIVE}" "../${_SBOMS_ARCHIVE}"
fi

popd >/dev/null
