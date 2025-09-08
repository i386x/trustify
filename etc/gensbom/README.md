# Generating SBOMs From Container Images Using Syft

Usage: `./gensbom.sh <list-of-images>`

where `<list-of-images>` is a file with images and their tags, one image per
line, e.g.:
```
quay.io/keycloak/keycloak
quay.io/keycloak/keycloak:26.3.4
quay.io/keycloak/keycloak:26.2
```

The script will try to generate SBOM file in CycloneDX JSON format for every
given image, ingest the SBOM file to TPA, and make an archive named `sboms.zip`
with all SBOMS generated.

The script creates `.gensbom` working directory in the same directory as the
script where all SBOMs and archives can be found for every run. The layout of
this directory is:
```
.gensbom/
    run-YYYYmmdd-HHMMDD-XXXXX/
        sboms/
            <generated sbom #1>.json
            <generated sbom #2>.json
            ...
        sboms.zip
    ...
```
`YYYYmmdd-HHMMDD` is a time stamp recording the year, month, day, hour, minute
and second of the run, `XXXXX` is a random suffix.
