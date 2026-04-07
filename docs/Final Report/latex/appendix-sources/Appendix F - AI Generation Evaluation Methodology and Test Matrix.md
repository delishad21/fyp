# Appendix F - AI Generation Evaluation Methodology and Test Matrix

## 1. Purpose

This appendix documents the testcase matrix, fixed generation settings, and testing inputs used for the AI quiz-generation evaluation.

## 2. Models Under Test

| Provider  | Report Label     |
| --------- | ---------------- |
| OpenAI    | GPT-5 mini       |
| Anthropic | Claude Haiku 4.5 |
| Google    | Gemini 2.5 Flash |

## 3. Test Scope

- Subjects: `Math`, `English`, `Science`
- Levels: `Primary 2`, `Primary 4`, `Primary 6`
- Prompts per level-subject combination: `3`
- Testcases per model: `24`
- Total runs in this cycle: `72` (`3 models x 24 testcases`)

The testcase matrix covers the following level-subject combinations:

- Primary 2 Math
- Primary 2 English
- Primary 4 Math
- Primary 4 English
- Primary 4 Science
- Primary 6 Math
- Primary 6 English
- Primary 6 Science

## 4. Fixed Generation Settings

All models were evaluated under the same fixed settings

| Parameter                 | Value                  |
| ------------------------- | ---------------------- |
| Number of quizzes per run | `5`                    |
| Questions per quiz        | `10`                   |
| Timer setting             | `default`              |
| Uploaded documents        | `none`                 |
| Subject                   | determined by testcase |
| Education level           | determined by testcase |

quiz type constraints were:

| Subject | Allowed Quiz Types                          |
| ------- | ------------------------------------------- |
| Math    | `basic`, `rapid`, `true-false`              |
| English | `basic`, `rapid`, `crossword`, `true-false` |
| Science | `basic`, `rapid`, `crossword`, `true-false` |

## 5. Testcase Bank

The following are the raw testcase prompts used for execution in the lightweight evaluation web app.

#### Primary 2 Math

- `TC01`:
  `Generate 5 Primary 2 Math quizzes for Singapore curriculum alignment. Focus on addition and subtraction within 1,000, including regrouping and one-step word problems. Keep each quiz at 10 questions, use clear child-friendly wording, and ensure answers are unambiguous.`
- `TC02`:
  `Generate 5 Primary 2 Math quizzes for Singapore curriculum alignment. Focus on multiplication and division facts using the 2, 3, 4, 5, and 10 times tables. Keep each quiz at 10 questions, use clear child-friendly wording, and ensure answers are unambiguous.`
- `TC03`:
  `Generate 5 Primary 2 Math quizzes for Singapore curriculum alignment. Focus on money in dollars and cents, including reading amounts, operations, and change. Keep each quiz at 10 questions, use clear child-friendly wording, and ensure answers are unambiguous.`

#### Primary 2 English

- `TC04`:
  `Generate 5 Primary 2 English quizzes for Singapore curriculum alignment. Focus on identifying and using nouns, verbs, and adjectives in short sentences. Keep each quiz at 10 questions, use age-appropriate wording, and ensure answer keys are unambiguous.`
- `TC05`:
  `Generate 5 Primary 2 English quizzes for Singapore curriculum alignment. Focus on capital letters, full stops, question marks, and sentence beginnings. Keep each quiz at 10 questions, use age-appropriate wording, and ensure answer keys are unambiguous.`
- `TC06`:
  `Generate 5 Primary 2 English quizzes for Singapore curriculum alignment. Focus on vocabulary-in-context sentence completion. Keep each quiz at 10 questions, use age-appropriate wording, and ensure answer keys are unambiguous.`

#### Primary 4 Math

- `TC07`:
  `Generate 5 Primary 4 Math quizzes for Singapore curriculum alignment. Focus on fractions, including equivalent fractions, comparison, ordering, and like-fraction operations. Keep each quiz at 10 questions and ensure answer keys are unambiguous.`
