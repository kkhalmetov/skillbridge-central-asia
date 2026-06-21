const categoryLabels = {
  internship: "Internships",
  grant: "Grants",
  scholarship: "Scholarships",
  event: "Events",
};

const categorySingularLabels = {
  internship: "Internship",
  grant: "Grant",
  scholarship: "Scholarship",
  event: "Event",
};

const regionLabels = {
  local: "Local",
  regional: "Regional",
  national: "National",
  international: "International",
  online: "Online",
};

const tagLabels = {
  free: "Free",
  paid: "Paid",
  remote: "Remote",
  students: "For students",
  school: "For school students",
  "no-experience": "No experience required",
  tech: "Tech",
  business: "Business",
  arts: "Arts & Culture",
  environment: "Environment",
  leadership: "Leadership",
  volunteering: "Volunteering",
  competition: "Competition",
};

let opportunities = [];
const opportunitiesEndpoint = "/api/opportunities";
const opportunitiesCacheKey = "skillbridge-opportunities-cache-v1";
const opportunitiesCacheTtl = 5 * 60 * 1000;

const catalogGrid = document.querySelector("#catalogGrid");
const featuredGrid = document.querySelector("#featuredGrid");
const catalogSearch = document.querySelector("#catalogSearch");
const filterOptionGroups = document.querySelectorAll("[data-filter-options]");
const clearFilters = document.querySelector("#clearFilters");
const choiceFields = document.querySelectorAll("[data-choice]");
const resultCountNode = document.querySelector("[data-result-count]");
const activeFilterList = document.querySelector("[data-active-filter-list]");
const filterCountNodes = document.querySelectorAll("[data-filter-count]");
const filterToggle = document.querySelector("[data-filter-toggle]");
const applyFiltersButton = document.querySelector("[data-apply-filters]");
const catalogLayout = document.querySelector(".catalog-layout");
const menuToggle = document.querySelector("[data-menu-toggle]");
const header = document.querySelector(".site-header");
const headerMenu = document.querySelector("[data-menu]");
const detailRoot = document.querySelector("[data-opportunity-detail]");
const contactForm = document.querySelector("[data-contact-form]");
const siteUrl = "https://skillbridgeca.org";

const filters = {
  regions: new Set(),
  categories: new Set(),
  tags: new Set(),
};

let searchQuery = "";
let activeSort = "deadline";

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function daysUntilDeadline(value) {
  if (!value) return Number.POSITIVE_INFINITY;
  const [year, month, day] = value.split("-").map(Number);
  const deadlineDate = new Date(year, month - 1, day);
  const today = new Date();
  deadlineDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.ceil((deadlineDate - today) / 86400000);
}

function setMetaContent(selector, value) {
  const node = document.querySelector(selector);
  if (node) node.setAttribute("content", value);
}

function setCanonical(value) {
  const node = document.querySelector('link[rel="canonical"]');
  if (node) node.setAttribute("href", value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function safeUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  if (/^(https?:|mailto:)/i.test(url)) return url;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
  return "";
}

function absoluteUrl(value) {
  const url = safeUrl(value);
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${siteUrl}/${url.replace(/^\/+/, "")}`;
}

function canUseApiEndpoint() {
  return location.protocol === "http:" || location.protocol === "https:";
}

function pageNeedsOpportunities() {
  return Boolean(catalogGrid || featuredGrid || detailRoot);
}

function readCachedOpportunities() {
  try {
    const cached = JSON.parse(localStorage.getItem(opportunitiesCacheKey) || "null");
    if (!cached?.timestamp || !Array.isArray(cached.opportunities)) return [];
    if (Date.now() - cached.timestamp > opportunitiesCacheTtl) return [];
    return cached.opportunities;
  } catch (error) {
    return [];
  }
}

function cacheOpportunities(items) {
  try {
    localStorage.setItem(
      opportunitiesCacheKey,
      JSON.stringify({
        timestamp: Date.now(),
        opportunities: items,
      }),
    );
  } catch (error) {
    // Storage can be unavailable in private browsing modes.
  }
}

async function loadOpportunities() {
  if (!canUseApiEndpoint() || !pageNeedsOpportunities()) return;

  const cachedOpportunities = readCachedOpportunities();
  if (cachedOpportunities.length) {
    opportunities = cachedOpportunities;
    renderHomeSections();
    renderCatalog();
    renderOpportunityDetail();
  }

  try {
    const response = await fetch(opportunitiesEndpoint, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Airtable API failed: ${response.status}`);
    const data = await response.json();
    if (Array.isArray(data.opportunities)) {
      opportunities = data.opportunities;
      cacheOpportunities(opportunities);
    }
  } catch (error) {
    console.warn("Could not load Airtable opportunities.", error);
  }
}

