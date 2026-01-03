const state = {
  apiBase: "/api",
  templates: [],
  templateDetails: new Map(),
  printers: [],
  selectedTemplateId: null,
  selectedPrinterId: null,
  labelPresets: [],
  labelColors: [],
  filters: {
    search: "",
    tags: new Set(),
  },
  activeTab: "print",
};

const elements = {
  printerSelect: document.getElementById("printerSelect"),
  printerMeta: document.getElementById("printerMeta"),
  printerRefresh: document.getElementById("printerRefresh"),
  shortcutsBtn: document.getElementById("shortcutsBtn"),
  closeShortcuts: document.getElementById("closeShortcuts"),
  shortcutDrawer: document.getElementById("shortcutDrawer"),
  tabs: document.querySelectorAll(".tab-btn"),
  printTab: document.getElementById("printTab"),
  printersTab: document.getElementById("printersTab"),
  templateGrid: document.getElementById("templateGrid"),
  templateDetail: document.getElementById("templateDetail"),
  tagFilters: document.getElementById("tagFilters"),
  searchInput: document.getElementById("searchInput"),
  clearSearch: document.getElementById("clearSearch"),
  printerGrid: document.getElementById("printerGrid"),
  addPrinterForm: document.getElementById("addPrinterForm"),
  toast: document.getElementById("toast"),
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

const escapeSelector =
  window.CSS && typeof window.CSS.escape === "function"
    ? window.CSS.escape
    : (value) => String(value).replace(/["\\]/g, "\\$&");

function toValueString(value) {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return "";
  }
  return String(value).replace(/\.0+$/, "");
}

function toSizeKey(width, height) {
  return `${formatNumber(width)}x${formatNumber(height)}`;
}

function parseLabelPresets(raw) {
  const fallback = ["74x26", "50x50", "50x30", "50x25", "40x30", "30x20"];
  const values = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
    ? raw.split(/[,;]/)
    : fallback;
  const parsed = values
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)
    .map((entry) => {
      const match = entry.match(/(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/);
      if (!match) {
        return null;
      }
      const width = Number(match[1]);
      const height = Number(match[2]);
      if (!Number.isFinite(width) || !Number.isFinite(height)) {
        return null;
      }
      const label = `${formatNumber(width)}x${formatNumber(height)}`;
      return { width, height, label, key: toSizeKey(width, height) };
    })
    .filter(Boolean);
  return parsed.length ? parsed : fallback.map((entry) => {
    const [width, height] = entry.split("x").map(Number);
    return { width, height, label: entry, key: entry };
  });
}

function initPresets() {
  state.labelPresets = parseLabelPresets(window.LG_LABEL_PRESETS);
}

function initLabelColors() {
  const fallback = ["white", "black", "transparent"];
  const raw = window.LG_LABEL_COLORS;
  const values = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
    ? raw.split(/[,;]/)
    : fallback;
  state.labelColors = values.map((entry) => String(entry || "").trim()).filter(Boolean);
  if (!state.labelColors.length) {
    state.labelColors = fallback;
  }
}

function getPresetForSize(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }
  return (
    state.labelPresets.find(
      (preset) =>
        Math.abs(preset.width - width) < 0.05 && Math.abs(preset.height - height) < 0.05
    ) || null
  );
}

function buildPresetOptions(selectedKey) {
  const base = ['<option value="">Select preset</option>'];
  state.labelPresets.forEach((preset) => {
    const isSelected = selectedKey && preset.key === selectedKey;
    base.push(
      `<option value="${escapeAttribute(preset.key)}"${isSelected ? " selected" : ""}>${
        preset.label
      } mm</option>`
    );
  });
  return base.join("");
}

function buildColorOptions(selectedValue) {
  if (!state.labelColors.length) {
    return "";
  }
  return state.labelColors
    .map((color) => {
      const selected = selectedValue === color;
      return `<option value="${escapeAttribute(color)}"${selected ? " selected" : ""}>${escapeHtml(
        color
      )}</option>`;
    })
    .join("");
}

function buildTypeOptions(selectedValue) {
  const types = ["thermal", "thermotransfer"];
  return types
    .map((labelType) => {
      const selected = selectedValue === labelType;
      return `<option value="${labelType}"${selected ? " selected" : ""}>${labelType}</option>`;
    })
    .join("");
}

function toDisplayList(items) {
  if (!Array.isArray(items)) {
    return [];
  }
  return items.map((item) => {
    if (item === null || item === undefined) {
      return "";
    }
    if (typeof item === "string") {
      return item;
    }
    return JSON.stringify(item);
  });
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 2500);
}

function normalizeBaseUrl(value) {
  if (!value) {
    return "/api";
  }
  return value.replace(/\/+$/, "");
}

function loadStoredJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

function saveStoredJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getSelectedPrinter() {
  return state.printers.find((printer) => printer.id === state.selectedPrinterId) || null;
}

function getSelectedTemplateDetail() {
  if (!state.selectedTemplateId) {
    return null;
  }
  return state.templateDetails.get(state.selectedTemplateId) || null;
}

