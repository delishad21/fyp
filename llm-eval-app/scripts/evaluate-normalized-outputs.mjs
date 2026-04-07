#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

function parseArgs(argv) {
  const args = {
    root: 'evaluation docs/Generated Data',
    outDir: 'evaluation docs/Generated Data/deterministic_eval',
    expectedQuizzes: 5,
    expectedQuestions: 10,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--root' && next) {
      args.root = next;
      i += 1;
    } else if (arg === '--outDir' && next) {
      args.outDir = next;
      i += 1;
    } else if (arg === '--expectedQuizzes' && next) {
      args.expectedQuizzes = Number(next) || args.expectedQuizzes;
      i += 1;
    } else if (arg === '--expectedQuestions' && next) {
      args.expectedQuestions = Number(next) || args.expectedQuestions;
      i += 1;
    }
  }

  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function toCsv(rows) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value) => {
    const raw = value === undefined || value === null ? '' : String(value);
    if (raw.includes('"') || raw.includes(',') || raw.includes('\n')) {
      return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
  };

  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => escape(row[header])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function isZoneIdentifier(name) {
  return name.includes(':Zone.Identifier');
}

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'is',
  'are',
  'was',
  'were',
  'to',
  'of',
  'in',
  'on',
  'for',
  'with',
  'by',
  'at',
  'from',
  'as',
  'that',
  'this',
  'these',
  'those',
  'be',
  'it',
  'its',
  'their',
  'there',
  'into',
  'do',
  'does',
  'did',
  'can',
  'could',
  'would',
  'should',
  'your',
  'you',
]);