- `TC08`:
  `Generate 5 Primary 4 Math quizzes for Singapore curriculum alignment. Focus on decimals up to three decimal places, including place value, comparison, and basic operations. Keep each quiz at 10 questions and ensure answer keys are unambiguous.`
- `TC09`:
  `Generate 5 Primary 4 Math quizzes for Singapore curriculum alignment. Focus on area and perimeter of squares and rectangles. Keep each quiz at 10 questions and ensure answer keys are unambiguous.`

#### Primary 4 English

- `TC10`:
  `Generate 5 Primary 4 English quizzes for Singapore curriculum alignment. Focus on verb tenses in context, especially simple past and simple present. Keep each quiz at 10 questions and ensure answer keys are unambiguous.`
- `TC11`:
  `Generate 5 Primary 4 English quizzes for Singapore curriculum alignment. Focus on subject-verb agreement, including singular/plural subjects and trickier sentence structures. Keep each quiz at 10 questions and ensure answer keys are unambiguous.`
- `TC12`:
  `Generate 5 Primary 4 English quizzes for Singapore curriculum alignment. Focus on editing practice for spelling, punctuation, and grammar errors in short passages. Keep each quiz at 10 questions and ensure answer keys are unambiguous.`

#### Primary 4 Science

- `TC13`:
  `Generate 5 Primary 4 Science quizzes for Singapore curriculum alignment. Focus on plant systems, including functions of roots, stems, and leaves. Keep each quiz at 10 questions and ensure answer keys are unambiguous.`
- `TC14`:
  `Generate 5 Primary 4 Science quizzes for Singapore curriculum alignment. Focus on matter, including states of matter and changes of state. Keep each quiz at 10 questions and ensure answer keys are unambiguous.`
- `TC15`:
  `Generate 5 Primary 4 Science quizzes for Singapore curriculum alignment. Focus on heat and light, including sources, transfer, and everyday applications. Keep each quiz at 10 questions and ensure answer keys are unambiguous.`

#### Primary 6 Math

- `TC16`:
  `Generate 5 Primary 6 Math quizzes for Singapore curriculum alignment. Focus on ratio, including simplest form and straightforward ratio word problems. Keep each quiz at 10 questions and ensure answer keys are unambiguous.`
- `TC17`:
  `Generate 5 Primary 6 Math quizzes for Singapore curriculum alignment. Focus on percentage, including percentage of a quantity and percentage increase/decrease. Keep each quiz at 10 questions and ensure answer keys are unambiguous.`
- `TC18`:
  `Generate 5 Primary 6 Math quizzes for Singapore curriculum alignment. Focus on speed, distance, and time, including unit conversion and multi-step word problems. Keep each quiz at 10 questions and ensure answer keys are unambiguous.`

#### Primary 6 English

- `TC19`:
  `Generate 5 Primary 6 English quizzes for Singapore curriculum alignment. Focus on grammar editing with emphasis on tense consistency, subject-verb agreement, and punctuation. Keep each quiz at 10 questions and ensure answer keys are unambiguous.`
- `TC20`:
  `Generate 5 Primary 6 English quizzes for Singapore curriculum alignment. Focus on vocabulary cloze using contextual clues. Keep each quiz at 10 questions and ensure answer keys are unambiguous.`
- `TC21`:
  `Generate 5 Primary 6 English quizzes for Singapore curriculum alignment. Focus on synthesis and transformation patterns at upper primary level. Keep each quiz at 10 questions and ensure answer keys are unambiguous.`

#### Primary 6 Science

- `TC22`:
  `Generate 5 Primary 6 Science quizzes for Singapore curriculum alignment. Focus on electrical systems, including complete circuits and conductors/insulators. Keep each quiz at 10 questions and ensure answer keys are unambiguous.`
