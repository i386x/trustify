# Generating SBOMs From Container Images Using Syft

Prerequisites:

* `awk`
* Bash
* [`httpie`](https://httpie.io/cli)
* `podman`
* `sha512sum`
* [`syft`](https://github.com/anchore/syft/releases)
* `zip`

Usage: `./gensbom.sh <list-of-images>`

where `<list-of-images>` is a file with images and their tags, one image per
line, e.g.:

```
quay.io/keycloak/keycloak
quay.io/keycloak/keycloak:26.3.4
quay.io/keycloak/keycloak:26.2
```

The script will try to generate an SBOM file in CycloneDX 1.6 JSON format for
every given image, ingest the SBOM file to TPA, and make an archive named
`sboms.zip` containing all the generated SBOMs.

In the current working directory, the script creates the `.gensbom` directory,
where all the generated SBOMs and archives can be found for every run. The
layout of this directory is:

```
.gensbom/
    run-YYYYmmdd-HHMMSS-XXXXX/
        sboms/
            <generated sbom #1>.json
            <generated sbom #2>.json
            ...
        sboms.zip
    ...
```

`YYYYmmdd-HHMMSS` is a time stamp recording the year, month, day, hour, minute
and second of the run, `XXXXX` is a random suffix.

The script is expecting several services to be up and running. If you are
depending on a private instance of a container registry, you must provide
credentials to allow `syft` to pull from your private registry. To do this,
please proceed with the following steps:

1. If you have your `podman` installation configured to have access to your
   private repositories (which you probably have), just login to your private
   container registry account via `podman login` and once logged on, `syft`
   should be able to communicate with your private container registry at
   instant.
1. If you know username and password to your private container registry
   instance but your `podman` installation is not yet properly set up:

   1. Suppose your private container registry instance is hosted on quay.io. It
      is recommended (otherwise `podman` starts to complain) to use
      [credential helpers](https://github.com/google/go-containerregistry/tree/main/pkg/authn#credential-helpers)
      to provide your credentials to `podman`. To do that, first add this
      configuration snippet to your `${XDG_CONFIG_HOME}/containers/auth.json`:

      ```json
      {
          "credsStore": "pass",
          "credHelpers": {
              "quay.io": "pass"
          }
      }
      ```

   1. Now we need to setup a credential helper itself. A credential helper is a
      binary that must be reachable via `$PATH` and that must have a name in
      the format `docker-credential-{suffix}`, where the `{suffix}` is the
      value of an item stored under the `credHelpers` configuration. In our
      case, the `{suffix}` is `pass` since we have `"quay.io": "pass"` stored
      here from the previous step. Hence we need to install and setup
      `docker-credential-pass`:

      * Download a `docker-credential-pass` binary from
        [here](https://github.com/docker/docker-credential-helpers/releases)
        and copy it to `/usr/local/bin`. The name of the binary must be
        exactly `docker-credential-pass`.

      * Ensure `docker-credential-pass` can be executed:
        `sudo chmod a+x /usr/local/bin/docker-credential-pass`

      * Install the [`pass`](https://www.passwordstore.org/) utility. On
        Fedora-based systems, this can be done via `sudo dnf -y install pass`.

      * Create your GPG key if you have not a one yet:
        `gpg --full-generate-key`. After the command finish, note the key's uid
        that you can see on the `gpg` command's output on the line starting
        with `uid`, e.g.: `uid        myrealm (my comment) <my@email.dom>`.

      * Initialize `pass` with yours GPG key uid:
        `pass init "myrealm (my comment) <my@email.dom>"`

   1. Now you should be able to login to your Quay.io account without having
      your credentials stored as a plain text on the disk:

      ```
      $ podman login quay.io
      Username: my_quay_io_user_name
      Password:
      Login Succeeded!
      ```

      If you see something like this

      ```
      Error: 1 error occurred:
              * updating "/run/user/1000/containers/auth.json": error storing credentials - err: exit status 1, out: `exit status 1: gpg: Note: database_open 134217901 waiting for lock (held by 3978548) ...
      gpg: Note: database_open 134217901 waiting for lock (held by 3978548) ...
      gpg: Note: database_open 134217901 waiting for lock (held by 3978548) ...
      gpg: Note: database_open 134217901 waiting for lock (held by 3978548) ...
      gpg: Note: database_open 134217901 waiting for lock (held by 3978548) ...
      gpg: keydb_search failed: Connection timed out
      gpg: myrealm (my comment) <my@email.dom>: skipped: Connection timed out
      gpg: [stdin]: encryption failed: Connection timed out
      Password encryption aborted.`
      ```

      instead of `Login Succeeded!`, run `gpgconf --unlock pubring.db` and try
      `podman login` again.

Another service that must be up and running is the Trusted Profile Analyzer
(TPA). You need to set two environment variables providing the necessary
information needed to ingest generated SBOMs to the TPA service:

* `TPA_SERVICE_URL`, holding the URL to the existing TPA service, e.g.
  `my.tpa.instance.abc:8765`
* `TPA_AUTH_TOKEN`, holding the valid authorization token, e.g.
  `Bearer XXXXXXXXXX`

## Running the Script Using a Container

Since the script needs several dependencies to be fully functional, like
`httpie` and `syft`, it is distributed also as a container.

### Building the Container Image

To build the container image, just run:

```
podman build -t gensbom -f Containerfile .
```

This builds the rootless container image named `gensbom:latest` from the
`Containerfile` in the current directory.

You can pass `--build-arg ARG_NAME=VALUE` to `podman build` to customize the
image. Supported build arguments are:

* `SYFT_REGISTRY`, holding the container registry from which the `syft`
  container is pulled (default: `ghcr.io/anchore`)
* `SYFT_IMAGE`, holding the `syft` container image name (default: `syft`)
* `SYFT_TAG`, holding the `syft` container image tag (default: `latest`)
* `LOCAL_USER`, holding the name of the group and the user under which the
  script will be executed (default: `gensbom`)

Example of setting the custom user and group for running the script:

```
podman build --build-arg LOCAL_USER=jdoe -t gensbom -f Containerfile .
```

### Running the Container

Since the script interacts with file system by reading an input file and
generating output files, we need to share some portion of the host file system
with the container. Furthermore, as `syft` need to possibly access a private
container registry, we need to share several secrets with the container too.

Suppose the container name is `gensbom`. First, lets create a directory
somewhere, lets call it `gensbom-volume`, and `chdir` into it:

```
mkdir gensbom-volume
cd gensbom-volume
```

Inside `gensbom-volume` directory, create a file with a list of images you are
interested in, as mentioned at the very top of this guide. Let call this file
`images.lst`. You can also copy existing file from the other location.

If some of the images from `images.lst` is stored in a private container
registry, you also need to provide the credentials to `syft`. Unlike running
`syft` on the host where everything is usually set up, running `syft` inside a
container comes with difficulties when it come to accessing a private container
registry, especially when you are using a password manager or credential store
on the host to manage your secrets, which is usually a full stack of software
requiring access to exclusive resources like crypto devices and/or display
manager, which is impossible for a container to access without giving it a full
governance over the host. Therefore, we need to provide the credentials to the
`gensbom` container via the [old plain text](https://github.com/google/go-containerregistry/tree/main/pkg/authn#docker-config-auth)
way:

1. Assuming we are still in the `gensbom-volume` directory, lets create a
   directory with secrets:

   ```
   mkdir secrets
   ```

1. Create or copy a file containing encrypted username and password to your
   private container registry instance. This file **must be named** `config.json`,
   otherwise `syft` will complain with some hard-to-understand error message.
   The content of `config.json` should look like this:

   ```json
   {
       "auths": {
           "quay.io": {
               "auth": "<base64 encoded string composed from the username, the colon character (`:`), and the encrypted password>"
           }
       }
   }
   ```

   If your private container registry is hosted on Quay.io, you can go to your
   user profile (`Account Settings`), click on `Generate Encrypted Password`,
   select `Docker Configuration`, and then click `Download {your username}-auth.json`
   to get the secret. Then copy or move this file to the `secrets` directory:

   ```
   pushd secrets
   cp {path-to-the-downloaded-secret} config.json
   popd
   ```

> [!WARNING]
> Every time you generate encrypted password to your Quay.io account, do not
> forget to update also `config.json`.

Now when `gensbom-volume` is prepared, change its owner temporarily to grant a
rootless container user permissions to access it:

1. Find out UID and GID numbers of the rootless container user (this should be
   `1000` and `1000` in the most cases but lets check):

   ```
   podman run -ti --entrypoint id gensbom
   ```

1. Change the owner of `gensbom-volume` via `podman unshare`:

   ```
   podman unshare chown -R UID:GID .
   ```

> [!TIP]
> Run `podman unshare cat /proc/self/uid_map /proc/self/gid_map` to see UID and
> GID mappings. For example, the output of this command can be:
>
> ```
>         0       1000          1
>         1     100000      65536
>         0       1000          1
>         1     100000      65536
> ```
>
> In short, the first column is the start of IDs on the container, the second
> column is the start of IDs on the host to which the container user ID is
> mapped and the third column is the number of available IDs in that particular
> range.
>
> That is, if the container user has UID:GID `0`:`0` (the container user is
> `root`), then this maps to the user with UID:GID `1000`:`1000` on the host.
> If the container user has UID:GID `1000`:`1000`, then this maps to UID:GID
> `100999`:`100999` on the host.
>
> Long story short, after running `podman unshare chown -R 1000:1000 .` you can
> revert back with `podman unshare chown -R 0:0 .`.
>
> See [`podman unshare`](https://docs.podman.io/en/latest/markdown/podman-unshare.1.html)
> and [`user_namespaces`](https://man7.org/linux/man-pages/man7/user_namespaces.7.html)
> for greater detail.

Finally, lets run our container:

```
podman run \
    -ti \
    --network=host \
    -e DOCKER_CONFIG="/home/gensbom/secrets" \
    -e TPA_SERVICE_URL="${TPA_SERVICE_URL}/api/v2/sbom" \
    -e TPA_AUTH_TOKEN="${TPA_AUTH_TOKEN}" \
    -v "${PWD}:/home/gensbom:Z" \
    gensbom images.lst
```

If everything goes well, you should see an output similar to this:

```
 ✔ Parsed image                                            sha256:d707ada40013fdb40d67725c2f65c32e04eec5c231f8affd427f65b43779bc6c
 ✔ Cataloged contents                                             fea102138dcd99f51fcda55eeac8132de2b43ee348fc0971e7005ba4804c0c66
   ├── ✔ Packages                        [469 packages]
   ├── ✔ Executables                     [692 executables]
   ├── ✔ File metadata                   [8,667 locations]
   └── ✔ File digests                    [8,667 files]
HTTP/1.1 201 Created
access-control-allow-credentials: true
access-control-expose-headers: content-type
content-encoding: gzip
content-type: application/json
date: Wed, 24 Sep 2025 01:07:26 GMT
transfer-encoding: chunked
vary: Origin, Access-Control-Request-Method, Access-Control-Request-Headers
vary: accept-encoding

{
    "document_id": "urn:uuid:b33a84fc-17ce-4560-91d9-ed3011644348/1",
    "id": "urn:uuid:01997942-d0a6-7d12-a427-2564ad647939"
}


  adding: sbom0000000000-quay.io-foo_bar-gensbom-test-v0.1.json (deflated 75%)
```

And after reverting the owner of `gensbom-volume` directory back to you via
`podman unshare chown -R 0:0 .`, you can pick up your generated SBOMs from
`.gensbom` directory:

```
$ tree -a .gensbom/
.gensbom/
└── run-20250924-010705-OH7ty
    ├── sboms
    │   └── sbom0000000000-quay.io-foo_bar-gensbom-test-v0.1.json
    └── sboms.zip

3 directories, 2 files
```

## References

* [`containers/auth.json`](https://github.com/containers/image/blob/main/docs/containers-auth.json.5.md)
* [Credential Helpers](https://github.com/google/go-containerregistry/tree/main/pkg/authn#credential-helpers)
* [Docker Config Auth](https://github.com/google/go-containerregistry/tree/main/pkg/authn#docker-config-auth)
* [docker-credential-helpers](https://github.com/docker/docker-credential-helpers)
* [`docker login`](https://docs.docker.com/reference/cli/docker/login/)
* [`pass`](https://www.passwordstore.org/)
* [`podman login`](https://docs.podman.io/en/latest/markdown/podman-login.1.html)
* [`podman unshare`](https://docs.podman.io/en/latest/markdown/podman-unshare.1.html)
* [Syft](https://github.com/anchore/syft)
* [Syft: Private Registry Authentication](https://github.com/anchore/syft/wiki/private-registry-authentication)
* [`user_namespaces`](https://man7.org/linux/man-pages/man7/user_namespaces.7.html)
