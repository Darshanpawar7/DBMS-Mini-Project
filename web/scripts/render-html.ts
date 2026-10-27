/**
 * Renders a local HTML/SVG file to PNG or PDF with headless Chromium (used for the report).
 *   npx tsx scripts/render-html.ts <input.html|svg> <output.png|pdf> [width] [height] [footer label]
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

async function main(): Promise<void> {
  const [input, output, width = "1300", height = "960", footer = "ScholarMesh · Phase 2"] = process.argv.slice(2);
  if (!input || !output) throw new Error("usage: render-html.ts <input> <output.png|pdf> [width] [height]");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(path.resolve(input)).href, { waitUntil: "load" });
  if (output.endsWith(".pdf")) {
    await page.pdf({
      path: output,
      format: "A4",
      preferCSSPageSize: true, // honours @page size, incl. the landscape pages for diagrams
      printBackground: true,
      margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate:
        `<div style="width:100%;font-size:8px;color:#94a3b8;text-align:center;font-family:Arial">${footer} · Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`,
    });
  } else {
    await page.screenshot({ path: output, fullPage: !input.endsWith(".svg") });
  }
  await browser.close();
  console.log(`rendered ${output}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