function detailMetadata(item) {
  return {
    applicationOpen: item.applicationOpen || "",
    programStart: item.programStart || "",
    eligibility: item.eligibility || "",
    format: item.format || "",
    duration: item.duration || "",
    cost: item.cost || "",
    applyUrl: item.applyUrl,
  };
}

function resultLabel(count) {
  return `${count} ${count === 1 ? "result" : "results"}`;
}

function activeFilterCount() {
  return filters.regions.size + filters.categories.size + filters.tags.size + (searchQuery.trim() ? 1 : 0);
}

function filterLabel(group, value) {
  if (group === "regions") return regionLabels[value] || value;
  if (group === "categories") return categoryLabels[value] || value;
  return tagLabels[value] || value;
}

function availableFilterValues(group) {
  const values = new Set();

  opportunities.forEach((item) => {
    if (group === "regions" && item.region) values.add(item.region);
    if (group === "categories" && item.category) values.add(item.category);
    if (group === "tags") (item.tags || []).forEach((tag) => values.add(tag));
  });

  return [...values].sort((a, b) => filterLabel(group, a).localeCompare(filterLabel(group, b)));
}

function renderFilterOptions() {
  filterOptionGroups.forEach((groupNode) => {
    const group = groupNode.dataset.filterOptions;
    const values = availableFilterValues(group);
    const wrapper = groupNode.closest(".filter-group");

    if (wrapper) wrapper.hidden = values.length === 0;
    groupNode.innerHTML = values
      .map(
        (value) => `
          <button class="chip" type="button" data-filter-group="${escapeAttribute(group)}" data-filter-value="${escapeAttribute(value)}" aria-pressed="false">
            ${escapeHtml(filterLabel(group, value))}
          </button>
        `,
      )
      .join("");
  });
}

function opportunityUrl(item) {
  return `/opportunity?id=${encodeURIComponent(item.id)}`;
}

function catalogFilterUrl(group, value) {
  const paramByGroup = {
    categories: "category",
    regions: "region",
    tags: "tag",
  };
  return `/catalog?${paramByGroup[group]}=${encodeURIComponent(value)}`;
}

function normalizeNavigationPath(value) {
  const url = new URL(value || "/", location.origin);
  let pathname = url.pathname.replace(/\/$/, "") || "/";
  pathname = pathname.replace(/\.html$/, "");
  if (pathname === "/index") return "/";
  return pathname;
}

function setFiltersOpen(isOpen) {
  if (!filterToggle || !catalogLayout) return;
  catalogLayout.classList.toggle("filters-open", isOpen);
  filterToggle.setAttribute("aria-expanded", String(isOpen));
}