async function apiFetch(path, options = {}) {
  const baseUrl = new URL(state.apiBase, window.location.origin);
  const basePath = baseUrl.pathname.replace(/\/$/, "");
  const nextPath = path.startsWith("/")
    ? `${basePath === "/" ? "" : basePath}${path}`
    : `${basePath === "/" ? "" : `${basePath}/`}${path}`;
  baseUrl.pathname = nextPath;
  const url = baseUrl;
  const headers = Object.assign({}, options.headers || {});
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(url, Object.assign({}, options, { headers }));
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

async function loadPrinters() {
  try {
    const data = await apiFetch("/v1/printers");
    state.printers = Array.isArray(data.printers) ? data.printers : [];
    const storedPrinter = localStorage.getItem("lg:selectedPrinter");
    const defaultPrinterId = storedPrinter || (state.printers[0] && state.printers[0].id);
    state.selectedPrinterId = defaultPrinterId || null;
    renderPrinterSelect();
    renderPrinterGrid();
    updatePrinterMeta();
    renderTemplateDetail();
  } catch (error) {
    showToast(`Failed to load printers: ${error.message}`);
  }
}

async function loadTemplates() {
  try {
    const data = await apiFetch("/v1/templates");
    state.templates = Array.isArray(data) ? data : [];
    renderTagFilters();
    renderTemplateGrid();
  } catch (error) {
    showToast(`Failed to load templates: ${error.message}`);
  }
}

async function loadTemplateDetail(templateId) {
  if (state.templateDetails.has(templateId)) {
    return state.templateDetails.get(templateId);
  }
  const detail = await apiFetch(`/v1/templates/${encodeURIComponent(templateId)}`);
  state.templateDetails.set(templateId, detail);
  return detail;
}

function renderPrinterSelect() {
  elements.printerSelect.innerHTML = "";
  if (!state.printers.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No printers available";
    elements.printerSelect.appendChild(option);
    return;
  }
  state.printers.forEach((printer) => {
    const option = document.createElement("option");
    option.value = printer.id;
    option.textContent = `${printer.name}`;
    if (printer.id === state.selectedPrinterId) {
      option.selected = true;
    }
    elements.printerSelect.appendChild(option);
  });
}

function updatePrinterMeta() {
  const printer = getSelectedPrinter();
  if (!printer) {
    elements.printerMeta.textContent = "Select a printer to view status and target info.";
    return;
  }
  const media = printer.media && printer.media.loaded ? printer.media.loaded : null;
  const alignment = printer.alignment || {};
  const mediaLine = media
    ? `${media.width_mm} x ${media.height_mm} mm, ${media.type} (${media.color})`
    : "No media loaded";
  const alignmentLine = alignment.dpi
    ? `${alignment.dpi} dpi, offset ${alignment.offset_x_mm || 0} x ${alignment.offset_y_mm || 0} mm`
    : "No alignment data";
  elements.printerMeta.textContent = `${mediaLine} | ${alignmentLine}`;
}

function renderTagFilters() {
  const tagSet = new Set();
  state.templates.forEach((template) => {
    (template.tags || []).forEach((tag) => tagSet.add(tag));
  });
  const tags = Array.from(tagSet).sort();
  elements.tagFilters.innerHTML = "";
  if (!tags.length) {
    return;
  }
  tags.forEach((tag) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tag-filter";
    if (state.filters.tags.has(tag)) {
      button.classList.add("active");
    }
    button.dataset.tag = tag;
    button.textContent = tag;
    elements.tagFilters.appendChild(button);
  });
}

function matchesFilters(template) {
  const search = state.filters.search.trim().toLowerCase();
  if (state.filters.tags.size) {
    const matchesTag = (template.tags || []).some((tag) => state.filters.tags.has(tag));
    if (!matchesTag) {
      return false;
    }
  }
  if (!search) {
    return true;
  }
  const variableNames = (template.variables || [])
    .map((variable) => variable.name || variable.label || "")
    .join(" ");
  const haystack = `${template.name || ""} ${(template.tags || []).join(" ")} ${variableNames}`.toLowerCase();
  return haystack.includes(search);
}

function renderTemplateGrid() {
  const filtered = state.templates.filter(matchesFilters);
  elements.templateGrid.innerHTML = "";
  if (!filtered.length) {
    elements.templateGrid.innerHTML = `
      <div class="empty-state">
        <h3>No matches</h3>
        <p>Try clearing filters or changing the search query.</p>
      </div>
    `;
    return;
  }
  filtered.forEach((template) => {
    const card = document.createElement("div");
    card.className = "template-card";
    if (template.id === state.selectedTemplateId) {
      card.classList.add("active");
    }
    card.dataset.templateId = template.id;
    const previewHtml = template.preview_available
      ? `<img src="${state.apiBase}/v1/templates/${encodeURIComponent(template.id)}/preview" alt="Preview for ${escapeHtml(template.name)}" />`
      : `<span class="template-meta">Preview unavailable</span>`;
    card.innerHTML = `
      <div class="template-preview">${previewHtml}</div>
      <div class="template-title">${escapeHtml(template.name || "Untitled template")}</div>
      <div class="template-tags">
        ${(template.tags || [])
          .map((tag) => `<span class="template-tag">${escapeHtml(tag)}</span>`)
          .join("")}
      </div>
      <div class="template-meta">${(template.variables || []).length} variables</div>
    `;
    elements.templateGrid.appendChild(card);
  });
}

function buildDefaultValues(detail) {
  const defaults = {};
  const sampleData = detail.sample_data || {};
  (detail.variables || []).forEach((variable) => {
    const name = variable.name || "";
    if (!name) {
      return;
    }
    if (variable.default !== undefined) {
      defaults[name] = toValueString(variable.default);
    } else if (sampleData[name] !== undefined) {
      defaults[name] = toValueString(sampleData[name]);
    } else if (variable.example !== undefined) {
      defaults[name] = toValueString(variable.example);
    } else {
      defaults[name] = "";
    }
  });
  return defaults;
}

function isOptionalVariable(variable) {
  return Boolean(variable.optional || variable.is_optional || variable.required === false);
}