- `TC23`:
  `Generate 5 Primary 6 Science quizzes for Singapore curriculum alignment. Focus on ecosystem interactions, including food chains/webs and environmental change. Keep each quiz at 10 questions and ensure answer keys are unambiguous.`
- `TC24`:
  `Generate 5 Primary 6 Science quizzes for Singapore curriculum alignment. Focus on forces and energy conversion in everyday devices. Keep each quiz at 10 questions and ensure answer keys are unambiguous.`

## 6. Evaluation Methods

For the purposes of this evaluation, a lightweight web application was developed for running a testcase bank against selected models in a controlled and repeatable manner. This web app connects to the existing quiz generation pipeline that is used for the actual platform, so the evaluation is run on the same backend and generation system that the platform will use for actual quiz generation. This allows for an easier assessment, as testcases can be predefined and left to run in batches. No manual typing of testcases into the main platform is needed, which allows for a more systematic and large-scale evaluation of the models.

The web app also collected metrics that are used for evaluation, and it exports the data in JSON outputs. PDF reports with a formatted version of the generated quizzes are also exportable, and can be used for manual review of the generated content.

The evaluation used two main data sources.

1. **Eval App Exports**: The LLM eval app exports structured JSON files containing the generated quizzes and run metadata, as well as CSV files containing run-level metrics such as completion, retries, latency, tokens, and estimated cost. These outputs are the source for the reliability, performance, and cost analysis.
2. **Deterministic Evaluation Script**: The script `scripts/evaluate-normalized-outputs.mjs` reads the exported JSON quiz outputs and computes deterministic structural validity metrics and deterministic variety metrics. The validation script `scripts/validate-eval-artifacts.mjs` checks that the exported files are complete before scoring is used.

For deterministic evaluation, the following script workflow was used from `llm-eval-app`:

- `npm run eval:normalized`
- `npm run eval:validate`

The deterministic script takes its input from:

- `llm-eval-app/evaluation docs/Generated Data/*/all_testcase_json/*.json`

and produces:

- `llm-eval-app/evaluation docs/Generated Data/deterministic_eval/escaped_normalization_eval_per_run.csv`
- `llm-eval-app/evaluation docs/Generated Data/deterministic_eval/escaped_normalization_eval_per_model.csv`
- `llm-eval-app/evaluation docs/Generated Data/deterministic_eval/escaped_normalization_eval_summary.json`

The validation step was used as an artifact-consistency pre-check before scoring, to guard against missing testcase runs, missing deterministic rows, or partial exports that would bias the model averages.

The web app can be found under the `llm-eval-app` directory in the project repository.

![LLM Eval App UI](image.png)

## 7. Deterministic Structural Validity Checks

The LLM Eval App produces a structured JSON including the normalised generated quizzes and questions for each testcase, essentially the final version of the quiz outputted by the AI service.

Deterministic structural checks are run on these normalized quiz outputs exported per testcase to evaluate integrity and variety.

It is important to note that normalization already enforces many structural rules, such as minimum MC options and the presence of at least one correct answer, and will trigger retries if the output fails to meet those rules. The checks that are done here are to catch any escaped errors that slipped through normalization and still ended up in the final quiz structure. These escaped errors are errors that are not severe enough to trigger rejection during normalization, but they still remain as good indicators of the model's quality in generated quizzes.

From the responses generated by the models, a set of deterministic structural validity checks were applied to assess whether the generated content met the required format and structure for quiz content in the platform. These checks included the following:

