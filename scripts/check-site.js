const fs = require("fs");
const path = require("path");

const root = process.cwd();
const htmlFiles = fs.readdirSync(root).filter((file) => file.endsWith(".html")).sort();
const requiredHeadTags = [
  /<title>.+<\/title>/i,
  /<meta\s+name="description"\s+content="[^"]+"/i,
  /<meta\s+name="viewport"\s+content="width=device-width,\s*initial-scale=1"/i,
  /<link\s+rel="canonical"\s+href="[^"]+"/i,
  /<link\s+rel="stylesheet"\s+href="styles\.css"/i,
];

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function localAssetExists(reference) {
  if (
    !reference ||
    reference.startsWith("#") ||
    reference.startsWith("mailto:") ||
    reference.startsWith("tel:") ||
    reference.startsWith("http://") ||
    reference.startsWith("https://") ||
    reference.startsWith("/")
  ) {
    return true;
  }

  return fs.existsSync(path.join(root, reference.split(/[?#]/)[0]));
}

const headers = new Map();
const footers = new Map();

htmlFiles.forEach((file) => {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const header = source.match(/<header[\s\S]*?<\/header>/i)?.[0];
  const footer = source.match(/<footer[\s\S]*?<\/footer>/i)?.[0];

  if (!header) fail(`${file}: missing shared header`);
  if (!footer) fail(`${file}: missing shared footer`);
  if (header) headers.set(file, header);
  if (footer) {
    footers.set(file, footer);
    const contactIndex = footer.indexOf('class="footer-contact"');
    const socialIndex = footer.indexOf('class="footer-social"');
    const sdgIndex = footer.indexOf('class="footer-sdg"');
    if (!(contactIndex < socialIndex && socialIndex < sdgIndex)) {
      fail(`${file}: footer order should be Contacts, Updates, then Sustainable Development Goals`);
    }
  }

  requiredHeadTags.forEach((pattern) => {
    if (!pattern.test(source)) fail(`${file}: missing required head tag ${pattern}`);
  });

  [...source.matchAll(/\s(?:src|href)="([^"]+)"/g)].forEach(([, reference]) => {
    if (!localAssetExists(reference)) fail(`${file}: missing local asset ${reference}`);
  });
});

const uniqueHeaders = new Set(headers.values());
const uniqueFooters = new Set(footers.values());

if (uniqueHeaders.size > 1) fail("Shared header markup differs between HTML pages");
if (uniqueFooters.size > 1) fail("Shared footer markup differs between HTML pages");

if (!process.exitCode) {
  console.log(`Site check passed for ${htmlFiles.length} HTML pages.`);
}