function updateActiveNav() {
  const currentPage = normalizeNavigationPath(location.href);
  document.querySelectorAll(".main-nav a").forEach((link) => {
    const linkPage = normalizeNavigationPath(link.getAttribute("href"));
    const isActive = linkPage === currentPage;
    link.classList.toggle("active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  document.querySelectorAll(".header-cta").forEach((link) => {
    const linkPage = normalizeNavigationPath(link.getAttribute("href"));
    if (linkPage === currentPage) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function updateFilterUi() {
  document.querySelectorAll("[data-filter-group]").forEach((button) => {
    const group = button.dataset.filterGroup;
    const value = button.dataset.filterValue;
    const active = filters[group]?.has(value);
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  const count = activeFilterCount();
  filterCountNodes.forEach((node) => {
    node.hidden = count === 0;
    node.textContent = `${count} selected`;
  });

  if (clearFilters) clearFilters.hidden = count === 0;
}

function renderActiveFilterChips() {
  if (!activeFilterList) return;
  const chips = [];

  Object.entries(filters).forEach(([group, values]) => {
    values.forEach((value) => {
      chips.push(`
        <button class="active-filter-chip" type="button" data-remove-filter-group="${escapeAttribute(group)}" data-remove-filter-value="${escapeAttribute(value)}">
          ${escapeHtml(filterLabel(group, value))}
          <span aria-hidden="true">x</span>
        </button>
      `);
    });
  });

  if (searchQuery.trim()) {
    chips.push(`
      <button class="active-filter-chip" type="button" data-clear-search>
        Search: ${escapeHtml(searchQuery.trim())}
        <span aria-hidden="true">x</span>
      </button>
    `);
  }

  activeFilterList.innerHTML = chips.join("");
}

function matchesAny(selectedValues, itemValue) {
  return selectedValues.size === 0 || selectedValues.has(itemValue);
}

function matchesTags(selectedTags, itemTags) {
  return selectedTags.size === 0 || [...selectedTags].some((tag) => (itemTags || []).includes(tag));
}

function filteredOpportunities() {
  const query = searchQuery.trim().toLowerCase();

  return opportunities.filter((item) => {
    const searchable = [
      item.title,
      item.organizer,
      item.location,
      item.description,
      categoryLabels[item.category],
      regionLabels[item.region],
      ...(item.tags || []).map((tag) => tagLabels[tag] || tag),
    ]
      .join(" ")
      .toLowerCase();

    return (
      matchesAny(filters.regions, item.region) &&
      matchesAny(filters.categories, item.category) &&
      matchesTags(filters.tags, item.tags) &&
      (!query || searchable.includes(query))
    );
  });
}

function sortedOpportunities(items) {
  return [...items].sort((a, b) => {
    if (activeSort === "newest") return new Date(b.addedDate) - new Date(a.addedDate);
    if (!a.deadline && !b.deadline) return 0;
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return new Date(a.deadline) - new Date(b.deadline);
  });
}

function opportunityCard(item, variant = "") {
  const daysLeft = daysUntilDeadline(item.deadline);
  const closingSoon = daysLeft >= 0 && daysLeft < 7;
  const deadlineText = item.deadline
    ? closingSoon
      ? `Closing soon - ${formatDate(item.deadline)}`
      : `Deadline: ${formatDate(item.deadline)}`
    : "";
  const tags = (item.tags || [])
    .slice(0, 4)
    .map((tag) => `<span class="tag">${escapeHtml(tagLabels[tag] || tag)}</span>`)
    .join("");

  const meta = [item.organizer, item.location, regionLabels[item.region] || item.region]
    .filter(Boolean)
    .map((value) => `<span>${escapeHtml(value)}</span>`)
    .join("");

  return `
    <a class="card quick-card opportunity-card ${variant}" href="${opportunityUrl(item)}">
      ${item.imageSrc ? `<img class="card-image" src="${escapeAttribute(safeUrl(item.imageSrc))}" alt="${escapeAttribute(item.title || "Opportunity image")}" loading="lazy" />` : ""}
      ${item.category ? `<div class="card-top">
        <span class="type-badge">${escapeHtml(categoryLabels[item.category] || item.category)}</span>
      </div>` : ""}
      ${item.title ? `<h3>${escapeHtml(item.title)}</h3>` : ""}
      ${meta ? `<div class="card-meta">${meta}</div>` : ""}
      ${item.description ? `<p class="card-description">${escapeHtml(item.description)}</p>` : ""}
      <div class="tag-list" aria-label="Tags">${tags}</div>
      ${deadlineText ? `<div class="deadline ${closingSoon ? "closing-soon" : ""}">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M8 2v4M16 2v4M3 10h18" />
          <rect x="3" y="4" width="18" height="18" rx="2" />
        </svg>
        ${escapeHtml(deadlineText)}
      </div>` : ""}
      <span class="card-action">View details</span>
    </a>
  `;
}

function renderCatalog() {
  if (!catalogGrid) return;

  renderFilterOptions();
  updateFilterUi();
  renderActiveFilterChips();

  const items = sortedOpportunities(filteredOpportunities());
  if (resultCountNode) resultCountNode.textContent = resultLabel(items.length);

  if (!items.length) {
    catalogGrid.innerHTML = `
      <div class="empty-state catalog-empty-state">
        <h3>No opportunities match your filters yet.</h3>
        <p>Try adjusting your search or check back soon - new opportunities are added regularly.</p>
        <button class="button primary" type="button" data-empty-reset>Reset filters</button>
      </div>
    `;
    return;
  }

  catalogGrid.innerHTML = items.map((item) => opportunityCard(item)).join("");
}

function renderHomeSections() {
  if (!featuredGrid) return;
  const featured = sortedOpportunities(opportunities).slice(0, 3);
  featuredGrid.innerHTML = featured.map((item) => opportunityCard(item, "featured-card")).join("");
}

function renderOpportunityDetail() {
  if (!detailRoot) return;
  const params = new URLSearchParams(location.search);
  const item = opportunities.find((opportunity) => opportunity.id === params.get("id"));

  if (!item) {
    detailRoot.innerHTML = `
      <div class="detail-empty">
        <p class="eyebrow">Opportunity</p>
        <h1 class="page-title">Opportunity not found</h1>
        <p>This opportunity may have been removed or the link is incorrect.</p>
        <a class="button primary" href="/catalog">Back to catalog</a>
      </div>
    `;
    return;
  }

  const titleText = item.title || "Opportunity details";
  const detailTitle = `${titleText} | SkillBridge Central Asia`;
  const detailDescription = `${item.description || titleText}${item.deadline ? ` Deadline: ${formatDate(item.deadline)}.` : ""}${item.organizer ? ` Organizer: ${item.organizer}.` : ""}`;
  document.title = detailTitle;
  setMetaContent('meta[name="description"]', detailDescription);
  setMetaContent('meta[property="og:title"]', detailTitle);
  setMetaContent('meta[property="og:description"]', detailDescription);
  setMetaContent('meta[property="og:url"]', `${siteUrl}${opportunityUrl(item)}`);
  if (item.imageSrc) setMetaContent('meta[property="og:image"]', absoluteUrl(item.imageSrc));
  setMetaContent('meta[name="twitter:title"]', detailTitle);
  setMetaContent('meta[name="twitter:description"]', detailDescription);
  if (item.imageSrc) setMetaContent('meta[name="twitter:image"]', absoluteUrl(item.imageSrc));
  setCanonical(`${siteUrl}${opportunityUrl(item)}`);

  const metadata = detailMetadata(item);
  const daysLeft = daysUntilDeadline(item.deadline);
  const closingSoon = daysLeft >= 0 && daysLeft < 7;
  const related = opportunities
    .filter((candidate) => candidate.id !== item.id)
    .map((candidate) => {
      const sharedTags = (candidate.tags || []).filter((tag) => (item.tags || []).includes(tag)).length;
      const categoryScore = candidate.category === item.category ? 3 : 0;
      return { candidate, score: categoryScore + sharedTags };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || (a.deadline ? new Date(a.deadline) : Infinity) - (b.deadline ? new Date(b.deadline) : Infinity))
    .map(({ candidate }) => candidate)
    .concat(opportunities.filter((candidate) => candidate.id !== item.id))
    .filter((candidate, index, list) => list.findIndex((entry) => entry.id === candidate.id) === index)
    .slice(0, 3);
  const tags = (item.tags || [])
    .map((tag) => `<a class="tag detail-tag" href="${escapeAttribute(catalogFilterUrl("tags", tag))}">${escapeHtml(tagLabels[tag] || tag)}</a>`)
    .join("");
  const relatedCards = related.map((candidate) => opportunityCard(candidate, "related-card")).join("");
  const participationItems = [
    ["Who can apply", metadata.eligibility],
    ["Format", metadata.format],
    ["Duration", metadata.duration],
    ["Cost and support", metadata.cost],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `<li><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></li>`)
    .join("");
  const participationSection = participationItems
    ? `
          <section class="detail-section-card">
            <p class="eyebrow">Eligibility</p>
            <h2>Participation conditions</h2>
            <ul class="detail-check-list">${participationItems}</ul>
          </section>
    `
    : "";
  const timelineItems = [
    ["Applications open", metadata.applicationOpen, ""],
    ["Application deadline", item.deadline, closingSoon ? "date-emphasis" : ""],
    ["Program start", metadata.programStart, ""],
  ]
    .filter(([, value]) => value)
    .map(([label, value, className]) => `
              <div class="${className}">
                <dt>${escapeHtml(label)}</dt>
                <dd>${escapeHtml(formatDate(value))}</dd>
              </div>`)
    .join("");
  const tagsSection = tags
    ? `
          <section class="detail-section-card">
            <p class="eyebrow">Tags</p>
            <h2>Explore similar filters</h2>
            <div class="tag-list detail-tag-list">${tags}</div>
          </section>
    `
    : "";
  const overviewSection = item.details || item.description
    ? `
          <section class="detail-section-card">
            <p class="eyebrow">Overview</p>
            <h2>About this opportunity</h2>
            <p>${escapeHtml(item.details || item.description)}</p>
          </section>
    `
    : "";
  const sideFacts = [
    ["Organizer", item.organizer],
    ["Location", item.location],
    ["Category", categorySingularLabels[item.category] || item.category],
    ["Reach", regionLabels[item.region] || item.region],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `
            <div>
              <dt>${escapeHtml(label)}</dt>
              <dd>${escapeHtml(value)}</dd>
            </div>`)
    .join("");

  detailRoot.innerHTML = `
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="/">Home</a>
      <span aria-hidden="true">&rarr;</span>
      <a href="/catalog">Opportunities</a>
      <span aria-hidden="true">&rarr;</span>
      <span>${escapeHtml(titleText)}</span>
    </nav>

    <article class="opportunity-detail-page">
      <section class="opportunity-detail-hero">
        ${item.imageSrc ? `
        <div class="opportunity-detail-media">
          <img src="${escapeAttribute(safeUrl(item.imageSrc))}" alt="${escapeAttribute(item.title || "Opportunity image")}" />
        </div>
        ` : ""}
        <div class="opportunity-detail-copy">
          <h1 class="page-title">${escapeHtml(titleText)}</h1>
          <div class="detail-hero-actions">
            ${safeUrl(metadata.applyUrl) ? `<a class="button primary" href="${escapeAttribute(safeUrl(metadata.applyUrl))}" ${safeUrl(metadata.applyUrl).startsWith("mailto:") ? "" : 'target="_blank" rel="noopener"'}>Apply Now</a>` : ""}
            <button class="button secondary share-button" type="button" data-share-opportunity>Share</button>
          </div>
        </div>
      </section>

      <div class="opportunity-detail-layout">
        <div class="opportunity-detail-main">
          ${overviewSection}

          ${participationSection}

          <section class="detail-section-card">
            <p class="eyebrow">Timeline</p>
            <h2>Key dates</h2>
            <dl class="detail-facts">${timelineItems}</dl>
          </section>

          ${tagsSection}
        </div>

        <aside class="detail-side-panel" aria-label="Application summary">
          <p class="eyebrow">Next step</p>
          <h2>Ready to apply?</h2>
          <p>Open the organizer page or contact the organizer directly. SkillBridge collects opportunities and helps you find the right match.</p>
          ${safeUrl(metadata.applyUrl) ? `<a class="button primary" href="${escapeAttribute(safeUrl(metadata.applyUrl))}" ${safeUrl(metadata.applyUrl).startsWith("mailto:") ? "" : 'target="_blank" rel="noopener"'}>Apply Now</a>` : ""}
          <dl class="side-facts">${sideFacts}</dl>
        </aside>
      </div>

      <section class="related-opportunities-section">
        <div class="compact-heading">
          <div>
            <p class="eyebrow">Related opportunities</p>
            <h2>Keep exploring</h2>
          </div>
          <a class="section-link" href="/catalog">View all</a>
        </div>
        <div class="catalog-grid related-grid">${relatedCards}</div>
      </section>
    </article>
  `;
}

function resetFilters() {
  filters.regions.clear();
  filters.categories.clear();
  filters.tags.clear();
  searchQuery = "";
  if (catalogSearch) catalogSearch.value = "";
  renderCatalog();
}

function setMenuOpen(isOpen) {
  if (!menuToggle || !header) return;
  header.classList.toggle("menu-open", isOpen);
  menuToggle.setAttribute("aria-expanded", String(isOpen));
  menuToggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
}

const initialParams = new URLSearchParams(location.search);
const initialCategory = initialParams.get("category") || initialParams.get("type");
const initialRegion = initialParams.get("region");
const initialTag = initialParams.get("tag");
const initialSearch = initialParams.get("search");

if (initialCategory && filters.categories && categoryLabels[initialCategory]) {
  filters.categories.add(initialCategory);
}

if (initialRegion && filters.regions && regionLabels[initialRegion]) {
  filters.regions.add(initialRegion);
}

if (initialTag && filters.tags && tagLabels[initialTag]) {
  filters.tags.add(initialTag);
}

if (initialSearch) {
  searchQuery = initialSearch;
  if (catalogSearch) catalogSearch.value = initialSearch;
}

if (catalogLayout) {
  catalogLayout.addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter-group]");
    if (!button) return;
    const group = button.dataset.filterGroup;
    const value = button.dataset.filterValue;
    if (!filters[group]) return;
    if (filters[group].has(value)) {
      filters[group].delete(value);
    } else {
      filters[group].add(value);
    }
    renderCatalog();
  });
}

if (catalogSearch) {
  catalogSearch.addEventListener("input", (event) => {
    searchQuery = event.target.value;
    renderCatalog();
  });
}

function closeChoice(field) {
  const toggle = field.querySelector("[data-choice-toggle]");
  const menu = field.querySelector("[data-choice-menu]");
  field.classList.remove("open");
  if (toggle) toggle.setAttribute("aria-expanded", "false");
  if (menu) menu.hidden = true;
}

function closeAllChoices(exceptField = null) {
  choiceFields.forEach((field) => {
    if (field !== exceptField) closeChoice(field);
  });
}

function openChoice(field) {
  const toggle = field.querySelector("[data-choice-toggle]");
  const menu = field.querySelector("[data-choice-menu]");
  closeAllChoices(field);
  field.classList.add("open");
  if (toggle) toggle.setAttribute("aria-expanded", "true");
  if (menu) menu.hidden = false;
}

function setChoiceValue(field, option) {
  const input = field.querySelector("[data-choice-input]");
  const label = field.querySelector("[data-choice-label]");
  const error = field.querySelector("[data-choice-error]");
  const value = option.dataset.choiceValue;
  if (input) input.value = value;
  if (label) label.textContent = option.textContent.trim();
  field.querySelectorAll("[data-choice-value]").forEach((button) => {
    button.setAttribute("aria-selected", String(button === option));
  });
  field.classList.remove("choice-error");
  if (error) error.hidden = true;
  closeChoice(field);

  if (field.dataset.choiceAction === "sort") {
    activeSort = value;
    renderCatalog();
  }
}

function invalidRequiredChoice(form) {
  return [...form.querySelectorAll("[data-choice-input][data-choice-required]")].find((input) => !input.value);
}

function focusInvalidChoice(input) {
  const field = input.closest("[data-choice]");
  const toggle = field?.querySelector("[data-choice-toggle]");
  const error = field?.querySelector("[data-choice-error]");
  field?.classList.add("choice-error");
  if (error) error.hidden = false;
  toggle?.focus();
}

choiceFields.forEach((field) => {
  const toggle = field.querySelector("[data-choice-toggle]");
  const menu = field.querySelector("[data-choice-menu]");
  if (!toggle || !menu) return;

  toggle.addEventListener("click", () => {
    if (menu.hidden) {
      openChoice(field);
    } else {
      closeChoice(field);
    }
  });

  menu.addEventListener("click", (event) => {
    const option = event.target.closest("[data-choice-value]");
    if (!option) return;
    setChoiceValue(field, option);
  });

  field.addEventListener("keydown", (event) => {
    const options = [...field.querySelectorAll("[data-choice-value]")];
    const activeIndex = options.indexOf(document.activeElement);

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (menu.hidden) openChoice(field);
      options[Math.min(activeIndex + 1, options.length - 1)]?.focus();
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (menu.hidden) openChoice(field);
      options[Math.max(activeIndex - 1, 0)]?.focus();
    }

    if (event.key === "Enter" && options.includes(document.activeElement)) {
      event.preventDefault();
      setChoiceValue(field, document.activeElement);
      toggle.focus();
    }

    if (event.key === "Escape") {
      closeChoice(field);
      toggle.focus();
    }
  });
});

document.addEventListener("click", (event) => {
  if (!event.target.closest("[data-choice]")) closeAllChoices();
});

if (clearFilters) {
  clearFilters.addEventListener("click", resetFilters);
}

if (activeFilterList) {
  activeFilterList.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-filter-group]");
    const clearSearchButton = event.target.closest("[data-clear-search]");

    if (removeButton) {
      filters[removeButton.dataset.removeFilterGroup]?.delete(removeButton.dataset.removeFilterValue);
      renderCatalog();
    }

    if (clearSearchButton) {
      searchQuery = "";
      if (catalogSearch) catalogSearch.value = "";
      renderCatalog();
    }
  });
}

