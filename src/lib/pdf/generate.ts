// ─────────────────────────────────────────────────────────────
// Server-side PDF generation via Puppeteer
// ─────────────────────────────────────────────────────────────

import puppeteerCore from "puppeteer-core";
import chromium from "@sparticuz/chromium";

/**
 * Takes full HTML string, renders it in a headless browser, and returns a PDF Buffer.
 */
export async function htmlToPdf(html: string): Promise<Buffer> {
  // Strip the @import Google Fonts line — it causes networkidle0 to hang.
  // We fall back to system fonts (Georgia for serif, system sans for body).
  const cleanedHtml = html.replace(
    /@import url\([^)]+\);?/g,
    "/* fonts stripped for PDF */"
  );

  const isProduction = process.env.NODE_ENV === "production";

  let browser;
  if (isProduction) {
    // Serverless/Render: use @sparticuz/chromium
    browser = await puppeteerCore.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 720 },
      executablePath: await chromium.executablePath(),
      headless: true as any,
    });
  } else {
    // Local dev: use system-installed Chromium via puppeteer
    const puppeteer = (await import("puppeteer")).default;
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-web-security"],
    });
  }

  try {
    const page = await browser.newPage();

    // Block external font/image requests to avoid timeout
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const type = req.resourceType();
      if (type === "font" || type === "stylesheet") {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.setContent(cleanedHtml, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    // Brief wait for any inline styles to apply
    await new Promise((r) => setTimeout(r, 500));

    const pdfBuffer = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "0.5in", bottom: "0.5in", left: "0.6in", right: "0.6in" },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