function normalizeStem(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeForSimilarity(text) {
  const normalized = normalizeStem(text);
  const tokens = normalized
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
  if (tokens.length > 0) return tokens;
  return normalized ? [normalized] : [];
}

function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const v of setA) {
    if (setB.has(v)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function classifyIntent(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(explain|describe|why|how|reason|justify|discuss)\b/.test(t)) return 'reasoning';
  if (/\b(compare|contrast|difference|similar)\b/.test(t)) return 'compare';
  if (/\b(calculate|solve|work out|evaluate|find)\b/.test(t)) return 'procedure';
  if (/\b(list|name|state|identify|give)\b/.test(t)) return 'listing';
  if (/\b(what|which|who|when|where|true|false)\b/.test(t)) return 'recall';
  return 'application';
}

function extractQuestionPrompts(quizzes) {
  const prompts = [];

  for (const quiz of quizzes) {
    const quizType = String(quiz?.quizType || '').trim();
    if (quizType === 'crossword') {
      const entries = Array.isArray(quiz?.entries) ? quiz.entries : [];
      for (const entry of entries) {
        const clue = String(entry?.clue || '').trim();
        if (clue) prompts.push(clue);
      }
      continue;
    }

    const items = Array.isArray(quiz?.items) ? quiz.items : [];
    for (const item of items) {
      if (String(item?.type || '').trim() === 'context') continue;
      const text = String(item?.text || '').trim();
      if (text) prompts.push(text);
    }
  }

  return prompts;
}

function computeVarietyMetrics(quizzes) {
  const prompts = extractQuestionPrompts(quizzes);
  const n = prompts.length;
  if (n === 0) {
    return {
      questionCount: 0,
      uniqueStemRatioPct: 0,
      distinctnessPct: 0,
      intentCoveragePct: 0,
      scorePct: 0,
    };
  }

  const normalizedStems = prompts.map((p) => normalizeStem(p));
  const uniqueStemRatio = new Set(normalizedStems).size / n;

  const tokenSets = prompts.map((p) => new Set(tokenizeForSimilarity(p)));
  let maxSimSum = 0;
  for (let i = 0; i < tokenSets.length; i += 1) {
    let maxSim = 0;
    for (let j = 0; j < tokenSets.length; j += 1) {
      if (i === j) continue;
      const sim = jaccardSimilarity(tokenSets[i], tokenSets[j]);
      if (sim > maxSim) maxSim = sim;
    }
    maxSimSum += maxSim;
  }
  const avgMaxSimilarity = n > 1 ? maxSimSum / n : 0;
  const distinctness = 1 - avgMaxSimilarity;

  const intentLabels = prompts.map((p) => classifyIntent(p));
  const intentCoverage = new Set(intentLabels).size / 6; // 6 intent buckets

  const score =
    uniqueStemRatio * 0.45 +
    distinctness * 0.35 +
    intentCoverage * 0.2;

  return {
    questionCount: n,
    uniqueStemRatioPct: Number((uniqueStemRatio * 100).toFixed(4)),
    distinctnessPct: Number((distinctness * 100).toFixed(4)),
    intentCoveragePct: Number((Math.min(1, intentCoverage) * 100).toFixed(4)),
    scorePct: Number((Math.max(0, Math.min(1, score)) * 100).toFixed(4)),
  };
}

const VIOLATION_KEYS = [
  'run_quiz_count_mismatch',
  'quiz_question_count_mismatch',
  'mc_option_count_invalid',
  'mc_correct_count_invalid',
  'open_missing_answers',
  'open_exact_missing_text',
  'open_keywords_invalid',
  'open_list_invalid',
  'context_missing_text',
  'crossword_grid_missing',
  'crossword_entry_invalid',
];

function createViolationBucket() {
  return Object.fromEntries(VIOLATION_KEYS.map((key) => [key, 0]));
}

function evaluateRun(data, modelName, fileName, config) {
  const violations = createViolationBucket();
  let checks = 0;

  const fail = (key) => {
    violations[key] += 1;
  };

  const check = (condition, key) => {
    checks += 1;
    if (!condition) fail(key);
  };

  const testcase = data?.testcase || {};
  const quizzes = Array.isArray(data?.quizzes) ? data.quizzes : [];

  check(quizzes.length === config.expectedQuizzes, 'run_quiz_count_mismatch');

  for (const quiz of quizzes) {
    const quizType = String(quiz?.quizType || '').trim();

    if (quizType === 'crossword') {
      const entries = Array.isArray(quiz?.entries) ? quiz.entries : [];
      const grid = Array.isArray(quiz?.grid) ? quiz.grid : [];
      check(entries.length === config.expectedQuestions, 'quiz_question_count_mismatch');
      check(grid.length > 0, 'crossword_grid_missing');

      for (const entry of entries) {
        const answer = String(entry?.answer || '').trim();
        const clue = String(entry?.clue || '').trim();
        check(Boolean(answer) && Boolean(clue), 'crossword_entry_invalid');
      }

      continue;
    }

    const items = Array.isArray(quiz?.items) ? quiz.items : [];
    check(items.length === config.expectedQuestions, 'quiz_question_count_mismatch');

    for (const item of items) {
      const itemType = String(item?.type || '').trim();

      if (itemType === 'mc') {
        const options = Array.isArray(item?.options) ? item.options : [];
        const correctCount = options.filter((o) => o?.correct === true).length;
        check(options.length >= 2, 'mc_option_count_invalid');
        check(correctCount >= 1, 'mc_correct_count_invalid');
      } else if (itemType === 'open') {
        const answers = Array.isArray(item?.answers) ? item.answers : [];
        check(answers.length > 0, 'open_missing_answers');

        for (const answer of answers) {
          const answerType = String(answer?.answerType || '').trim().toLowerCase();

          if (answerType === 'exact') {
            check(Boolean(String(answer?.text || '').trim()), 'open_exact_missing_text');
          }

          if (answerType === 'keywords') {
            const keywords = Array.isArray(answer?.keywords)
              ? answer.keywords.map((v) => String(v || '').trim()).filter(Boolean)
              : [];
            const minKeywords = Number(answer?.minKeywords || 0);
            check(keywords.length > 0 && minKeywords >= 1 && minKeywords <= keywords.length, 'open_keywords_invalid');
          }

          if (answerType === 'list') {
            const listItems = Array.isArray(answer?.listItems)
              ? answer.listItems.map((v) => String(v || '').trim()).filter(Boolean)
              : [];
            const minCorrectItems = Number(answer?.minCorrectItems || 0);
            check(listItems.length > 0 && minCorrectItems >= 1 && minCorrectItems <= listItems.length, 'open_list_invalid');
          }
        }
      } else if (itemType === 'context') {
        check(Boolean(String(item?.text || '').trim()), 'context_missing_text');
      }
    }
  }

  const errorCount = Object.values(violations).reduce((sum, v) => sum + v, 0);
  const errorRatePct = checks > 0 ? (errorCount / checks) * 100 : 0;
  const escapeScorePct = Math.max(0, 100 - errorRatePct);
  const variety = computeVarietyMetrics(quizzes);

  return {
    model: modelName,
    testcase_id: String(testcase.id || ''),
    testcase_title: String(testcase.title || ''),
    file_name: fileName,
    run_status: String(data?.run?.status || ''),
    checks_performed: checks,
    escaped_error_count: errorCount,
    escaped_error_rate_pct: Number(errorRatePct.toFixed(4)),
    escape_score_pct: Number(escapeScorePct.toFixed(4)),
    variety_question_count: variety.questionCount,
    variety_unique_stem_ratio_pct: variety.uniqueStemRatioPct,
    variety_distinctness_pct: variety.distinctnessPct,
    variety_intent_coverage_pct: variety.intentCoveragePct,
    variety_score_pct: variety.scorePct,
    quiz_count: quizzes.length,
    ...violations,
  };
}

function main() {
  const args = parseArgs(process.argv);
  const root = path.resolve(args.root);
  const outDir = path.resolve(args.outDir);

  if (!fs.existsSync(root)) {
    throw new Error(`Root path does not exist: ${root}`);
  }

  const modelDirs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({
      modelName: d.name,
      jsonDir: path.join(root, d.name, 'all_testcase_json'),
    }))
    .filter((x) => fs.existsSync(x.jsonDir));

  if (modelDirs.length === 0) {
    throw new Error(`No model all_testcase_json directories found under: ${root}`);
  }

  const perRunRows = [];

  for (const { modelName, jsonDir } of modelDirs) {
    const files = fs
      .readdirSync(jsonDir)
      .filter((f) => f.endsWith('.json') && !isZoneIdentifier(f))
      .sort();

    for (const fileName of files) {
      const fullPath = path.join(jsonDir, fileName);
      const data = readJson(fullPath);
      const row = evaluateRun(data, modelName, fileName, {
        expectedQuizzes: args.expectedQuizzes,
        expectedQuestions: args.expectedQuestions,
      });
      perRunRows.push(row);
    }
  }

  const grouped = new Map();
  for (const row of perRunRows) {
    const arr = grouped.get(row.model) || [];
    arr.push(row);
    grouped.set(row.model, arr);
  }

  const perModelRows = [];
  for (const [model, rows] of grouped.entries()) {
    const runs = rows.length;
    const checks = rows.reduce((s, r) => s + r.checks_performed, 0);
    const errors = rows.reduce((s, r) => s + r.escaped_error_count, 0);
    const avgEscapeScore = runs > 0 ? rows.reduce((s, r) => s + r.escape_score_pct, 0) / runs : 0;
    const runsWithEscapedErrors = rows.filter((r) => r.escaped_error_count > 0).length;

    const modelSummary = {
      model,
      runs,
      checks_performed_total: checks,
      escaped_error_count_total: errors,
      escaped_error_rate_pct: Number((checks > 0 ? (errors / checks) * 100 : 0).toFixed(4)),
      avg_escape_score_pct: Number(avgEscapeScore.toFixed(4)),
      runs_with_escaped_errors: runsWithEscapedErrors,
      avg_variety_score_pct: Number((rows.reduce((s, r) => s + Number(r.variety_score_pct || 0), 0) / Math.max(1, runs)).toFixed(4)),
      avg_variety_unique_stem_ratio_pct: Number((rows.reduce((s, r) => s + Number(r.variety_unique_stem_ratio_pct || 0), 0) / Math.max(1, runs)).toFixed(4)),
      avg_variety_distinctness_pct: Number((rows.reduce((s, r) => s + Number(r.variety_distinctness_pct || 0), 0) / Math.max(1, runs)).toFixed(4)),
      avg_variety_intent_coverage_pct: Number((rows.reduce((s, r) => s + Number(r.variety_intent_coverage_pct || 0), 0) / Math.max(1, runs)).toFixed(4)),
    };

    for (const key of VIOLATION_KEYS) {
      modelSummary[`${key}_total`] = rows.reduce((s, r) => s + Number(r[key] || 0), 0);
    }

    perModelRows.push(modelSummary);
  }

  fs.mkdirSync(outDir, { recursive: true });

  const perRunPath = path.join(outDir, 'escaped_normalization_eval_per_run.csv');
  const perModelPath = path.join(outDir, 'escaped_normalization_eval_per_model.csv');
  const summaryPath = path.join(outDir, 'escaped_normalization_eval_summary.json');

  fs.writeFileSync(perRunPath, toCsv(perRunRows), 'utf8');
  fs.writeFileSync(perModelPath, toCsv(perModelRows), 'utf8');
  fs.writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        root,
        outDir,
        expectedQuizzes: args.expectedQuizzes,
        expectedQuestions: args.expectedQuestions,
        filesProcessed: perRunRows.length,
        modelsProcessed: perModelRows.length,
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log(`Wrote: ${perRunPath}`);
  console.log(`Wrote: ${perModelPath}`);
  console.log(`Wrote: ${summaryPath}`);
}

main();