if (catalogGrid) {
  catalogGrid.addEventListener("click", (event) => {
    if (event.target.closest("[data-empty-reset]")) resetFilters();
  });
}

if (detailRoot) {
  detailRoot.addEventListener("click", async (event) => {
    const shareButton = event.target.closest("[data-share-opportunity]");
    if (!shareButton) return;

    const shareUrl = location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: document.title, url: shareUrl });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        shareButton.textContent = "Copied";
        setTimeout(() => {
          shareButton.textContent = "Share";
        }, 1400);
      }
    } catch (error) {
      shareButton.textContent = "Share";
    }
  });
}

if (contactForm) {
  contactForm.addEventListener("submit", (event) => {
    const invalidChoice = invalidRequiredChoice(contactForm);
    if (!invalidChoice) return;
    event.preventDefault();
    focusInvalidChoice(invalidChoice);
  });
}

if (filterToggle && catalogLayout) {
  filterToggle.addEventListener("click", () => {
    setFiltersOpen(!catalogLayout.classList.contains("filters-open"));
  });
}

if (applyFiltersButton) {
  applyFiltersButton.addEventListener("click", () => setFiltersOpen(false));
}

if (menuToggle && headerMenu) {
  menuToggle.addEventListener("click", () => {
    setMenuOpen(!header.classList.contains("menu-open"));
  });

  headerMenu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setMenuOpen(false));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setMenuOpen(false);
      setFiltersOpen(false);
      closeAllChoices();
    }
  });
}

document.querySelectorAll("[data-scroll-top]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    link.blur();
    window.scrollTo({ top: 0, behavior: "auto" });
    history.replaceState(null, "", `${location.pathname}${location.search}`);
  });
});

window.addEventListener("hashchange", updateActiveNav);

async function initializeApp() {
  updateActiveNav();
  await loadOpportunities();
  renderHomeSections();
  renderCatalog();
  renderOpportunityDetail();
}

initializeApp();
