# SolarEdge Signage Snapshots

This repository opens four SolarEdge public kiosk dashboards in Playwright,
captures 1920 × 1080 PNG screenshots, and publishes simple full-screen viewer
pages through GitHub Pages.

## Included dashboards

- Operations Depot
- Manning Community Centre
- South Perth Library
- Civic Centre

## How it works

1. GitHub Actions runs every 15 minutes.
2. Playwright opens each SolarEdge dashboard as a normal top-level webpage.
3. Each dashboard is captured as a PNG.
4. GitHub Pages publishes four separate viewer URLs.
5. Each viewer checks for a newer PNG every 60 seconds.
6. If any capture fails, the deployment does not occur, so the previously
   published working snapshots remain online.

## GitHub setup

1. Create a repository named `solaredge-signage`.
2. Upload all files from this project, including the hidden `.github` folder.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, select **GitHub Actions** as the source.
5. Open **Actions → Capture and publish SolarEdge dashboards**.
6. Select **Run workflow** and run it from the `main` branch.
7. After it succeeds, GitHub Pages will show the published site address.

Assuming the GitHub account or organisation is `example` and the repository is
`solaredge-signage`, the four SignageLive URLs will be:

- `https://example.github.io/solaredge-signage/operations-depot/`
- `https://example.github.io/solaredge-signage/manning-community-centre/`
- `https://example.github.io/solaredge-signage/south-perth-library/`
- `https://example.github.io/solaredge-signage/civic-centre/`

Replace `example` with the GitHub user or organisation name.

## SignageLive setup

Create one Web Page asset for each GitHub Pages URL. The viewer pages are
designed for 1920 × 1080 displays and automatically reload their image every
60 seconds.

## Changing the capture frequency

Edit:

`.github/workflows/capture-and-publish.yml`

The supplied schedule is:

```yaml
- cron: "7,22,37,52 * * * *"
```

That runs at 7, 22, 37 and 52 minutes past every hour.

## Important notes

- GitHub Pages serves the snapshots as public web content unless your GitHub
  organisation has a plan and configuration that supports restricted Pages.
- The original SolarEdge kiosk GUIDs are already public, but the screenshots
  may still show operational information.
- Public-repository scheduled workflows can be disabled by GitHub after a long
  period without repository activity. A private repository on an appropriate
  GitHub plan avoids that particular public-repository inactivity rule.
- GitHub scheduled jobs can occasionally start late. This is why the schedule
  avoids minute 0 at the start of each hour.
