import { chromium } from "playwright";
import {
  mkdir,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import path from "node:path";

const OUTPUT_DIRECTORY = path.resolve("public");
const IMAGE_DIRECTORY = path.join(OUTPUT_DIRECTORY, "images");

const VIEWPORT = {
  width: 1920,
  height: 1080
};

const SITES = [
  {
    name: "Operations Depot",
    slug: "operations-depot",
    guid: "06e982c3-b461-4902-8c9c-368e613fdb86"
  },
  {
    name: "Manning Community Centre",
    slug: "manning-community-centre",
    guid: "99317847-fe63-4ce5-a7c1-7e96861fd566"
  },
  {
    name: "South Perth Library",
    slug: "south-perth-library",
    guid: "12c58672-9bae-41e8-87c-5899f681d949"
  },
  {
    name: "Civic Centre",
    slug: "civic-centre",
    guid: "1c79b0e1-139c-46fc-ae33-bb3a2cd143f3"
  }
];

const ERROR_TEXT = [
  "ERR_BLOCKED_BY_RESPONSE",
  "Webpage not available",
  "This site can’t be reached",
  "This site can't be reached",
  "403 Forbidden",
  "Access Denied",
  "Service Unavailable"
];

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function solarEdgeUrl(guid) {
  return `https://monitoring.solaredge.com/mfe/flutter/kiosk/index.html?guid=${encodeURIComponent(guid)}`;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function viewerHtml(site) {
  const siteName = escapeHtml(site.name);
  const imagePath = `../images/${site.slug}.png`;

  return `<!doctype html>
<html lang="en-AU">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <meta http-equiv="refresh" content="3600">
  <title>${siteName} SolarEdge Dashboard</title>
  <style>
    html,
    body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: #000;
      cursor: none;
    }

    #dashboard {
      display: block;
      width: 100vw;
      height: 100vh;
      object-fit: contain;
      background: #000;
    }

    #status {
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      color: #fff;
      background: #000;
      font: 28px Arial, sans-serif;
    }
  </style>
</head>
<body>
  <div id="status">Loading ${siteName}…</div>
  <img id="dashboard" alt="${siteName} SolarEdge dashboard snapshot">

  <script>
    const dashboard = document.getElementById("dashboard");
    const status = document.getElementById("status");
    const baseImageUrl = ${JSON.stringify(imagePath)};

    function refreshImage() {
      const nextImage = new Image();

      nextImage.onload = () => {
        dashboard.src = nextImage.src;
        status.style.display = "none";
      };

      nextImage.onerror = () => {
        // Keep the previous successful image visible.
        if (!dashboard.src) {
          status.textContent = "Snapshot temporarily unavailable";
          status.style.display = "grid";
        }
      };

      nextImage.src = baseImageUrl + "?v=" + Date.now();
    }

    refreshImage();
    setInterval(refreshImage, 60 * 1000);
  </script>
</body>
</html>
`;
}

function landingPageHtml() {
  const links = SITES.map(
    (site) =>
      `<li><a href="./${site.slug}/">${escapeHtml(site.name)}</a></li>`
  ).join("\n");

  return `<!doctype html>
<html lang="en-AU">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SolarEdge Signage Snapshots</title>
  <style>
    body {
      max-width: 760px;
      margin: 60px auto;
      padding: 0 24px;
      font: 18px/1.5 Arial, sans-serif;
      color: #202124;
    }

    h1 {
      margin-bottom: 8px;
    }

    li {
      margin: 12px 0;
    }

    a {
      color: #065fd4;
    }
  </style>
</head>
<body>
  <h1>SolarEdge Signage Snapshots</h1>
  <p>Select a dashboard:</p>
  <ul>
    ${links}
  </ul>
</body>
</html>
`;
}

async function prepareOutputDirectory() {
  await rm(OUTPUT_DIRECTORY, {
    recursive: true,
    force: true
  });

  await mkdir(IMAGE_DIRECTORY, {
    recursive: true
  });

  await writeFile(
    path.join(OUTPUT_DIRECTORY, ".nojekyll"),
    "",
    "utf8"
  );

  await writeFile(
    path.join(OUTPUT_DIRECTORY, "index.html"),
    landingPageHtml(),
    "utf8"
  );

  for (const site of SITES) {
    const siteDirectory = path.join(OUTPUT_DIRECTORY, site.slug);
    await mkdir(siteDirectory, {
      recursive: true
    });

    await writeFile(
      path.join(siteDirectory, "index.html"),
      viewerHtml(site),
      "utf8"
    );
  }
}

async function captureSite(browser, site) {
  const outputPath = path.join(
    IMAGE_DIRECTORY,
    `${site.slug}.png`
  );

  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      locale: "en-AU",
      timezoneId: "Australia/Perth",
      colorScheme: "light",
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/145.0.0.0 Safari/537.36",
      extraHTTPHeaders: {
        "Accept-Language": "en-AU,en;q=0.9"
      }
    });

    const page = await context.newPage();

    page.setDefaultTimeout(60_000);
    page.setDefaultNavigationTimeout(120_000);

    page.on("console", (message) => {
      if (message.type() === "error") {
        console.log(
          `[${site.name}] Browser console: ${message.text()}`
        );
      }
    });

    try {
      console.log(
        `[${site.name}] Capture attempt ${attempt}/3`
      );

      const response = await page.goto(
        solarEdgeUrl(site.guid),
        {
          waitUntil: "domcontentloaded",
          timeout: 120_000
        }
      );

      if (response && response.status() >= 400) {
        throw new Error(
          `SolarEdge returned HTTP ${response.status()}`
        );
      }

      if (/login|signin/i.test(page.url())) {
        throw new Error(
          `SolarEdge redirected to an unexpected login page: ${page.url()}`
        );
      }

      // Flutter normally creates one of these elements. Do not fail solely
      // because SolarEdge changes its renderer; the later screenshot checks
      // still provide a useful fallback.
      await page
        .locator("flt-glass-pane, flutter-view, canvas")
        .first()
        .waitFor({
          state: "attached",
          timeout: 45_000
        })
        .catch(() => {});

      // Allow the public dashboard data, charts and background images to load.
      await page.waitForTimeout(25_000);

      const bodyText = await page
        .locator("body")
        .innerText()
        .catch(() => "");

      const detectedError = ERROR_TEXT.find((text) =>
        bodyText.toLowerCase().includes(text.toLowerCase())
      );

      if (detectedError) {
        throw new Error(
          `The rendered page contained an error: ${detectedError}`
        );
      }

      await page.screenshot({
        path: outputPath,
        type: "png",
        fullPage: false,
        animations: "disabled"
      });

      const screenshot = await stat(outputPath);

      if (screenshot.size < 25_000) {
        throw new Error(
          `Screenshot was unexpectedly small (${screenshot.size} bytes)`
        );
      }

      console.log(
        `[${site.name}] Saved ${outputPath} (${Math.round(
          screenshot.size / 1024
        )} KiB)`
      );

      await context.close();
      return;
    } catch (error) {
      lastError = error;
      console.error(
        `[${site.name}] Attempt ${attempt} failed: ${error.message}`
      );

      await context.close();

      if (attempt < 3) {
        await sleep(10_000);
      }
    }
  }

  throw new Error(
    `${site.name} could not be captured after three attempts: ${lastError?.message}`
  );
}

async function main() {
  await prepareOutputDirectory();

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-dev-shm-usage",
      "--hide-scrollbars",
      "--no-sandbox"
    ]
  });

  try {
    for (const site of SITES) {
      await captureSite(browser, site);
    }
  } finally {
    await browser.close();
  }

  const status = {
    generatedAt: new Date().toISOString(),
    viewport: VIEWPORT,
    sites: SITES.map(({ name, slug }) => ({
      name,
      slug,
      image: `images/${slug}.png`
    }))
  };

  await writeFile(
    path.join(OUTPUT_DIRECTORY, "status.json"),
    JSON.stringify(status, null, 2) + "\n",
    "utf8"
  );

  console.log("All SolarEdge dashboards captured successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
