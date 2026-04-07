#!/usr/bin/env node
import fs from "fs";
import path from "path";

const DEFAULT_ROOT = "evaluation docs/Generated Data";
const DEFAULT_EXPECTED_TESTCASES = 24;

function parseArgs(argv) {
  const args = {
    root: DEFAULT_ROOT,
    expectedTestcases: DEFAULT_EXPECTED_TESTCASES,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--root" && next) {
      args.root = next;
      i += 1;
      continue;
    }
    if (arg === "--expectedTestcases" && next) {
      args.expectedTestcases =
        Number.parseInt(next, 10) || DEFAULT_EXPECTED_TESTCASES;
      i += 1;
      continue;
    }
  }

  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function parseCsvRows(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const values = splitCsvLine(lines[i]);
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || "";
    });
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  values.push(current);
  return values;
}

function normalizeModelName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function collectModelDirs(rootPath) {
  return fs
    .readdirSync(rootPath, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        entry.name !== "deterministic_eval" &&
        fs.existsSync(path.join(rootPath, entry.name, "all_testcase_json")),
    )
    .map((entry) => entry.name)
    .sort();
}

function validate() {
  const args = parseArgs(process.argv);
  const rootPath = path.resolve(args.root);
  const errors = [];
  const warnings = [];

  if (!fs.existsSync(rootPath)) {
    throw new Error(`Generated data root not found: ${rootPath}`);
  }

  const modelNames = collectModelDirs(rootPath);
  if (modelNames.length === 0) {
    throw new Error(
      `No model directories with all_testcase_json found under: ${rootPath}`,
    );
  }

  const expectedIds = new Set(
    Array.from({ length: args.expectedTestcases }, (_, idx) =>
      `TC${String(idx + 1).padStart(2, "0")}`,
    ),
  );

  const modelRunKeySet = new Set();

  for (const modelName of modelNames) {
    const modelDir = path.join(rootPath, modelName);
    const jsonDir = path.join(modelDir, "all_testcase_json");
    const metricsCsvPath = path.join(modelDir, "all_testcases_metrics.csv");

    const jsonFiles = fs
      .readdirSync(jsonDir)
      .filter((name) => name.endsWith(".json") && !name.includes(":Zone.Identifier"))
      .sort();

    if (jsonFiles.length !== args.expectedTestcases) {
      errors.push(
        `[${modelName}] expected ${args.expectedTestcases} JSON files, found ${jsonFiles.length}`,
      );
    }

    const jsonIds = new Set();
    for (const fileName of jsonFiles) {
      const run = readJson(path.join(jsonDir, fileName));
      const testcaseId = String(run?.testcase?.id || "").trim();
      if (!testcaseId) {
        errors.push(`[${modelName}] missing testcase.id in ${fileName}`);
        continue;
      }
      jsonIds.add(testcaseId);
      modelRunKeySet.add(`${normalizeModelName(modelName)}::${testcaseId}`);
    }

    const missingInJson = [...expectedIds].filter((id) => !jsonIds.has(id));
    if (missingInJson.length > 0) {
      errors.push(
        `[${modelName}] missing testcase JSON IDs: ${missingInJson.join(", ")}`,
      );
    }

    if (!fs.existsSync(metricsCsvPath)) {
      errors.push(`[${modelName}] missing metrics CSV: all_testcases_metrics.csv`);
      continue;
    }

    const metricRows = parseCsvRows(metricsCsvPath);
    if (metricRows.length !== args.expectedTestcases) {
      errors.push(
        `[${modelName}] expected ${args.expectedTestcases} metrics rows, found ${metricRows.length}`,
      );
    }

    const metricIds = new Set(metricRows.map((row) => String(row.testcase_id || "").trim()).filter(Boolean));
    const missingInMetrics = [...expectedIds].filter((id) => !metricIds.has(id));
    if (missingInMetrics.length > 0) {
      errors.push(
        `[${modelName}] missing testcase metrics IDs: ${missingInMetrics.join(", ")}`,
      );
    }
  }

  const deterministicDir = path.join(rootPath, "deterministic_eval");
  const perRunPath = path.join(deterministicDir, "escaped_normalization_eval_per_run.csv");
  const perModelPath = path.join(deterministicDir, "escaped_normalization_eval_per_model.csv");

  if (!fs.existsSync(perRunPath)) {
    errors.push("Missing deterministic per-run CSV. Run: npm run eval:normalized");
  } else {
    const perRunRows = parseCsvRows(perRunPath);
    if (perRunRows.length !== modelNames.length * args.expectedTestcases) {
      errors.push(
        `[deterministic] expected ${modelNames.length * args.expectedTestcases} per-run rows, found ${perRunRows.length}`,
      );
    }

    const perRunKeySet = new Set(
      perRunRows.map((row) => {
        const model = normalizeModelName(row.model);
        const testcaseId = String(row.testcase_id || "").trim();
        return `${model}::${testcaseId}`;
      }),
    );

    for (const key of modelRunKeySet) {
      if (!perRunKeySet.has(key)) {
        errors.push(`[deterministic] missing per-run row for ${key}`);
      }
    }
  }

  if (!fs.existsSync(perModelPath)) {
    errors.push(
      "Missing deterministic per-model CSV. Run: npm run eval:normalized",
    );
  } else {
    const perModelRows = parseCsvRows(perModelPath);
    if (perModelRows.length !== modelNames.length) {
      errors.push(
        `[deterministic] expected ${modelNames.length} per-model rows, found ${perModelRows.length}`,
      );
    }
  }

  console.log(`Models detected: ${modelNames.join(", ")}`);
  console.log(`Expected testcases per model: ${args.expectedTestcases}`);
  if (warnings.length > 0) {
    console.log("\nWarnings:");
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
  }

  if (errors.length > 0) {
    console.error("\nValidation FAILED:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log("\nValidation PASSED.");
}

validate();