1. `run_quiz_count_mismatch`, which checks whether the generation run returned the expected total number of quizzes.
2. `quiz_question_count_mismatch`, which checks whether each generated quiz contains the expected number of questions or entries.
3. `mc_option_count_invalid`, which checks whether a multiple-choice item includes a sufficient number of answer options.
4. `mc_correct_count_invalid`, which checks whether a multiple-choice item includes at least one correct answer.
5. `open_missing_answers`, which checks whether an open-ended item contains a valid answer structure.
6. `open_exact_missing_text`, which checks whether an exact-match open-ended answer includes the required answer text.
7. `open_keywords_invalid`, which checks whether a keyword-based open-ended answer contains a valid keyword list and threshold.
8. `open_list_invalid`, which checks whether a list-based open-ended answer contains a valid list of items and a valid minimum-correct threshold.
9. `context_missing_text`, which checks whether a context item includes the passage or prompt text required for linked questions.
10. `crossword_grid_missing`, which checks whether a crossword quiz includes a valid crossword grid.
11. `crossword_entry_invalid`, which checks whether each crossword entry includes both a valid clue and a valid answer.

The results of these checks were used to calculate the escape score for each generated quiz, which represents the percentage of checks that were passed successfully. This provides a quantitative measure of the structural validity of the generated content, which is a key aspect of generation quality for this platform.

For scoring, only these checks are included in the escaped-error denominator. Each applicable rule contributes one check to the total checks performed, and each failed rule increments the escaped error count by 1. A single item can fail multiple rules, and each failure is counted separately. The escaped error rate is calculated as `escaped_error_count / checks_performed * 100`, and the escape score is calculated as `100 - escaped_error_rate`.

Following that, the generated content was evaluated for variety using

1. Unique stem ratio
2. Distinctness (1 minus average Jaccard similarity between generated questions)
3. Intent bucket coverage, which checks whether the generated questions cover a diverse range of question intents (e.g. recall, application, analysis) based on a predefined set of vocabulary.

These checks are combined into a variety score, using the weighted formula `0.45 * unique_stem_ratio + 0.35 * distinctness + 0.20 * intent_coverage`.

For this calculation, the script first extracts prompts as follows:

- for crossword quizzes, each clue is treated as a prompt
- for other quiz types, each question text is treated as a prompt
- context items are excluded from this calculation

Let `n` be the number of extracted prompts in a testcase run. If `n = 0`, then all variety metrics are set to `0`.

The prompts are then normalised before comparison:

- converted to lowercase
- non-alphanumeric characters are replaced with spaces
- repeated whitespace is collapsed
- surrounding whitespace is trimmed

The exact metrics are calculated as follows:

1. **Unique Stem Ratio**: This measures how many prompts remain unique after normalisation.

   - `unique stem ratio = number of unique normalized prompts / n`
   - `variety_unique_stem_ratio_pct = unique stem ratio * 100`

2. **Distinctness**: This measures how different the prompts are from one another after tokenisation and stopword removal.

   For each prompt:

   - the prompt is tokenised after normalisation
   - common stopwords are removed
   - Jaccard similarity is calculated against every other prompt

   Jaccard similarity is:

   - `Jaccard(A, B) = |A ∩ B| / |A ∪ B|`

   For each prompt `i`, the highest similarity to any other prompt is taken:

   - `max_sim_i = max(Jaccard(prompt_i, prompt_j)) for all j != i`

   Then those maximum similarities are averaged:

   - `average maximum similarity = sum(max_sim_i) / n`

   Distinctness is then:

   - `distinctness = 1 - average maximum similarity`
   - `variety_distinctness_pct = distinctness * 100`

3. **Intent Coverage**: This measures whether the prompts span a broader range of prompt intents.

   Each prompt is assigned to one of six deterministic intent buckets:

   - `reasoning`
   - `compare`
   - `procedure`
   - `listing`
   - `recall`
   - `application`

   The script classifies each prompt by matching keywords associated with each intent bucket. If none of the earlier buckets match, the prompt is classified as `application`.

   - `intent coverage = number of unique intent buckets present / 6`
   - `variety_intent_coverage_pct = intent coverage * 100`

The final variety score is then exported as:

- `variety_score_pct = (0.45 * unique stem ratio + 0.35 * distinctness + 0.20 * intent coverage) * 100`

