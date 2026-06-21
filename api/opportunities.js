const AIRTABLE_API_URL = "https://api.airtable.com/v0";
const DEFAULT_BASE_ID = "apphdgRQsRvYwsIHT";
const DEFAULT_TABLE_NAME = "Opportunities";

const categoryMap = {
  internship: "internship",
  internships: "internship",
  grant: "grant",
  grants: "grant",
  scholarship: "scholarship",
  scholarships: "scholarship",
  event: "event",
  events: "event",
};

const regionMap = {
  local: "local",
  regional: "regional",
  national: "national",
  international: "international",
  online: "online",
};

const tagMap = {
  free: "free",
  paid: "paid",
  remote: "remote",
  "for students": "students",
  students: "students",
  "for school students": "school",
  school: "school",
  "school students": "school",
  "no experience required": "no-experience",
  "no experience": "no-experience",
  tech: "tech",
  business: "business",
  "arts & culture": "arts",
  arts: "arts",
  culture: "arts",
  environment: "environment",
  leadership: "leadership",
  volunteering: "volunteering",
  competition: "competition",
};

function pick(fields, names) {
  for (const name of names) {
    if (fields[name] !== undefined && fields[name] !== null && fields[name] !== "") return fields[name];
  }
  return "";
}

function asText(value) {
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(", ");
  if (typeof value === "object" && value) return value.name || value.url || "";
  return String(value || "").trim();
}

function asSlug(value) {
  return asText(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function normalizeChoice(value, map) {
  const key = asSlug(value);
  return map[key] || map[asText(value).toLowerCase()] || "";
}

function normalizeTags(value) {
  const values = Array.isArray(value) ? value : asText(value).split(",");
  return values
    .map((item) => normalizeChoice(item, tagMap, ""))
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index);
}

function normalizeImage(value) {
  if (Array.isArray(value) && value[0]?.url) return value[0].url;
  return asText(value);
}

function normalizeDate(value) {
  const text = asText(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = text ? new Date(text) : null;
  if (date && !Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  return "";
}

function normalizeRecord(record) {
  const fields = record.fields || {};
  const title = asText(pick(fields, ["title", "Title", "Opportunity title", "Name", "Opportunity"]));
  const organizer = asText(pick(fields, ["organizer", "Organizer", "Organization", "Organisation"]));
  const city = asText(pick(fields, ["location", "city", "City", "Location", "Place"]));
  const country = asText(pick(fields, ["country", "Country"]));
  const location = city && country && !city.includes(country) ? `${city}, ${country}` : city || country;
  const category = normalizeChoice(pick(fields, ["category", "Category", "Type"]), categoryMap);
  const region = normalizeChoice(pick(fields, ["region", "Region", "Reach", "Region / reach"]), regionMap);
  const deadline = normalizeDate(pick(fields, ["deadline", "Deadline", "Application deadline"]));
  const addedDate = normalizeDate(pick(fields, ["addedDate", "added date", "Added date", "Added", "Created"])) || record.createdTime?.slice(0, 10) || deadline;
  const description = asText(pick(fields, ["description", "Description", "Short description", "Summary"]));
  const details = asText(pick(fields, ["details", "Details", "Full description", "Long description"])) || description;
  const imageSrc = normalizeImage(pick(fields, ["image", "Image", "Photo", "Cover", "Picture"]));
  const applyUrl = asText(pick(fields, ["link", "Apply URL", "Application link", "Link", "URL"]));
  const tags = normalizeTags(pick(fields, ["tags", "Tags", "Tag"]));
  const hasContent = [
    title,
    organizer,
    category,
    region,
    deadline,
    description,
    tags.join(""),
    applyUrl,
    imageSrc,
    normalizeDate(pick(fields, ["ap", "AP", "applicationOpen", "Applications open", "Application open"])),
    normalizeDate(pick(fields, ["pa", "PA", "programStart", "Program start", "Start date"])),
  ].some(Boolean);

  if (!hasContent) {
    return null;
  }

  return {
    id: asSlug(pick(fields, ["Slug", "ID", "Id"])) || record.id,
    title,
    category,
    region,
    deadline,
    addedDate,
    organizer,
    location,
    imageSrc,
    description,
    details,
    tags,
    applyUrl,
    applicationOpen: normalizeDate(pick(fields, ["ap", "AP", "applicationOpen", "Applications open", "Application open"])),
    programStart: normalizeDate(pick(fields, ["pa", "PA", "programStart", "Program start", "Start date"])),
    eligibility: asText(pick(fields, ["eligibility", "Eligibility", "Who can apply"])),
    format: asText(pick(fields, ["format", "Format"])),
    duration: asText(pick(fields, ["duration", "Duration"])),
    cost: asText(pick(fields, ["cost", "Cost", "Price", "Support"])),
  };
}

async function fetchAirtableRecords() {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID || DEFAULT_BASE_ID;
  const tableName = process.env.AIRTABLE_TABLE_NAME || DEFAULT_TABLE_NAME;

  if (!token) {
    throw new Error("AIRTABLE_TOKEN is not configured.");
  }

  const records = [];
  let offset = "";

  do {
    const params = new URLSearchParams({ pageSize: "100" });
    if (offset) params.set("offset", offset);

    const url = `${AIRTABLE_API_URL}/${baseId}/${encodeURIComponent(tableName)}?${params}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Airtable request failed (${response.status}): ${message}`);
    }

    const data = await response.json();
    records.push(...(data.records || []));
    offset = data.offset || "";
  } while (offset);

  return records;
}

module.exports = async function handler(request, response) {
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (request.method !== "GET") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const records = await fetchAirtableRecords();
    const opportunities = records
      .filter((record) => {
        const status = asText(pick(record.fields || {}, ["Status", "Publication status"])).toLowerCase();
        return !status || status === "published" || status === "active";
      })
      .map(normalizeRecord)
      .filter(Boolean);

    response.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=300");
    response.status(200).json({ opportunities });
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
};
