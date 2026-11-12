# Exam tool

A static, serverless exam tool for GitHub Pages. Set a paper, give students one encrypted **paper.zip** plus a key,
get encrypted **.ans** files back, then mark them and see statistics. All crypto uses the browser's Web Crypto API.
No build step, no dependencies.

## Install

```
tools/
  exam.html                 the page (links ../assets/css/styles_css/02-variables.css)
  exam_css/                 markdown.css  editor.css  exam.css      (tokens only — no raw colours)
  exam_js/                  main.js  theme.js  ui.js  format.js  crypto.js  zip.js  images.js  lock.js  timing.js  charts.js  grade.js
                            markdown.js  md-editor.js  code-editor.js
                            setter.js  answerer.js  checker.js
tools_exam.md               card entry for index_tools (rename to your next tools_N.md)
```

When updating, replace the **whole** `exam_js/` folder — the files import each other, and one stale file
(e.g. an old `markdown.js` without `renderCode`) makes the page load blank because the entry module fails to import.

`markdown.js` imports two files that already exist on your site, unchanged:
`assets/js/main_js/utils.js` (`escapeHtml`) and `assets/js/main_js/blog/highlight.js` (`codeBlockHtml`).

Pages: `exam.html#answer` (give this link to students) · `#set` · `#check`.

`exam_js/theme.js` stores the theme in `localStorage["theme"]`. If your site uses another key, change `KEY` there
and in the inline script in `exam.html`.

## Workflow

1. **Set paper** (`#set`): header paragraph, options, identity fields, then the paper content (questions, paragraphs,
   sections). The draft autosaves in this browser (and can be exported/imported as JSON). *Generate paper* downloads
   `Title_P-XXXXXXXX.zip` and shows two keys **once**:
   - **Answerer (public) key** `ABCDE-FGHJK-MNPQR-STUVW` — give to students with the zip.
   - **Setter (private) key** `SK1-…` — keep secret. Opens answer files and the correct answers.
2. **Answer** (`#answer`): the student chooses the zip, enters the answerer key, fills in the identity fields,
   answers, submits → downloads one `.ans` file like `20261110-142201_Asha-Rao_FY-B.ans`. Progress autosaves; a refresh resumes.
3. **Check paper** (`#check`): enter the **paper zip + the setter key + the answerer key** (all three are required),
   add `.ans` files in as many batches as you like, then use the Dashboard, Submissions, Review and Questions tabs. Download CSV.

The paper is a **.zip** containing `manifest.json` (title and id, readable) and `paper.exam` (everything else, encrypted).
Answer sheets are plain single files. The Answer and Check pages also still accept a bare `.exam` file.

## Paper content

One ordered list of items; add any mix:

- **Questions** — MCQ single / multiple, short, long, code (Python, Rust, Java, C, C++, Other). Each has an editable
  unique id, Required/Optional and Marked (with marks)/Unmarked.
- **Paragraphs** — text between questions: headings (`# …`, or the **H** button to cycle levels), coloured headings,
  links, images, tables, callouts.
- **Sections** — everything after a section card, until the next one, belongs to it. Each section has a title,
  an optional introduction and a "shuffle questions in this section" switch. "Shuffle the order of sections" is a paper option.
- **Header paragraph** — shown on the start screen and again at the top of the paper.

Shuffling: questions before the first section follow "Shuffle questions that are not in a section". A paragraph moves
together with the question after it; paragraphs after the last question of a section stay at the end of that section.
Each student's order is derived from a stored seed and recorded in the answer file.

## Markdown (questions, options, paragraphs, answers)

`**bold**`, `*italic*`, `<u>underline</u>`, `~~strike~~`, `=(ok)colour=` / `=(#ff8800)hex=` (names: accent ok warn info
cyan danger muted dim), links `[text](https://…)` — the link text can be bold/coloured too, e.g.
`[**the rules**](https://x.com)` or `=(warn)[link](https://x.com)=` — plus lists, quotes, tables and fenced code
with highlighting. A heading can be coloured: `# =(accent)Part A=`.

