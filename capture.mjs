import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const OUTPUT_DIR = path.resolve("public");
const IMAGE_DIR = path.join(OUTPUT_DIR, "images");

const MIN_SCREENSHOT_SIZE = 20_000;
const MAX_ATTEMPTS = 3;

// The published webpage checks for a new screenshot every 10 minutes.
const PAGE_REFRESH_MS = 60 * 1000;

const sites = [
  {
    name: "Operations Depot",
    slug: "operations-depot",
    guid: "06e982c3-b461-4902-8c9c-368e613fdb86",
  },
  {
    name: "Manning Community Centre",
    slug: "manning-community-centre",
    guid: "99317847-fe63-4ce5-a7c1-7e96861fd566",
  },
  {
    name: "South Perth Library",
    slug: "south-perth-library",
    guid: "12c58672-9bae-41e8-87c8-5899f681d949",
  },
  {
    name: "Civic Centre",
    slug: "civic-centre",
    guid: "1c79b0e1-139c-46fc-ae33-bb3a2cd143f3",
  },
];

await fs.mkdir(IMAGE_DIR, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  channel: "chromium",
  args: [
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--window-size=1920,1080",
  ],
});

async function captureSite(site) {
  const dashboardUrl =
    `https://monitoring.solaredge.com/mfe/flutter/kiosk/index.html?guid=${site.guid}`;

  const screenshotPath = path.join(
    IMAGE_DIR,
    `${site.slug}.png`
  );

  for (
    let attempt = 1;
    attempt <= MAX_ATTEMPTS;
    attempt++
  ) {
    console.log(
      `[${site.name}] Capture attempt ` +
      `${attempt}/${MAX_ATTEMPTS}`
    );

    const context = await browser.newContext({
      viewport: {
        width: 1920,
        height: 1080,
      },
      screen: {
        width: 1920,
        height: 1080,
      },
      deviceScaleFactor: 1,
      locale: "en-AU",
      timezoneId: "Australia/Perth",
      colorScheme: "light",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/131.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();

    page.on("console", (message) => {
      if (message.type() === "error") {
        console.log(
          `[${site.name}] Browser console: ` +
          `${message.text()}`
        );
      }
    });

    page.on("pageerror", (error) => {
      console.log(
        `[${site.name}] Page error: ${error.message}`
      );
    });

    try {
      await page.goto(dashboardUrl, {
        waitUntil: "domcontentloaded",
        timeout: 120_000,
      });

      /*
       * The SolarEdge dashboard rotates its content after
       * 30 seconds. Wait only eight seconds so the screenshot
       * contains the initial Weather and Power Today views.
       */
      await page.waitForTimeout(8_000);

      /*
       * If the dashboard has not rendered after eight seconds,
       * retry at approximately 13 and 18 seconds. All checks
       * occur before SolarEdge's 30-second rotation.
       */
      for (let check = 1; check <= 3; check++) {
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() =>
                requestAnimationFrame(resolve)
              )
            )
        );

        const screenshot = await page.screenshot({
          type: "png",
          fullPage: false,
          animations: "disabled",
        });

        console.log(
          `[${site.name}] Render check ${check}/3: ` +
          `${screenshot.length} bytes`
        );

        if (
          screenshot.length >= MIN_SCREENSHOT_SIZE
        ) {
          await fs.writeFile(
            screenshotPath,
            screenshot
          );

          console.log(
            `[${site.name}] Saved ${screenshotPath} ` +
            `(${Math.round(
              screenshot.length / 1024
            )} KiB)`
          );

          return {
            success: true,
            image: `../images/${site.slug}.png`,
          };
        }

        if (check < 3) {
          console.log(
            `[${site.name}] Screenshot is still ` +
            `blank or incomplete. Waiting another ` +
            `5 seconds.`
          );

          await page.waitForTimeout(5_000);
        }
      }
    } catch (error) {
      console.log(
        `[${site.name}] Attempt ${attempt} error: ` +
        `${error.message}`
      );
    } finally {
      await context.close().catch(() => {});
    }

    if (attempt < MAX_ATTEMPTS) {
      console.log(
        `[${site.name}] Starting a fresh browser ` +
        `session before retrying.`
      );

      await new Promise((resolve) =>
        setTimeout(resolve, 5_000)
      );
    }
  }

  console.log(
    `[${site.name}] All capture attempts failed. ` +
    `Checking for the previously published screenshot.`
  );

  const restored =
    await restorePreviousScreenshot(site);

  if (restored) {
    return {
      success: true,
      restored: true,
      image: `../images/${site.slug}.png`,
    };
  }

  const fallbackFilename =
    `${site.slug}-unavailable.svg`;

  const fallbackPath = path.join(
    IMAGE_DIR,
    fallbackFilename
  );

  await fs.writeFile(
    fallbackPath,
    createUnavailableImage(site.name),
    "utf8"
  );

  return {
    success: false,
    image: `../images/${fallbackFilename}`,
  };
}