The final exported percentage values are rounded to 4 decimal places.

## 8. Reliability and Performance Metrics

In addition to the quality checks described above, this evaluation also measures the reliability and performance of the models. The purpose of this is to assess how consistently each of the models could generate usable outputs that can be processed by the platform, as well as how long the generation process takes.

These metrics came from the LLM eval app's run exports.

The following metrics were measured.

1. **Completion Rate**: This measures each job success. If the job produced a valid output, it counts as a success, even if some outputs were invalid and retried. The completion rate is calculated as `successful / expected * 100`.
2. **Retry Count**: This captures robustness of the LLM in producing valid outputs without needing retries. High retry counts indicate instability of the model for the given generation task.
3. **Attempt Count**: This measures the total number of generation attempts made for each test case. This metric is mainly used to interpret and normalize the retry count.
4. **Total Latency**: This is cumulative latency across all LLM calls in the run, including the planning call, every generation call, and any retry calls.

Other fields were also recorded for analysis, though they were not included in the final automated score:

5. **Token Usage**: Planning tokens, generation tokens, and overall total tokens were recorded for reporting and cross-model efficiency comparison. Most LLM provider pages indicate that extracted token usage is still an estimate and may not match exact billing cost, but from testing and the costs incurred on actual usage, these values were found to be relatively accurate.
6. **Estimated Cost**: Estimated cost was computed in the evaluator app via a model pricing table from token usage. These prices were hard coded into the evaluator configuration based on public pricing tables for each model, and were accurate as of March 2026, but would not reflect future price changes.

Using the metrics above, three different reliability and performance scores are calculated:

1. **Completion Score**: `completion_score_100 = 100 * (completion_rate_pct / 100)^2`. This score is designed to heavily reward higher completion rates, as generation completion is a critical aspect of reliability for this platform. As such, the completion rate is squared in the formula to more heavily penalise lower completion rates.
2. **Retry Score**: `retry_score_100 = 100 * max(0, 1 - retry_count / max(1, attempt_count))^3`. This score is designed to reward lower retry counts, as a high number of retries can indicate that the model is generating content that often fails the validity checks, which increases latency and cost, and is generally indicative of the model being less capable of generating usable content. The retry count is normalised by the total attempt count to account for cases where the model may have a low completion rate, and the score is cubed to more heavily penalise higher retry rates.
3. **Latency Score**: Latency score is calculated using the following bands of response times:

| Total LLM latency per run | `latency_score` |
| ------------------------- | --------------: |
| `<= 60,000 ms`            |              80 |
| `60,001 - 120,000 ms`     |              55 |
| `120,001 - 180,000 ms`    |              40 |
| `180,001 - 240,000 ms`    |              30 |
| `240,001 - 300,000 ms`    |              20 |
| `300,001 - 420,000 ms`    |              10 |
| `> 420,000 ms`            |               0 |

To calculate the overall reliability and performance score for each model, the three scores above are combined using the following weighted formula:

`reliability_score_100 = 0.45*completion_score_100 + 0.35*retry_score_100 + 0.20*latency_score`

This formula weighs each component according to its importance for the platform, with completion rate being the most heavily weighted, followed by retry count, and then latency. This provides a comprehensive measure of the reliability and performance of each model in generating usable quiz content for the platform.

## 9. Structural Validity, Variety, and Reliability Results

The measured results for structural validity, variety, and reliability are shown below.

| Model            | Escaped Error Rate | Avg Escape Score | Runs with Escaped Errors | Avg Variety Score | Mean Reliability Score |
| ---------------- | -----------------: | ---------------: | -----------------------: | ----------------: | ---------------------: |
| Claude Haiku 4.5 |            0.0830% |          99.9013 |                     2/24 |           82.3380 |                86.7756 |
| GPT-5 mini       |            0.3633% |          99.6340 |                     8/24 |           83.8721 |                82.5731 |
| Gemini 2.5 Flash |            0.0000% |         100.0000 |                     0/24 |           82.2321 |                88.0129 |