`/` at the start of a line opens the slash menu (`/table`, `/callout`, `/code`, `/image`, headings, lists, …):

```
:::table{id=t1 name="Scores"}
| A | B |
| - | - |
| 1 | 2 |
:::

::::callout{id=c1 name="Hint" color=info}
Callout text. Colours: accent ok warn info danger cyan muted
::::
```
Ids are unique across the whole paper (the setter page flags duplicates).

## Images

Setter-side editors (header, paragraphs, sections, questions, options, model answers) have an **Image** button, `/image`,
paste and drag-and-drop. Images are shrunk to ≤1600 px, stored inside the paper (no hosting needed) and referenced as
`![alt](img:i1)`; add a width with `![alt|60%](img:i1)` or `![alt|320](img:i1)`. Only images the paper actually uses are
shipped, and an image used only in a model answer goes into the setter-only block. Students' own answers can't contain images.
Keep the total under about 6 MB (the draft lives in localStorage; the editor warns you).

## Timing

- **Start time and submit time** of every student are always recorded (shown in Check paper and in the CSV).
- **Time limit** (optional): x minutes after the student presses Start.
- **Closing time** (optional): a fixed moment in a timezone you choose (India, UTC, GMT, London, and others, or any IANA
  name). Students see it in their own time and in yours. The paper cannot be started after it, and a running paper
  auto-submits then. If both a limit and a closing time are set, whichever comes first ends the paper.
  Check paper flags submissions made after the closing time.
- The clock is the student's own device clock — it cannot be enforced from a static site.

## Repeat attempts

**Setter side** (Set paper → *Repeat attempts*): tick *Block repeat attempts on the same device*, then optionally give

- a **secret exam id**, e.g. `EXAM - 001` — never shown to students. Every paper with the same id (a regenerated or
  alternate version of the exam) shares one lock. Case, spaces and dashes are ignored (`EXAM - 001` = `exam001`).
  Without one, the lock only covers that exact paper file.
- a **cooldown** in minutes / hours / days after the first attempt. Empty = never expires.

When a student starts, a record is written to their browser in three places — localStorage, IndexedDB and a cookie —
and each read restores any copy that was deleted. While the lock is active the paper cannot be started again, by that
paper file or any other with the same secret id; "Close this paper" removes only their saved answers, not the lock.
An unfinished attempt of the same paper can be resumed, but restarting never resets the clock (the original start time is kept).
The answer file also records the device's earlier attempts (`priorAttempts`) and the normalised secret id.