function renderTemplateDetail() {
  const detail = getSelectedTemplateDetail();
  if (!state.selectedTemplateId) {
    elements.templateDetail.innerHTML = `
      <div class="empty-state">
        <h3>Select a template to print</h3>
        <p>Choose a template to see preview, variables, and fast print controls.</p>
      </div>
    `;
    return;
  }
  if (!detail) {
    elements.templateDetail.innerHTML = `
      <div class="empty-state">
        <h3>Loading template...</h3>
        <p>Fetching template details from the API.</p>
      </div>
    `;
    return;
  }
  const settingsKey = `lg:templateSettings:${detail.id}`;
  const settings = loadStoredJson(settingsKey, {});
  const defaults = buildDefaultValues(detail);
  const storedValues = loadStoredJson(`lg:variables:${detail.id}`, {});
  const variables = detail.variables || [];
  const printer = getSelectedPrinter();
  const previewHtml = detail.preview_available
    ? `<img src="${state.apiBase}/v1/templates/${encodeURIComponent(detail.id)}/preview" alt="Preview for ${escapeHtml(detail.name)}" />`
    : `<span class="template-meta">Preview unavailable</span>`;
  const targetInfo = detail.preview_target
    ? `${detail.preview_target.width_mm} x ${detail.preview_target.height_mm} mm @ ${detail.preview_target.dpi || 203} dpi`
    : "No template target";
  const printerTarget = printer && printer.media && printer.media.loaded
    ? `${printer.media.loaded.width_mm} x ${printer.media.loaded.height_mm} mm @ ${printer.alignment && printer.alignment.dpi ? printer.alignment.dpi : "?"} dpi`
    : "No printer media";
  const primaryVar = settings.primaryVariable || (variables[0] && variables[0].name) || "";
  const autoFocus = settings.autoFocus !== undefined ? settings.autoFocus : true;
  const useTemplateTarget = settings.useTemplateTarget || false;

  const variableRows = variables.length
    ? variables
        .map((variable) => {
          const name = variable.name || "";
          const label = variable.label || name || "Variable";
          const optional = isOptionalVariable(variable);
          const badgeClass = optional ? "optional" : "required";
          const badgeText = optional ? "Optional" : "Required";
          const hintParts = [];
          if (name && label !== name) {
            hintParts.push(`Name: ${name}`);
          }
          if (variable.description) {
            hintParts.push(variable.description);
          }
          return `
          <div class="variable-row">
            <div class="variable-meta">
              <span class="variable-label">${escapeHtml(label)}</span>
              <span class="badge ${badgeClass}">${badgeText}</span>
              ${hintParts.map((part) => `<span class="variable-hint">${escapeHtml(part)}</span>`).join("")}
            </div>
            <input class="input variable-input" type="text" data-var="${escapeAttribute(name)}" />
          </div>
        `;
        })
        .join("")
    : `
      <div class="empty-state">
        <p>No variables detected for this template.</p>
      </div>
    `;

  elements.templateDetail.innerHTML = `
    <div class="detail-header">
      <h3>${escapeHtml(detail.name || "Untitled template")}</h3>
      <div class="detail-tags">
        ${(detail.tags || []).map((tag) => `<span class="template-tag">${escapeHtml(tag)}</span>`).join("")}
      </div>
    </div>
    <div class="detail-section">
      <div class="section-title">Preview</div>
      <div class="template-preview">${previewHtml}</div>
    </div>
    <div class="detail-section">
      <div class="section-title">Rapid Entry</div>
      <div class="rapid-entry">
        <select id="rapidVariableSelect" class="select">
          ${variables
            .map((variable) => {
              const name = variable.name || "";
              return `<option value="${escapeAttribute(name)}">${escapeHtml(
                variable.label || name || "Variable"
              )}</option>`;
            })
            .join("")}
        </select>
        <input id="rapidVariableInput" class="input rapid-input" type="text" placeholder="Type once, print often" />
      </div>
      <div class="variable-hint">Use this field to change one value quickly between prints.</div>
    </div>
    <div class="detail-section">
      <div class="section-title">Variables</div>
      <div class="variable-grid">${variableRows}</div>
    </div>
    <div class="detail-section">
      <div class="section-title">Target</div>
      <div class="variable-hint">Printer media: ${escapeHtml(printerTarget)}</div>
      <div class="variable-hint">Template target: ${escapeHtml(targetInfo)}</div>
      <label class="toggle">
        <input id="useTemplateTarget" type="checkbox" ${useTemplateTarget ? "checked" : ""} />
        Use template target when printing
      </label>
    </div>
    <div class="detail-section">
      <div class="section-title">Print Controls</div>
      <div class="detail-actions">
        <button id="printBtn" class="primary">Print</button>
        <button id="resetDefaults" class="ghost" type="button">Reset defaults</button>
        <button id="clearOptional" class="ghost" type="button">Clear optional</button>
      </div>
      <label class="toggle">
        <input id="autoFocusToggle" type="checkbox" ${autoFocus ? "checked" : ""} />
        Focus rapid entry after print
      </label>
      <div id="printStatus" class="print-status">Ready to print.</div>
    </div>
  `;

  const variableInputs = elements.templateDetail.querySelectorAll(".variable-input");
  variableInputs.forEach((input) => {
    const varName = input.dataset.var;
    const defaultValue = defaults[varName] || "";
    const storedValue = storedValues[varName];
    const value =
      storedValue !== undefined && storedValue !== null ? toValueString(storedValue) : defaultValue;
    const touched = storedValue !== undefined && toValueString(storedValue) !== defaultValue;
    input.value = value;
    input.dataset.defaultValue = defaultValue;
    input.dataset.touched = touched ? "true" : "false";
    applyMutedState(input);
    input.addEventListener("input", () => {
      input.dataset.touched = "true";
      applyMutedState(input);
      persistVariableValues(detail.id);
      syncRapidInputValue();
    });
  });

  const rapidSelect = elements.templateDetail.querySelector("#rapidVariableSelect");
  const rapidInput = elements.templateDetail.querySelector("#rapidVariableInput");
  if (rapidSelect) {
    rapidSelect.value = primaryVar;
  }
  if (rapidInput) {
    rapidInput.addEventListener("input", () => {
      const variableInput = getVariableInput(rapidSelect.value);
      if (variableInput) {
        variableInput.value = rapidInput.value;
        variableInput.dataset.touched = "true";
        applyMutedState(variableInput);
        persistVariableValues(detail.id);
      }
    });
  }
  if (rapidSelect) {
    rapidSelect.addEventListener("change", () => {
      const newSettings = Object.assign({}, settings, { primaryVariable: rapidSelect.value });
      saveStoredJson(settingsKey, newSettings);
      syncRapidInputValue();
    });
  }

  const useTemplateTargetToggle = elements.templateDetail.querySelector("#useTemplateTarget");
  if (useTemplateTargetToggle) {
    useTemplateTargetToggle.addEventListener("change", () => {
      const newSettings = Object.assign({}, settings, {
        useTemplateTarget: useTemplateTargetToggle.checked,
      });
      saveStoredJson(settingsKey, newSettings);
    });
  }

  const autoFocusToggle = elements.templateDetail.querySelector("#autoFocusToggle");
  if (autoFocusToggle) {
    autoFocusToggle.addEventListener("change", () => {
      const newSettings = Object.assign({}, settings, { autoFocus: autoFocusToggle.checked });
      saveStoredJson(settingsKey, newSettings);
    });
  }

  const printBtn = elements.templateDetail.querySelector("#printBtn");
  if (printBtn) {
    printBtn.addEventListener("click", handlePrint);
  }

  const resetDefaults = elements.templateDetail.querySelector("#resetDefaults");
  if (resetDefaults) {
    resetDefaults.addEventListener("click", () => {
      variableInputs.forEach((input) => {
        const defaultValue = input.dataset.defaultValue || "";
        input.value = defaultValue;
        input.dataset.touched = "false";
        applyMutedState(input);
      });
      persistVariableValues(detail.id);
      syncRapidInputValue();
      showToast("Defaults restored.");
    });
  }

  const clearOptional = elements.templateDetail.querySelector("#clearOptional");
  if (clearOptional) {
    clearOptional.addEventListener("click", () => {
      variables.forEach((variable) => {
        if (!isOptionalVariable(variable)) {
          return;
        }
        const input = getVariableInput(variable.name || "");
        if (input) {
          input.value = "";
          input.dataset.touched = "true";
          applyMutedState(input);
        }
      });
      persistVariableValues(detail.id);
      syncRapidInputValue();
      showToast("Optional fields cleared.");
    });
  }

  function getVariableInput(name) {
    return elements.templateDetail.querySelector(
      `.variable-input[data-var="${escapeSelector(name)}"]`
    );
  }

  function syncRapidInputValue() {
    if (!rapidSelect || !rapidInput) {
      return;
    }
    const input = getVariableInput(rapidSelect.value);
    rapidInput.value = input ? input.value : "";
  }

  syncRapidInputValue();
}