The following are the measured results for completion rate, retry count, attempt count, total latency, and reliability score.

| Model            | Mean Completion Rate | Mean Retry Count | Mean Attempt Count | Mean Total LLM Latency |
| ---------------- | -------------------: | ---------------: | -----------------: | ---------------------: |
| Claude Haiku 4.5 |               99.17% |             0.75 |               5.71 |              59,154 ms |
| GPT-5 mini       |              100.00% |             0.08 |               5.08 |             296,047 ms |
| Gemini 2.5 Flash |              100.00% |             0.25 |               5.25 |              97,507 ms |

## 10. Token Usage and Cost Analysis

The following table shows the average token usage and cost estimates for all total runs.

These token and cost calculations were not factored into the final scores for the models, as the main focus of this evaluation was on the quality and reliability of the generated content. However, cost is still an important consideration for the platform, especially as it scales, so these estimates were still kept track of and are provided here for reference.

| Model            | Mean Overall Tokens / Run | Mean Estimated Cost / Run (USD) | Total Estimated Cost for 24 Runs (USD) |
| ---------------- | ------------------------: | ------------------------------: | -------------------------------------: |
| Claude Haiku 4.5 |                    17,871 |                        0.058409 |                               1.401820 |
| GPT-5 mini       |                    25,677 |                        0.039730 |                               0.953512 |
| Gemini 2.5 Flash |                    27,905 |                        0.028908 |                               0.693788 |

## 11. Comparative Results Across Models

To summarise the comparative results across the three models, a final overall score was calculated for each model by combining the quality metrics (structural validity and variety) with the reliability score, using the following weighted formula:

`overall_run_score = 0.70*reliability + 0.20*integrity + 0.10*variety`

This formula places priority on the reliability metrics, as in the context of this platform, having a model that cannot complete runs consistently, has a high retry rate, or has a high latency can significantly impact the user experience more so than small differences in the structural validity or variety of the generated content.

Structural validity and variety are still important, but they are weighted lower in the overall score as these two mainly serve as narrow quality measures. Deterministic measures can only realistically capture certain aspects of generation quality, and there are many other important dimensions of quality such as the educational relevance, the appropriateness of the language used, and the creativity of the generated content that are not captured by these metrics. Assessing meaningful variety in generated content is also a lot more intricate, and would likely require human evaluation from subject matter experts to provide a more accurate assessment. As such, these two metrics are weighted lower in the overall score, serving more as supportive measures to the reliability score.

Using this automated scoring formula, the following model-level scores were obtained by averaging the run-level automated scores across the 24 testcases for each model.

| Model            | Overall Automated Score (/100) |
| ---------------- | -----------------------------: |
| Gemini 2.5 Flash |                        89.8322 |
| Claude Haiku 4.5 |                        88.9570 |
| GPT-5 mini       |                        86.1152 |

These results indicate that Gemini 2.5 Flash achieved the highest overall automated score in this evaluation cycle, followed closely by Claude Haiku 4.5, while GPT-5 mini ranked third on the same scoring basis.

## 12. Planned Human Evaluation of Generation Quality

As briefly touched upon in the earlier section, deterministic assessments of generation quality can only go so far in capturing the true quality of the generated content, especially in an educational context where the relevance, appropriateness, and creativity of the content are crucial factors that are not easily quantifiable. It is also worth noting that there was some level of human evaluation achieved in the secondary user testing, as teachers were asked to evaluate the quality of the generated content. Most responses indicated that there was much to improve in the quality of the generated content, but the few responses are insufficient to provide a definitive assessment of the improvements needed in the generated content.

As such, plans for a follow-up human evaluation of the generated content were drafted up, simply lacking the resources to be executed in this initial phase of AI generated evaluation. The human evaluation will involve subject matter experts in education who will review samples of the generated quizzes, obtained from the same test cases used in the automated evaluation.

