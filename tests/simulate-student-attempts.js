// Usage: node simulate-student-attempts.js ./issued-credentials.csv

const fs = require("fs");
const path = require("path");

// --- CONFIG ---------------------------------------------------------

const AUTH_BASE_URL = "http://192.168.1.5:7301";   // for login
const ATTEMPT_BASE_URL = "http://192.168.1.5:7302"; // for attempts
const SCHEDULE_ID = "6926a96eadec1b5be8e7c0e4";

// Correct crossword answers from "expected"
const CORRECT_ANSWERS = {
  "0": "PHOTOSYNTHESIS",
  "1": "TRANSPIRATION",
  "2": "CHLOROPHYLL",
  "3": "GERMINATE",
  "4": "STOMATA",
};

// --- CSV LOADING ----------------------------------------------------

// Very simple CSV loader for export:
// - First row is header
// - Fields are comma-separated and wrapped in double quotes
// - Auto-finds "username" and "password" columns by header name
function loadStudentsFromCsv(csvPath) {
  const raw = fs.readFileSync(csvPath, "utf8").trim();
  if (!raw) throw new Error(`CSV file ${csvPath} is empty`);

  const lines = raw.split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error(`CSV file ${csvPath} has no data rows`);
  }

  // Helper: trim and strip leading/trailing quotes
  const stripQuotes = (v) => {
    if (!v) return "";
    const s = v.trim();
    if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
      return s.slice(1, -1);
    }
    if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) {
      return s.slice(1, -1);
    }
    return s;
  };

  const headerRow = lines[0];
  const headers = headerRow.split(",").map(stripQuotes);

  const usernameIdx = headers.findIndex((h) =>
    h.toLowerCase().includes("username")
  );
  const passwordIdx = headers.findIndex((h) =>
    h.toLowerCase().includes("password")
  );

  if (usernameIdx === -1) {
    throw new Error(
      `Could not find a "username" column in CSV headers: [${headers.join(
        ", "
      )}]`
    );
  }
  if (passwordIdx === -1) {
    throw new Error(
      `Could not find a "password" column in CSV headers: [${headers.join(
        ", "
      )}]`
    );
  }

  const students = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // skip blank lines

    const cols = line.split(",").map(stripQuotes);

    const username = cols[usernameIdx] || "";
    const password = cols[passwordIdx] || "";

    if (!username || !password) {
      console.warn(
        `Skipping row ${i + 1}: missing username or password: "${line}"`
      );
      continue;
    }

    students.push({ username, password });
  }

  if (students.length === 0) {
    throw new Error(`No valid students found in CSV ${csvPath}`);
  }

  return students;
}

// --- Small helpers --------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Introduce a simple typo: remove a char or swap two adjacent chars
function corruptWord(word) {
  if (!word || word.length <= 3) {
    return word.toLowerCase(); // cheap "wrong" variant
  }

  const choice = Math.random();

  // 1) remove a random character
  if (choice < 0.5) {
    const idx = Math.floor(Math.random() * word.length);
    return word.slice(0, idx) + word.slice(idx + 1);
  }

  // 2) swap two adjacent characters
  const idx = Math.floor(Math.random() * (word.length - 1));
  return (
    word.slice(0, idx) +
    word[idx + 1] +
    word[idx] +
    word.slice(idx + 2)
  );
}

// Decide which items this student gets wrong
function chooseItemsToGetWrong(itemIds) {
  // 20% of students get full marks, others get 1–3 wrong
  const roll = Math.random();
  let wrongCount;

  if (roll < 0.2) {
    wrongCount = 0; // top students
  } else if (roll < 0.6) {
    wrongCount = 1;
  } else if (roll < 0.9) {
    wrongCount = 2;
  } else {
    wrongCount = 3;
  }

  if (wrongCount === 0) return [];

  const ids = [...itemIds];
  // Fisher–Yates shuffle
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }

  return ids.slice(0, wrongCount);
}

function buildAnswersWithErrors() {
  const itemIds = Object.keys(CORRECT_ANSWERS);
  const wrongItems = new Set(chooseItemsToGetWrong(itemIds));

  const answers = {};
  for (const id of itemIds) {
    const correct = CORRECT_ANSWERS[id];
    if (wrongItems.has(id)) {
      answers[id] = corruptWord(correct);
    } else {
      answers[id] = correct;
    }
  }

  return { answers, wrongItems };
}

// --- HTTP wrappers (Node 18+ built-in fetch) ------------------------

async function loginStudent(username, password) {
  const res = await fetch(`${AUTH_BASE_URL}/student/auth/sign-in`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Login failed for ${username} (status ${res.status}): ${text}`
    );
  }

  const body = await res.json();
  if (!body?.data?.accessToken) {
    throw new Error(`No accessToken in response for ${username}`);
  }
  return body.data.accessToken;
}

async function startAttempt(token) {
  const res = await fetch(`${ATTEMPT_BASE_URL}/attempt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ scheduleId: SCHEDULE_ID }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `startAttempt failed (status ${res.status}): ${text}`
    );
  }

  const body = await res.json();
  const attemptId = body?.data?.attemptId;
  if (!attemptId) {
    throw new Error("No attemptId in startAttempt response");
  }
  return attemptId;
}

async function submitAnswers(token, attemptId, crosswordAnswers) {
  const res = await fetch(
    `${ATTEMPT_BASE_URL}/attempt/${attemptId}/answers`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        answers: {
          crossword: crosswordAnswers,
        },
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `submitAnswers failed (status ${res.status}): ${text}`
    );
  }
}

async function finishAttempt(token, attemptId) {
  const res = await fetch(
    `${ATTEMPT_BASE_URL}/attempt/${attemptId}/finish`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `finishAttempt failed (status ${res.status}): ${text}`
    );
  }
}

// --- Main per-student flow ------------------------------------------

async function simulateStudent(student, index, totalStudents) {
  const label = `[${index + 1}/${totalStudents}] ${student.username}`;
  console.log(`${label} - logging in...`);
  const token = await loginStudent(student.username, student.password);

  await sleep(300 + Math.random() * 700);

  console.log(`${label} - starting attempt...`);
  const attemptId = await startAttempt(token);

  await sleep(500 + Math.random() * 1500);

  const { answers, wrongItems } = buildAnswersWithErrors();

  console.log(
    `${label} - submitting answers (wrong on items: ${
      wrongItems.size ? Array.from(wrongItems).join(", ") : "none"
    })`
  );
  await submitAnswers(token, attemptId, answers);

  await sleep(200 + Math.random() * 800);

  console.log(`${label} - finishing attempt...`);
  await finishAttempt(token, attemptId);

  const total = Object.keys(CORRECT_ANSWERS).length;
  const correct = total - wrongItems.size;
  console.log(
    `${label} - done. Score approx: ${correct}/${total}\n`
  );
}

// --- Entry point ----------------------------------------------------

(async () => {
  try {
    const csvPath =
      process.argv[2] || path.join(process.cwd(), "issued-credentials.csv");

    console.log(`Loading students from CSV: ${csvPath}`);
    const students = loadStudentsFromCsv(csvPath);

    console.log(`Loaded ${students.length} students from CSV.\n`);

    for (let i = 0; i < students.length; i++) {
      const student = students[i];
      try {
        await simulateStudent(student, i, students.length);
        // Optional: delay between students
        await sleep(500 + Math.random() * 1000);
      } catch (err) {
        console.error(
          `Error for student ${student.username}:`,
          err.message
        );
      }
    }

    console.log("All students processed.");
  } catch (err) {
    console.error("Fatal error:", err.message);
    process.exit(1);
  }
})();