function applyMutedState(input) {
  const defaultValue = input.dataset.defaultValue || "";
  const touched = input.dataset.touched === "true";
  const shouldMute = !touched && defaultValue !== "" && input.value === defaultValue;
  input.classList.toggle("muted-value", shouldMute);
}

function persistVariableValues(templateId) {
  const values = {};
  const variableInputs = elements.templateDetail.querySelectorAll(".variable-input");
  variableInputs.forEach((input) => {
    const name = input.dataset.var;
    if (name) {
      values[name] = input.value;
    }
  });
  saveStoredJson(`lg:variables:${templateId}`, values);
}

async function handlePrint() {
  const detail = getSelectedTemplateDetail();
  if (!detail) {
    showToast("Select a template before printing.");
    return;
  }
  const printer = getSelectedPrinter();
  if (!printer) {
    showToast("Select a printer before printing.");
    return;
  }
  const variables = {};
  const variableInputs = elements.templateDetail.querySelectorAll(".variable-input");
  variableInputs.forEach((input) => {
    const name = input.dataset.var;
    variables[name] = input.value;
  });
  const useTemplateTarget = Boolean(
    elements.templateDetail.querySelector("#useTemplateTarget")?.checked
  );
  const payload = {
    template: detail.template,
    variables: variables,
    debug: false,
    return_preview: false,
  };
  if (useTemplateTarget && detail.preview_target) {
    payload.target = detail.preview_target;
  }
  try {
    const response = await apiFetch(
      `/v1/printers/${encodeURIComponent(printer.id)}/prints/template`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
    const statusEl = elements.templateDetail.querySelector("#printStatus");
    if (statusEl) {
      statusEl.textContent = `Printed to ${response.printer_id}. Bytes sent: ${response.bytes_sent}.`;
    }
    showToast(`Printed on ${printer.name}.`);
    const settings = loadStoredJson(`lg:templateSettings:${detail.id}`, {});
    if (settings.autoFocus !== false) {
      focusRapidInput();
    }
  } catch (error) {
    const statusEl = elements.templateDetail.querySelector("#printStatus");
    if (statusEl) {
      statusEl.textContent = `Print failed: ${error.message}`;
    }
    showToast(`Print failed: ${error.message}`);
  }
}

function focusRapidInput() {
  const rapidInput = elements.templateDetail.querySelector("#rapidVariableInput");
  if (rapidInput) {
    rapidInput.focus();
    rapidInput.select();
  }
}

function renderPrinterGrid() {
  elements.printerGrid.innerHTML = "";
  if (!state.printers.length) {
    elements.printerGrid.innerHTML = `
      <div class="empty-state">
        <h3>No printers configured</h3>
        <p>Add printers to the backend config to manage them here.</p>
      </div>
    `;
    return;
  }
  state.printers.forEach((printer) => {
    const card = document.createElement("div");
    card.className = "printer-card";
    card.dataset.printerId = printer.id;
    const media = printer.media && printer.media.loaded ? printer.media.loaded : null;
    const loadedPreset = media ? getPresetForSize(media.width_mm, media.height_mm) : null;
    if (loadedPreset) {
      card.classList.add("active-preset");
    }
      const alignment = printer.alignment || {};
      const presetKey = loadedPreset ? loadedPreset.key : "";
      card.innerHTML = `
        <header>
          <div class="printer-title">${escapeHtml(printer.name)}</div>
          <div class="printer-sub">${escapeHtml(printer.vendor || "")} ${escapeHtml(
        printer.model || ""
      )}</div>
          <div class="printer-sub">${printer.enabled ? "Enabled" : "Disabled"}</div>
          <div class="status-meta" data-status-meta>Last status: not loaded</div>
        </header>
        <div class="printer-sub">${
          media
            ? `Media: ${media.width_mm} x ${media.height_mm} mm, ${media.type} (${media.color})${
                loadedPreset ? ` - Preset ${loadedPreset.label}` : ""
              }`
            : "Media: Not loaded"
        }</div>
      <div class="printer-sub">Alignment: ${alignment.dpi || "?"} dpi, offset ${
      alignment.offset_x_mm || 0
      } x ${alignment.offset_y_mm || 0} mm</div>
        <div class="printer-actions">
          <button class="ghost status-button" data-action="status">Fetch status</button>
        </div>
      <details>
        <summary class="ghost">Status details</summary>
        <div class="printer-status" data-status>
          <div class="status-empty">Fetch status to see printer details.</div>
        </div>
      </details>
        <details>
          <summary class="ghost">Edit loaded media</summary>
          <div class="printer-form">
            <label class="field-label">Preset size</label>
            <select class="select preset-select" data-role="printer-preset">
              ${buildPresetOptions(presetKey)}
            </select>
            <input class="input" type="number" step="0.1" data-field="width_mm" placeholder="Width (mm)" value="${
              media ? media.width_mm : ""
            }" />
            <input class="input" type="number" step="0.1" data-field="height_mm" placeholder="Height (mm)" value="${
              media ? media.height_mm : ""
            }" />
            <select class="select" data-field="type">
              ${buildTypeOptions(media ? media.type : "thermal")}
            </select>
            <select class="select" data-field="color">
              ${buildColorOptions(media ? media.color : state.labelColors[0])}
            </select>
            <div class="variable-hint">Select a preset or enter a custom size.</div>
            <button class="primary" data-action="save">Save media settings</button>
          </div>
        </details>
      `;
    elements.printerGrid.appendChild(card);
  });
}

function renderStatusSection(title, data) {
  const section = document.createElement("div");
  section.className = "status-section";
  const titleEl = document.createElement("div");
  titleEl.className = "status-title";
  titleEl.textContent = title;
  section.appendChild(titleEl);

  if (data === null || data === undefined) {
    const empty = document.createElement("div");
    empty.className = "status-empty";
    empty.textContent = "No data available.";
    section.appendChild(empty);
    return section;
  }

  if (typeof data !== "object") {
    const value = document.createElement("div");
    value.className = "status-value";
    value.textContent = String(data);
    section.appendChild(value);
    return section;
  }

  if (Array.isArray(data)) {
    if (!data.length) {
      const empty = document.createElement("div");
      empty.className = "status-empty";
      empty.textContent = "No data available.";
      section.appendChild(empty);
      return section;
    }
    const list = document.createElement("ul");
    list.className = "status-list";
    data.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = typeof item === "string" ? item : JSON.stringify(item);
      list.appendChild(li);
    });
    section.appendChild(list);
    return section;
  }

  if (!Object.keys(data).length) {
    const empty = document.createElement("div");
    empty.className = "status-empty";
    empty.textContent = "No data available.";
    section.appendChild(empty);
    return section;
  }

  const grid = document.createElement("div");
  grid.className = "status-grid";
  Object.entries(data).forEach(([key, value]) => {
    const label = document.createElement("div");
    label.className = "status-label";
    label.textContent = key.replace(/_/g, " ");
    const val = document.createElement("div");
    val.className = "status-value";
    if (typeof value === "boolean") {
      val.textContent = value ? "Yes" : "No";
    } else if (value === null || value === undefined) {
      val.textContent = "-";
    } else if (Array.isArray(value)) {
      val.textContent = value.length ? value.join(", ") : "-";
    } else if (typeof value === "object") {
      val.textContent = JSON.stringify(value);
    } else {
      val.textContent = String(value);
    }
    grid.appendChild(label);
    grid.appendChild(val);
  });
  section.appendChild(grid);
  return section;
}