Experts will evaluate the quizzes across four dimensions that attempt to capture the key aspects of generation quality that are relevant for the platform:

1. Alignment to prompt
2. Alignment to syllabus or curriculum intent
3. Question correctness
4. Question variety

The following is a proposed rubric for the human evaluation.

| Dimension                               | 1 (Poor)                                                             | 2 (Weak)                                                            | 3 (Adequate)                                                     | 4 (Good)                                                        | 5 (Excellent)                                                                                       |
| --------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Alignment to prompt                     | Largely ignores the teacher request, with incorrect focus or level.  | Partly follows the request, but with major drift in focus or level. | Mostly follows the request, with some drift or inconsistency.    | Clearly follows the request, with only minor issues.            | Fully follows the request, with precise focus and level throughout.                                 |
| Alignment to syllabus/curriculum intent | Frequently below or above the expected primary level, or off-topic.  | Contains multiple curriculum-level mismatches.                      | Generally suitable in level and topic, but with uneven coverage. | Shows good level fit and topic relevance across most questions. | Demonstrates strong curriculum fit, level-appropriateness, and highly relevant coverage throughout. |
| Question correctness                    | Contains many incorrect, ambiguous, or invalid items or answer keys. | Contains several incorrect or ambiguous items.                      | Mostly correct, but with a few issues.                           | Correct and clear, with only rare minor issues.                 | Consistently correct, clear, and unambiguous.                                                       |
| Question variety                        | Very repetitive in stems and skill types.                            | Limited variety, with frequent repetition.                          | Moderate variety, with some repetition.                          | Good mix of skills, phrasing, and contexts.                     | Excellent variety in skills, phrasing, and contexts without losing focus.                           |

For aggregation, each rating will be converted to a 100 point scale

1. `prompt_score = prompt_rating * 20`
2. `curriculum_score = curriculum_rating * 20`
3. `correctness_score = correctness_rating * 20`
4. `variety_score_manual = variety_rating * 20`

The weighted manual score will then be calculated using the following formula.

`manual_score = 0.25*prompt_score + 0.25*curriculum_score + 0.35*correctness_score + 0.15*variety_score`

This weighting gives the highest priority to correctness, as having incorrect or ambiguous questions can significantly undermine the educational value of the generated content. Alignment to the prompt and curriculum are also important, but they are weighted slightly lower as they can be somewhat more subjective and may have a bit more flexibility depending on the teacher's intent. Variety is still an important aspect of quality, but it is weighted lowest in this rubric as it is more of a nice-to-have feature rather than a critical requirement for the generated content.

The manual ratings can optionally be combined with the automated metrics to provide a more comprehensive overall score for the generated content, using a formula such as:

`overall_run_score_with_manual = 0.60*manual_score + 0.40*overall_run_score`

This was defined as a future extension. The automated evaluation is the main completed method in this project phase.

## 13. Threats to Validity

There are several limitations of this evaluation that should be acknowledged:

1. The automated evaluation was intentionally run without uploaded documents due to cost limitations. So the results that were obtained mainly reflect prompt-driven behaviour without any supplementary material. This may still be representative of the actual use case for the platform, as teachers may often use the AI generation features without uploading additional documents, but it does mean that the evaluation does not capture how well the models can leverage uploaded materials to enhance the quality and relevance of the generated content.
2. Manual evaluation is still needed to capture important dimensions of quality that are not easily quantifiable, such as the educational relevance and appropriateness of the generated content. The planned human evaluation will help to address this limitation, but it is still a limitation of the current evaluation results.
3. Deterministic structural checks are structural and integrity-oriented, not a full pedagogical evaluation.
4. Deterministic variety remains a heuristic proxy, not a replacement for expert judgment.
5. Without manual review, curriculum depth, wording quality, and pedagogical suitability are only partially captured.