async function restorePreviousScreenshot(site) {
  const repository =
    process.env.GITHUB_REPOSITORY;

  if (
    !repository ||
    !repository.includes("/")
  ) {
    return false;
  }

  const [owner, repositoryName] =
    repository.split("/");

  const previousImageUrl =
    `https://${owner}.github.io/` +
    `${repositoryName}/images/` +
    `${site.slug}.png?restore=${Date.now()}`;

  try {
    const response = await fetch(
      previousImageUrl,
      {
        headers: {
          "User-Agent":
            "SolarEdge-Signage-Capture",
          "Cache-Control": "no-cache",
        },
      }
    );

    if (!response.ok) {
      console.log(
        `[${site.name}] Previous screenshot ` +
        `returned HTTP ${response.status}.`
      );

      return false;
    }

    const buffer = Buffer.from(
      await response.arrayBuffer()
    );

    const contentType =
      response.headers.get("content-type") || "";

    if (
      !contentType.includes("image/png") ||
      buffer.length < MIN_SCREENSHOT_SIZE
    ) {
      console.log(
        `[${site.name}] Previous screenshot ` +
        `was not a valid PNG.`
      );

      return false;
    }

    await fs.writeFile(
      path.join(
        IMAGE_DIR,
        `${site.slug}.png`
      ),
      buffer
    );

    console.log(
      `[${site.name}] Restored the previously ` +
      `published screenshot.`
    );

    return true;
  } catch (error) {
    console.log(
      `[${site.name}] Could not restore previous ` +
      `screenshot: ${error.message}`
    );

    return false;
  }
}

function createUnavailableImage(siteName) {
  const safeName = escapeHtml(siteName);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="1920"
     height="1080"
     viewBox="0 0 1920 1080">
  <rect
    width="1920"
    height="1080"
    fill="#101820"
  />
  <text
    x="960"
    y="500"
    text-anchor="middle"
    fill="#ffffff"
    font-family="Arial, sans-serif"
    font-size="58"
    font-weight="600"
  >${safeName}</text>
  <text
    x="960"
    y="585"
    text-anchor="middle"
    fill="#b8c4ce"
    font-family="Arial, sans-serif"
    font-size="36"
  >Dashboard temporarily unavailable</text>
</svg>`;
}

function createDashboardPage(site, result) {
  const safeName = escapeHtml(site.name);
  const safeImage = escapeHtml(result.image);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">

  <meta
    name="viewport"
    content="width=device-width,
             initial-scale=1,
             maximum-scale=1"
  >

  <title>${safeName}</title>

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
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: #000;
    }
  </style>
</head>

<body>
  <img
    id="dashboard"
    src="${safeImage}?v=${Date.now()}"
    alt="${safeName} SolarEdge dashboard"
  >

  <script>
    const dashboard =
      document.getElementById("dashboard");

    const imageUrl =
      ${JSON.stringify(result.image)};

    function refreshDashboard() {
      const preload = new Image();

      preload.onload = function () {
        dashboard.src = preload.src;
      };

      preload.src =
        imageUrl +
        "?refresh=" +
        new Date().getTime();
    }

    /*
     * Check GitHub Pages for a new screenshot
     * every 10 minutes.
     */
    window.setInterval(
      refreshDashboard,
      ${PAGE_REFRESH_MS}
    );
  </script>
</body>
</html>`;
}

function createLandingPage(results) {
  const links = sites
    .map((site) => {
      const result = results.get(site.slug);

      const status =
        result?.success === true
          ? result.restored
            ? "Previous image retained"
            : "Current"
          : "Temporarily unavailable";

      return `
        <a
          class="site"
          href="./${site.slug}/"
        >
          <span>${escapeHtml(site.name)}</span>
          <small>${status}</small>
        </a>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">

  <meta
    name="viewport"
    content="width=device-width,
             initial-scale=1"
  >

  <title>SolarEdge Dashboards</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      min-height: 100vh;
      margin: 0;
      padding: 48px 24px;
      color: #fff;
      background: #101820;
      font-family: Arial, sans-serif;
    }

    main {
      width: min(760px, 100%);
      margin: 0 auto;
    }

    h1 {
      margin: 0 0 32px;
      font-size: 38px;
    }

    .site {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      margin: 14px 0;
      padding: 22px 24px;
      color: #fff;
      text-decoration: none;
      background: #1d2b36;
      border-radius: 10px;
    }

    .site:hover {
      background: #263a49;
    }

    .site span {
      font-size: 22px;
      font-weight: 600;
    }

    .site small {
      color: #b8c4ce;
      text-align: right;
    }
  </style>
</head>

<body>
  <main>
    <h1>SolarEdge Dashboards</h1>
    ${links}
  </main>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const results = new Map();

try {
  for (const site of sites) {
    const result = await captureSite(site);

    results.set(site.slug, result);

    const pageDirectory = path.join(
      OUTPUT_DIR,
      site.slug
    );

    await fs.mkdir(
      pageDirectory,
      { recursive: true }
    );

    await fs.writeFile(
      path.join(
        pageDirectory,
        "index.html"
      ),
      createDashboardPage(site, result),
      "utf8"
    );
  }

  await fs.writeFile(
    path.join(
      OUTPUT_DIR,
      "index.html"
    ),
    createLandingPage(results),
    "utf8"
  );
} finally {
  await browser.close();
}

const successfulCaptures =
  [...results.values()].filter(
    (result) => result.success
  ).length;

console.log(
  `Finished: ${successfulCaptures}/` +
  `${sites.length} dashboards have a current ` +
  `or previously published screenshot.`
);

// Continue deployment even if one dashboard fails.
process.exitCode = 0;