function renderBadgeRow(title, items, tone) {
  const section = document.createElement("div");
  section.className = "status-section";
  const titleEl = document.createElement("div");
  titleEl.className = "status-title";
  titleEl.textContent = title;
  section.appendChild(titleEl);

  const list = toDisplayList(items);
  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "status-empty";
    empty.textContent = "None";
    section.appendChild(empty);
    return section;
  }

  const badges = document.createElement("div");
  badges.className = "status-badges";
  list.forEach((item) => {
    const badge = document.createElement("span");
    badge.className = `status-badge ${tone}`;
    badge.textContent = item;
    badges.appendChild(badge);
  });
  section.appendChild(badges);
  return section;
}

function formatFieldValue(field) {
  if (!field || typeof field !== "object") {
    return "-";
  }
  const rawValue = field.value;
  const intValue = field.value_int;
  if ((rawValue === null || rawValue === undefined || rawValue === "") && intValue !== undefined) {
    return String(intValue);
  }
  if (intValue !== undefined && rawValue !== undefined && rawValue !== null) {
    const rawText = String(rawValue);
    if (rawText !== String(intValue)) {
      return `${rawText} (${intValue})`;
    }
  }
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return "-";
  }
  return String(rawValue);
}

function renderHostStatus(lines) {
  const section = document.createElement("div");
  section.className = "status-section";
  const titleEl = document.createElement("div");
  titleEl.className = "status-title";
  titleEl.textContent = "Host status";
  section.appendChild(titleEl);

  if (!Array.isArray(lines) || !lines.length) {
    const empty = document.createElement("div");
    empty.className = "status-empty";
    empty.textContent = "No host status lines.";
    section.appendChild(empty);
    return section;
  }

  lines.forEach((line, index) => {
    const lineBlock = document.createElement("div");
    lineBlock.className = "status-line";
    const lineTitle = document.createElement("div");
    lineTitle.className = "status-line-title";
    lineTitle.textContent =
      line.label || line.name || line.section || line.id || `Line ${index + 1}`;
    lineBlock.appendChild(lineTitle);

    const fields = Array.isArray(line.fields) ? line.fields : [];
    if (!fields.length) {
      const empty = document.createElement("div");
      empty.className = "status-empty";
      empty.textContent = "No fields.";
      lineBlock.appendChild(empty);
      section.appendChild(lineBlock);
      return;
    }

    const grid = document.createElement("div");
    grid.className = "status-grid status-table";
    fields.forEach((field) => {
      const label = document.createElement("div");
      label.className = "status-label";
      label.textContent = field.label || field.name || field.key || "-";
      const val = document.createElement("div");
      val.className = "status-value";
      val.textContent = formatFieldValue(field);
      grid.appendChild(label);
      grid.appendChild(val);
    });
    lineBlock.appendChild(grid);
    section.appendChild(lineBlock);
  });

  return section;
}

