# Sable

A Matrix client built to enhance the user experience with quality-of-life features, cosmetics, utilites, and sheer usability. See the [changelog](https://github.com/7w1/sable/blob/dev/CHANGELOG.md).

Join our matrix space [here](https://matrix.to/#/#sable:sable.moe) to discuss features, issues, or meowing.

Forked from [Cinny](https://github.com/cinnyapp/cinny/).

## Getting started
The web app is available at [app.sable.moe](https://app.sable.moe/) and gets updated on frequently, as soon as a feature is deemed stable.

You can also download our desktop app for windows and linux from [releases](https://github.com/7w1/sable/releases/latest).

## Self-hosting
You can either run the prebuilt container image or build Sable yourself.

### Docker

Prebuilt images are published to `ghcr.io/7w1/sable`.

- `latest` tracks the current `dev` branch image.
- `X.Y.Z` tags are versioned releases.
- `X.Y` tags float within a release line.
- Pushes to `dev` also publish a short commit SHA tag.

Run the latest image with:

```sh
docker run --rm -p 8080:80 ghcr.io/7w1/sable:latest
```

Then open `http://localhost:8080`.

If you want to override the bundled [`config.json`](config.json), mount your own
file at `/app/config.json`:

```yaml
services:
  sable:
    image: ghcr.io/7w1/sable:latest
    ports:
      - '8080:80'
    volumes:
      - ./config.json:/app/config.json:ro
```

### Build it yourself

To build and serve Sable yourself with nginx, clone this repo and build it:

```sh
npm ci # Installs all dependencies
npm run build # Compiles the app into the dist/ directory
```

After that, you can copy the dist/ directory to your server and serve it.

* The default homeservers and explore pages are defined in [`config.json`](config.json).

* You can also disable the account switcher in the config.json.

* To deploy on subdirectory, you need to rebuild the app youself after updating the `base` path in [`build.config.ts`](build.config.ts).
    * For example, if you want to deploy on `https://sable.moe/app`, then set `base: '/app'`.

## Local development
> [!TIP]
> We recommend using a version manager as versions change quickly. [fnm](https://github.com/Schniz/fnm) is a great cross-platform option (Windows, macOS, and Linux). [NVM on Windows](https://github.com/coreybutler/nvm-windows#installation--upgrades) and [nvm](https://github.com/nvm-sh/nvm) on Linux/macOS are also good choices. Use the version defined in [`.node-version`](.node-version).

Execute the following commands to start a development server:
```sh
npm ci # Installs all dependencies
npm start # Serve a development version
```

To build the app:
```sh
npm run build # Compiles the app into the dist/ directory
```