**Checker side**: submissions are grouped by the student. Fields ticked *Identifies student* on the setter page are compared
ignoring case, spaces, punctuation and accents, so `Harsh Rathod`, `harshrathod` and `HARSH. RATHOD` are one person
(papers made before this option compare all fields). Within a group the **earliest submission is the original** and the only
one counted. Every later one is flagged **needs review** and left out of the statistics, labelled
*answered inside the cooldown* (it started before the original's submit time + cooldown — it should have been impossible),
*answered after the cooldown*, or just *repeat attempt* when blocking was off. For each you can **dismiss** it, or **count it
instead of the original** (the original then shows "replaced by a later entry"). Decisions are saved in this browser, the
Overview shows how many still need review, and the CSV has `counted`, `review_status` and `repeat_of` columns.
Answer files whose secret id is missing or different are flagged too.

**Limits**: the lock cannot survive *Clear all site data*, a private window, another browser or another device — a determined
student can always start again. That is why the repeat detection exists: it catches the second submission whatever device
it came from. It does not catch a different spelling of the name beyond what is listed (e.g. surname and given name swapped),
and "earliest" is judged by the submit time recorded on the student's device.

## Time per question

The answer file records, for every question, the **active seconds** the student spent on it, how many **visits** (times they moved
onto it), when they first reached it and first answered it (seconds into the paper) and how many **edits** they made — next to the
paper's total start/submit/duration. A question counts as "the one they're on" when it has keyboard focus, otherwise when it
crosses the middle of the screen. Time is only credited while the tab is in front **and** the student did something (typed,
clicked, scrolled, tapped) in the last 3 minutes, so leaving the page open while away doesn't inflate it. The sum of the
question times is therefore normally less than the total duration (reading, scrolling, idling). Timing is saved with the
progress, so a refresh doesn't lose it. In Check paper it shows as a ⏱ badge on each question in Review, in the dashboard and in
the CSV (`sec_Q1`, `sec_Q2`, … and `active_sec`). Answer files made before this was added simply have no times.

## Dashboard (Check paper)

The first tab shows the numbers and charts for the submissions that count:

- stat cards — submissions, mean, median, highest, lowest, standard deviation, **pass rate** (you set the pass mark, default 40%,
  remembered per paper), average time, average **active time on questions**, answers still to mark;
- **score distribution** (mean/median lines, bands under the pass mark in red) and **pass/fail + marking-progress** donuts;
- **score vs time taken** — one dot per student, click to open them; **when students submitted** — a timeline;
- **question difficulty** (average share of the marks earned) and **question quality** (discrimination index D: how much better the top
  27% did than the bottom 27%; near 0 = uninformative, negative = check the key; needs 6+ marked submissions);
- **time per question** (average and median, with correct-vs-wrong timing in the tooltip and on the Questions tab);
- **attempt rate**, **section performance**, and **marking still to do** by question.

**Marking updates the dashboard immediately.** The **↻ Refresh** button (top right, on every tab) re-reads the marks and review
decisions saved by another window/tab of this browser (it turns blue with "new changes" as soon as another window saves one),
rebuilds everything and shows when it last updated. In Chrome and Edge you can also **link a folder** of `.ans` files: Refresh then
loads any new files from that folder automatically (only new or changed files, never twice). Other browsers use *Add .ans files*.

## Marking rules

| Question | Marked how |
|---|---|
| MCQ with a correct answer set | automatic (multiple-correct is all-or-nothing) |
| Short with accepted answers | automatic, trimmed match (case-insensitive unless you tick case-sensitive) |
| Short without accepted answers, long, code | by hand (stays "to mark" until you enter a mark) |
| Unmarked | shown, never scored |
| Blank answer | 0, nothing to mark |

A mark you type always overrides the automatic one. Marks are saved in this browser (`localStorage`, per paper id) and
included in the CSV. Repeat submissions are handled as described in *Repeat attempts* below.

## Security — what is and isn't protected

- Questions, images and settings are encrypted with a random 256-bit key. That key is wrapped twice: with the answerer
  key (PBKDF2-SHA256, 600 000 iterations → AES-GCM) and with the setter's public key (ECDH P-256 + HKDF → AES-GCM).
- Correct answers, model answers and model-answer-only images sit in a separate block that only the setter key opens.
- Answer files are encrypted to the paper's public key: students can write them, only the setter key reads them.
  The student's name is inside the encryption. Every box is bound to the paper id, and tampering is detected.
- The answerer key has 100 bits of entropy.
- The zip is only a container: its `manifest.json` shows the title and id; everything else is ciphertext.

Limits of a static site: anyone with the zip and answerer key can read the questions, a student can share the key early,
time limits and the closing time rely on the student's device clock, and anyone who has the zip can create a forged answer
file (the public key is in it). Code answers are never executed. Lose the setter key and the answers cannot be recovered.

## Customising

- Colours, radii, fonts, motion: your tokens in `tokens/*.css`; the tool uses only `var(--…)`.
- Callout colours: `CALLOUT_COLORS`; time zones: `TIMEZONES`; code languages: `CODE_LANGS` — all in `exam_js/format.js`.
- Data model and file formats are documented at the top of `format.js` and `crypto.js`.