function renderSummary(normalized) {
  const summary = normalized && normalized.summary ? normalized.summary : null;
  if (!summary) {
    return null;
  }

  const section = document.createElement("div");
  section.className = "status-section";
  const titleEl = document.createElement("div");
  titleEl.className = "status-title";
  titleEl.textContent = "Summary";
  section.appendChild(titleEl);

  const grid = document.createElement("div");
  grid.className = "status-grid";
  const fields = [
    ["Model", summary.model],
    ["Firmware", summary.firmware],
    ["Dots/mm", summary.dpmm],
    ["Memory", summary.memory],
  ];

  fields.forEach(([labelText, value]) => {
    const label = document.createElement("div");
    label.className = "status-label";
    label.textContent = labelText;
    const val = document.createElement("div");
    val.className = "status-value";
    if (value === null || value === undefined || value === "") {
      val.textContent = "-";
    } else if (typeof value === "object") {
      val.textContent = JSON.stringify(value);
    } else {
      val.textContent = String(value);
    }
    grid.appendChild(label);
    grid.appendChild(val);
  });

  section.appendChild(grid);

  const errors = summary.errors || summary.error_flags;
  const warnings = summary.warnings || summary.warning_flags;
  section.appendChild(renderBadgeRow("Errors", errors, "error"));
  section.appendChild(renderBadgeRow("Warnings", warnings, "warning"));
  return section;
}

function renderNormalizedStatus(normalized) {
  const wrapper = document.createElement("div");
  wrapper.className = "status-normalized";

  const summarySection = renderSummary(normalized);
  if (summarySection) {
    wrapper.appendChild(summarySection);
  }

  if (normalized && normalized.host_status && normalized.host_status.lines) {
    wrapper.appendChild(renderHostStatus(normalized.host_status.lines));
  }

  if (normalized && normalized.host_inventory) {
    wrapper.appendChild(
      renderBadgeRow("Inventory errors", normalized.host_inventory.errors, "error")
    );
    wrapper.appendChild(
      renderBadgeRow("Inventory warnings", normalized.host_inventory.warnings, "warning")
    );
  }

  return wrapper;
}

async function fetchPrinterStatus(printerId, card) {
  const statusEl = card.querySelector("[data-status]");
  const statusMeta = card.querySelector("[data-status-meta]");
  const statusButton = card.querySelector(".status-button");
  if (statusEl) {
    statusEl.textContent = "Loading status...";
  }
  if (statusButton) {
    statusButton.textContent = "Loading...";
    statusButton.disabled = true;
    statusButton.classList.add("loading");
  }
  try {
    const status = await apiFetch(`/v1/printers/${encodeURIComponent(printerId)}/status`);
    if (statusEl) {
      statusEl.innerHTML = "";
      if (status.normalized) {
        statusEl.appendChild(renderNormalizedStatus(status.normalized));
      } else {
        statusEl.appendChild(renderStatusSection("Parsed status", status.parsed));
      }

      const debugDetails = document.createElement("details");
      debugDetails.className = "status-debug";
      const summary = document.createElement("summary");
      summary.className = "ghost";
      summary.textContent = "Debug raw and parsed";
      debugDetails.appendChild(summary);
      debugDetails.appendChild(renderStatusSection("Parsed status", status.parsed));
      debugDetails.appendChild(renderStatusSection("Raw status", status.raw));
      statusEl.appendChild(debugDetails);
    }
    if (statusMeta) {
      const now = new Date();
      statusMeta.textContent = `Last status: ${now.toLocaleTimeString()}`;
    }
    const details = card.querySelector("details");
    if (details) {
      details.open = true;
    }
    showToast("Status updated.");
  } catch (error) {
    if (statusEl) {
      statusEl.textContent = `Failed to load status: ${error.message}`;
    }
    showToast(`Status failed: ${error.message}`);
  } finally {
    if (statusButton) {
      statusButton.textContent = "Refresh status";
      statusButton.disabled = false;
      statusButton.classList.remove("loading");
    }
  }
}

