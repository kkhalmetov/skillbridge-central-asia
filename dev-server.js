const http = require("http");
const fs = require("fs");
const path = require("path");
const opportunitiesHandler = require("./api/opportunities.js");

const root = __dirname;
const port = Number(process.env.PORT || 3000);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function loadEnvFile(fileName) {
  const envPath = path.join(root, fileName);
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const separator = trimmed.indexOf("=");
    if (separator === -1) return;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function createApiResponse(response) {
  response.status = (statusCode) => ({
    json: (payload) => sendJson(response, statusCode, payload),
    end: () => {
      response.writeHead(statusCode);
      response.end();
    },
  });
  response.json = (payload) => sendJson(response, 200, payload);
  return response;
}

function safeFilePath(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split("?")[0]);
  const requested = cleanPath === "/" ? "/index.html" : cleanPath;
  let filePath = path.normalize(path.join(root, requested));
  if (!path.extname(filePath)) {
    const htmlPath = `${filePath}.html`;
    if (fs.existsSync(htmlPath)) filePath = htmlPath;
  }
  return filePath.startsWith(root) ? filePath : "";
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const server = http.createServer(async (request, response) => {
  if (request.url.startsWith("/api/opportunities")) {
    await opportunitiesHandler(request, createApiResponse(response));
    return;
  }

  const filePath = safeFilePath(request.url);
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const notFoundPath = path.join(root, "404.html");
    response.writeHead(404, { "Content-Type": mimeTypes[".html"] });
    response.end(fs.readFileSync(notFoundPath));
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  response.writeHead(200, { "Content-Type": mimeTypes[extension] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(response);
});

server.listen(port, () => {
  console.log(`SkillBridge local server: http://localhost:${port}`);
  console.log(`Airtable API check:      http://localhost:${port}/api/opportunities`);
});