async function savePrinterMedia(printerId, card) {
  const printer = state.printers.find((item) => item.id === printerId);
  if (!printer) {
    return;
  }
  const widthInput = card.querySelector('[data-field="width_mm"]');
  const heightInput = card.querySelector('[data-field="height_mm"]');
  const typeInput = card.querySelector('[data-field="type"]');
  const colorInput = card.querySelector('[data-field="color"]');
  const updated = JSON.parse(JSON.stringify(printer));
  updated.media = updated.media || {};
  updated.media.loaded = updated.media.loaded || {};
  updated.media.loaded.width_mm = Number(widthInput.value) || updated.media.loaded.width_mm;
  updated.media.loaded.height_mm = Number(heightInput.value) || updated.media.loaded.height_mm;
  updated.media.loaded.type = typeInput.value || updated.media.loaded.type;
  updated.media.loaded.color = colorInput.value || updated.media.loaded.color;
  try {
    await apiFetch(`/v1/printers/${encodeURIComponent(printerId)}`, {
      method: "PUT",
      body: JSON.stringify(updated),
    });
    showToast("Printer media updated.");
    await loadPrinters();
  } catch (error) {
    showToast(`Update failed: ${error.message}`);
  }
}

function setActiveTab(tabName) {
  state.activeTab = tabName;
  elements.tabs.forEach((tab) => {
    const isActive = tab.dataset.tab === tabName;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  elements.printTab.classList.toggle("active", tabName === "print");
  elements.printersTab.classList.toggle("active", tabName === "printers");
  elements.printersTab.setAttribute("aria-hidden", tabName === "printers" ? "false" : "true");
  elements.printTab.setAttribute("aria-hidden", tabName === "print" ? "false" : "true");
}

function focusNextVariable(step) {
  const inputs = Array.from(elements.templateDetail.querySelectorAll(".variable-input"));
  if (!inputs.length) {
    return;
  }
  const active = document.activeElement;
  const currentIndex = inputs.indexOf(active);
  let nextIndex = 0;
  if (currentIndex >= 0) {
    nextIndex = (currentIndex + step + inputs.length) % inputs.length;
  }
  inputs[nextIndex].focus();
  inputs[nextIndex].select();
}

function applyPresetToInputs(presetKey, widthInput, heightInput) {
  if (!presetKey) {
    return;
  }
  const preset = state.labelPresets.find((item) => item.key === presetKey);
  if (!preset) {
    return;
  }
  if (widthInput) {
    widthInput.value = preset.width;
  }
  if (heightInput) {
    heightInput.value = preset.height;
  }
}

async function handleAddPrinter(event) {
  event.preventDefault();
  const form = event.target;
  const getValue = (name) => form.elements[name]?.value?.trim() || "";
  const getNumber = (name, fallback) => {
    const raw = getValue(name);
    if (!raw && fallback !== undefined) {
      return fallback;
    }
    const num = Number(raw);
    return Number.isFinite(num) ? num : null;
  };
  const getChecked = (name) => Boolean(form.elements[name]?.checked);

  const id = getValue("id");
  const name = getValue("name");
  const vendor = getValue("vendor");
  const model = getValue("model");
  const driver = getValue("driver");
  const protocol = getValue("protocol");
  const host = getValue("host");
  const port = getNumber("port");
  const timeoutMs = getNumber("timeout_ms");
  const width = getNumber("width_mm");
  const height = getNumber("height_mm");
  const mediaType = getValue("media_type");
  const mediaColor = getValue("media_color");
  const dpi = getNumber("dpi", 203);
  const offsetX = getNumber("offset_x_mm", 0) ?? 0;
  const offsetY = getNumber("offset_y_mm", 0) ?? 0;
  const darkness = getNumber("darkness");
  const printSpeed = getNumber("print_speed");
  const printMode = getValue("print_mode");
  const copies = getNumber("copies", 1);
  const rotation = getNumber("rotation", 0);

  if (!id || !name || !vendor || !model || !driver || !protocol || !host) {
    showToast("Fill in all required text fields.");
    return;
  }
  if (![port, timeoutMs, width, height, dpi, darkness, printSpeed, copies, rotation].every(Number.isFinite)) {
    showToast("Provide valid numeric values for required fields.");
    return;
  }

  const payload = {
    id,
    name,
    model,
    vendor,
    driver,
    connection: {
      protocol,
      host,
      port,
      timeout_ms: timeoutMs,
    },
    media: {
      loaded: {
        width_mm: width,
        height_mm: height,
        color: mediaColor,
        type: mediaType,
      },
    },
    alignment: {
      dpi,
      offset_x_mm: offsetX,
      offset_y_mm: offsetY,
    },
    zpl: {
      darkness,
      print_speed: printSpeed,
    },
    defaults: {
      copies,
      rotation,
    },
    capabilities: {
      supports_status: getChecked("supports_status"),
      supports_graphics: getChecked("supports_graphics"),
      supports_cut: getChecked("supports_cut"),
    },
    enabled: getChecked("enabled"),
  };

  if (printMode) {
    payload.zpl.print_mode = printMode;
  }

  try {
    await apiFetch(`/v1/printers/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    showToast("Printer added.");
    form.reset();
    const presetSelect = form.querySelector(".preset-select");
    if (presetSelect) {
      presetSelect.value = "";
    }
    await loadPrinters();
  } catch (error) {
    showToast(`Add failed: ${error.message}`);
  }
}

function attachEvents() {
  elements.printerSelect.addEventListener("change", (event) => {
    state.selectedPrinterId = event.target.value;
    localStorage.setItem("lg:selectedPrinter", state.selectedPrinterId || "");
    updatePrinterMeta();
    renderTemplateDetail();
  });

  elements.printerRefresh.addEventListener("click", () => {
    loadPrinters();
  });

  elements.searchInput.addEventListener("input", (event) => {
    state.filters.search = event.target.value;
    renderTemplateGrid();
  });

  elements.clearSearch.addEventListener("click", () => {
    state.filters.search = "";
    elements.searchInput.value = "";
    renderTemplateGrid();
  });

  elements.tagFilters.addEventListener("click", (event) => {
    const target = event.target.closest(".tag-filter");
    if (!target) {
      return;
    }
    const tag = target.dataset.tag;
    if (state.filters.tags.has(tag)) {
      state.filters.tags.delete(tag);
    } else {
      state.filters.tags.add(tag);
    }
    renderTagFilters();
    renderTemplateGrid();
  });

  elements.templateGrid.addEventListener("click", async (event) => {
    const card = event.target.closest(".template-card");
    if (!card) {
      return;
    }
    const templateId = card.dataset.templateId;
    if (!templateId) {
      return;
    }
    state.selectedTemplateId = templateId;
    renderTemplateGrid();
    renderTemplateDetail();
    try {
      await loadTemplateDetail(templateId);
      renderTemplateDetail();
    } catch (error) {
      showToast(`Failed to load template: ${error.message}`);
    }
  });

  elements.printerGrid.addEventListener("click", (event) => {
    const action = event.target.dataset.action;
    if (!action) {
      return;
    }
    const card = event.target.closest(".printer-card");
    if (!card) {
      return;
    }
    const printerId = card.dataset.printerId;
    if (action === "status") {
      fetchPrinterStatus(printerId, card);
    }
    if (action === "save") {
      savePrinterMedia(printerId, card);
    }
  });

  elements.printerGrid.addEventListener("change", (event) => {
    const select = event.target.closest('[data-role="printer-preset"]');
    if (!select) {
      return;
    }
    const card = event.target.closest(".printer-card");
    if (!card) {
      return;
    }
    const widthInput = card.querySelector('[data-field="width_mm"]');
    const heightInput = card.querySelector('[data-field="height_mm"]');
    applyPresetToInputs(select.value, widthInput, heightInput);
  });

  if (elements.addPrinterForm) {
    elements.addPrinterForm.addEventListener("submit", handleAddPrinter);
    const presetSelect = elements.addPrinterForm.querySelector(".preset-select");
    presetSelect?.addEventListener("change", (event) => {
      const widthInput = elements.addPrinterForm.querySelector('[name="width_mm"]');
      const heightInput = elements.addPrinterForm.querySelector('[name="height_mm"]');
      applyPresetToInputs(event.target.value, widthInput, heightInput);
    });
  }

  elements.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      setActiveTab(tab.dataset.tab);
    });
  });

  elements.shortcutsBtn.addEventListener("click", () => {
    elements.shortcutDrawer.classList.add("active");
    elements.shortcutDrawer.setAttribute("aria-hidden", "false");
  });

  elements.closeShortcuts.addEventListener("click", () => {
    elements.shortcutDrawer.classList.remove("active");
    elements.shortcutDrawer.setAttribute("aria-hidden", "true");
  });

  elements.shortcutDrawer.addEventListener("click", (event) => {
    if (event.target === elements.shortcutDrawer) {
      elements.shortcutDrawer.classList.remove("active");
      elements.shortcutDrawer.setAttribute("aria-hidden", "true");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      elements.shortcutDrawer.classList.remove("active");
      elements.shortcutDrawer.setAttribute("aria-hidden", "true");
    }
    if (event.ctrlKey && event.key === "Enter") {
      event.preventDefault();
      if (state.activeTab === "print") {
        handlePrint();
      }
    }
    if (event.altKey && event.key.toLowerCase() === "f") {
      event.preventDefault();
      elements.searchInput.focus();
    }
    if (event.altKey && event.key === "1") {
      event.preventDefault();
      setActiveTab("print");
    }
    if (event.altKey && event.key === "2") {
      event.preventDefault();
      setActiveTab("printers");
    }
    if (event.altKey && event.key === "ArrowDown") {
      event.preventDefault();
      focusNextVariable(1);
    }
    if (event.altKey && event.key === "ArrowUp") {
      event.preventDefault();
      focusNextVariable(-1);
    }
  });
}

function init() {
  const configuredBase =
    typeof window.LG_API_BASE === "string" && window.LG_API_BASE.trim()
      ? window.LG_API_BASE
      : state.apiBase;
  state.apiBase = normalizeBaseUrl(configuredBase);
  initPresets();
  initLabelColors();
  if (elements.addPrinterForm) {
    const presetSelect = elements.addPrinterForm.querySelector(".preset-select");
    if (presetSelect) {
      presetSelect.innerHTML = buildPresetOptions("");
    }
    const colorSelect = elements.addPrinterForm.querySelector('[name="media_color"]');
    if (colorSelect) {
      colorSelect.innerHTML = buildColorOptions(state.labelColors[0]);
    }
    const typeSelect = elements.addPrinterForm.querySelector('[name="media_type"]');
    if (typeSelect) {
      typeSelect.innerHTML = buildTypeOptions("thermal");
    }
  }
  attachEvents();
  loadPrinters();
  loadTemplates();
}

init();












