// Static assets for the HTML reporter — CSS theme + interactive JS.
// Both are inline strings so the report works as a single self-contained
// .html file with no external dependencies.
//
//   renderStyles() — ~260 lines of CSS (dark theme, score cards,
//                    severity badges, data tables, expand/filter
//                    interactions, mobile breakpoint).
//
//   renderScripts() — table sorting, expand toggles, issue filters.
//                     Wrapped in an IIFE so it can be inlined inside
//                     any other page without name collisions.

function renderStyles(): string {
  return `
  <style>
    :root {
      --bg: #0f172a;
      --surface: #1e293b;
      --surface-2: #334155;
      --text: #f8fafc;
      --muted: #94a3b8;
      --border: #475569;
      --accent: #38bdf8;
      --critical: #f472b6;
      --high: #f87171;
      --medium: #fbbf24;
      --low: #94a3b8;
      --pass: #34d399;
      --fail: #f87171;
      --radius: 0.5rem;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 1rem;
    }

    h1, h2 { margin: 0 0 0.75rem; }
    h1 { font-size: 1.75rem; }
    h2 { font-size: 1.25rem; margin-top: 2rem; }

    .report-header {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.25rem;
      margin-bottom: 1.5rem;
    }

    .header-title { margin-bottom: 1rem; }
    .meta { color: var(--muted); margin: 0.25rem 0 0; font-size: 0.875rem; }

    .score-cards {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      margin-bottom: 1rem;
    }

    .score-card {
      background: var(--surface-2);
      border-radius: var(--radius);
      padding: 1rem;
      min-width: 8rem;
      text-align: center;
    }

    .score-value {
      display: block;
      font-size: 2.5rem;
      font-weight: 700;
    }

    .repository-health-card .score-value { color: var(--pass); }
    .ai-quality .score-value { color: var(--accent); }
    .engineering-hygiene .score-value { color: var(--medium); }
    .security-score .score-value { color: var(--pass); }
    .health .score-value { color: var(--pass); }

    .score-label {
      display: block;
      color: var(--muted);
      font-size: 0.875rem;
    }

    .severity-counts {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .severity-badge, .severity-pill, .status-badge, .filter-btn {
      display: inline-flex;
      align-items: center;
      border-radius: 9999px;
      padding: 0.25rem 0.75rem;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border: 1px solid transparent;
    }

           red = unreliable (precision < 0.5 or recall < 0.1). */
    .signal-badge {
      display: inline-flex;
      align-items: center;
      margin-left: 0.5rem;
      padding: 0.1rem 0.4rem;
      font-size: 0.7rem;
      font-weight: 600;
      border-radius: 4px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .signal-ok {
      background: rgba(34, 197, 94, 0.12);
      color: #15803d;
      border: 1px solid rgba(34, 197, 94, 0.3);
    }
    .signal-warn {
      background: rgba(239, 68, 68, 0.12);
      color: #b91c1c;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }

    .severity-critical { background: rgba(244, 114, 182, 0.15); color: var(--critical); border-color: rgba(244, 114, 182, 0.4); }
    .severity-high { background: rgba(248, 113, 113, 0.15); color: var(--high); border-color: rgba(248, 113, 113, 0.4); }
    .severity-medium { background: rgba(251, 191, 36, 0.15); color: var(--medium); border-color: rgba(251, 191, 36, 0.4); }
    .severity-low { background: rgba(148, 163, 184, 0.15); color: var(--low); border-color: rgba(148, 163, 184, 0.4); }

    .status-pass { background: rgba(52, 211, 153, 0.15); color: var(--pass); border-color: rgba(52, 211, 153, 0.4); }
    .status-fail { background: rgba(248, 113, 113, 0.15); color: var(--fail); border-color: rgba(248, 113, 113, 0.4); }

    section { margin-bottom: 2rem; }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9375rem;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
    }

    .data-table th, .data-table td {
      padding: 0.75rem;
      text-align: left;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }

    .data-table th {
      background: var(--surface-2);
      color: var(--text);
      font-weight: 600;
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
    }

    .data-table th:hover { background: #475569; }
    .data-table tbody tr:hover { background: rgba(255, 255, 255, 0.03); }

    .bar-track {
      background: var(--surface-2);
      border-radius: 9999px;
      height: 0.625rem;
      overflow: hidden;
    }

    .bar-fill {
      background: linear-gradient(90deg, var(--accent), #60a5fa);
      height: 100%;
      border-radius: 9999px;
      min-width: 2px;
    }

    .expand-toggle {
      cursor: pointer;
      width: 2rem;
      text-align: center;
      color: var(--accent);
      font-size: 0.75rem;
      user-select: none;
    }

    .expand-header { width: 2rem; }

    .file-issues-inner {
      padding: 0.5rem;
      background: var(--bg);
      border-radius: var(--radius);
    }

    .nested-table {
      border: 1px solid var(--border);
      font-size: 0.875rem;
    }

    .issue-subrow td { padding: 0.5rem; }

    .hidden { display: none; }

    .filters {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      margin-bottom: 1rem;
      align-items: center;
    }

    .filter-group {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
      align-items: center;
    }

    .filter-label {
      color: var(--muted);
      font-size: 0.875rem;
      margin-right: 0.25rem;
    }

    .filter-btn {
      cursor: pointer;
      background: var(--surface-2);
      color: var(--text);
      border-color: var(--border);
      text-transform: capitalize;
    }

    .filter-btn[data-active="false"] {
      opacity: 0.4;
      text-decoration: line-through;
    }

    .filter-btn:hover { background: var(--surface); }

    .issue-row .has-advice {
      cursor: pointer;
      color: var(--accent);
    }

    .advice-hint {
      color: var(--muted);
      font-size: 0.75rem;
    }

    .advice-box {
      background: rgba(56, 189, 248, 0.08);
      border-left: 3px solid var(--accent);
      padding: 0.75rem;
      border-radius: 0 0.25rem 0.25rem 0;
      margin: 0 0 0 1rem;
    }

    .parse-errors-section td { color: var(--high); }

    /* v0.15.0+ — 3-bucket taxonomy (AI Findings / Engineering Hygiene /
       Suppressed). Grouped via bucketForVerdict(); counts come from
       bucketDistribution(). */
    .bucket-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .bucket-grid section {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1rem;
      margin-bottom: 0;
    }

    .bucket-grid h3 {
      font-size: 1rem;
      margin: 0 0 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .bucket-count {
      background: var(--surface-2);
      color: var(--muted);
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.15rem 0.5rem;
      border-radius: 9999px;
    }

    .bucket-summary {
      color: var(--muted);
      font-size: 0.8125rem;
      margin: 0 0 0.75rem;
    }

    .bucket-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .bucket-list li {
      padding: 0.5rem;
      border-bottom: 1px solid var(--border);
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
      font-size: 0.875rem;
    }

    .bucket-list li:last-child { border-bottom: none; }

    .rule-id {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-weight: 600;
      color: var(--accent);
    }

    .rule-verdict {
      font-size: 0.7rem;
      font-weight: 600;
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: var(--surface-2);
    }

    .rule-verdict.verdict-useful { background: rgba(52, 211, 153, 0.15); color: var(--pass); }
    .rule-verdict.verdict-ok { background: rgba(56, 189, 248, 0.15); color: var(--accent); }
    .rule-verdict.verdict-noisy { background: rgba(248, 113, 113, 0.15); color: var(--fail); }
    .rule-verdict.verdict-inverted { background: rgba(251, 191, 36, 0.15); color: var(--medium); }
    .rule-verdict.verdict-hygiene { background: rgba(148, 163, 184, 0.15); color: var(--low); }
    .rule-verdict.verdict-dormant { background: rgba(148, 163, 184, 0.08); color: var(--muted); }

    .rule-confidence, .rule-message {
      color: var(--muted);
      font-size: 0.8125rem;
    }

    .bucket-empty {
      color: var(--muted);
      font-size: 0.875rem;
      font-style: italic;
      margin: 0;
    }

    .suppressed-bucket details summary {
      cursor: pointer;
      color: var(--muted);
      font-size: 0.8125rem;
      padding: 0.25rem 0;
    }

    .suppressed-bucket details summary:hover { color: var(--accent); }

    @media (max-width: 720px) {
      body { padding: 0.5rem; }
      .data-table { font-size: 0.875rem; }
      .data-table th, .data-table td { padding: 0.5rem; }
      .score-cards { justify-content: center; }
      .filters { flex-direction: column; align-items: flex-start; }
    }
  </style>`;
}

function renderScripts(): string {
  return `
  <script>
    (function () {
      function sortTable(table, columnIndex, type) {
        const tbody = table.querySelector('tbody');
        const rows = Array.from(tbody.querySelectorAll(':scope > tr'));
        const dir = table.dataset.sortDir === 'asc' ? -1 : 1;
        table.dataset.sortDir = dir === 1 ? 'asc' : 'desc';

        rows.sort((a, b) => {
          const aCell = a.children[columnIndex];
          const bCell = b.children[columnIndex];
          if (!aCell || !bCell) return 0;
          const aText = aCell.textContent.trim();
          const bText = bCell.textContent.trim();

          if (type === 'number') {
            const aNum = parseFloat(aText);
            const bNum = parseFloat(bText);
            if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
              return (aNum - bNum) * dir;
            }
          }
          return aText.localeCompare(bText) * dir;
        });

        for (const row of rows) {
          tbody.appendChild(row);
        }
      }

      document.querySelectorAll('.data-table').forEach((table) => {
        table.querySelectorAll('thead th[data-sort]').forEach((header, index) => {
          header.addEventListener('click', () => {
            sortTable(table, index, header.dataset.sort);
          });
        });
      });

      document.querySelectorAll('.expand-toggle').forEach((toggle) => {
        toggle.addEventListener('click', () => {
          const index = toggle.dataset.expand;
          const target = document.querySelector('[data-expand-target="' + index + '"]');
          if (!target) return;
          target.classList.toggle('hidden');
          toggle.textContent = target.classList.contains('hidden') ? '▶' : '▼';
        });
      });

      document.querySelectorAll('.expand-advice.has-advice').forEach((cell) => {
        cell.addEventListener('click', () => {
          const index = cell.dataset.advice;
          const target = document.querySelector('[data-advice-target="' + index + '"]');
          if (target) target.classList.toggle('hidden');
        });
      });

      function filterIssues() {
        const activeSeverities = new Set();
        const activeCategories = new Set();
        let severityAll = false;
        let categoryAll = false;

        document.querySelectorAll('.severity-filter').forEach((btn) => {
          if (btn.dataset.severity === 'all') {
            if (btn.dataset.active === 'true') severityAll = true;
          } else if (btn.dataset.active === 'true') {
            activeSeverities.add(btn.dataset.severity);
          }
        });

        document.querySelectorAll('.category-filter').forEach((btn) => {
          if (btn.dataset.category === 'all') {
            if (btn.dataset.active === 'true') categoryAll = true;
          } else if (btn.dataset.active === 'true') {
            activeCategories.add(btn.dataset.category);
          }
        });

        document.querySelectorAll('#issues-table tbody tr.issue-row').forEach((row) => {
          const sev = row.dataset.severity;
          const cat = row.dataset.category;
          const sevMatch = severityAll || activeSeverities.has(sev);
          const catMatch = categoryAll || activeCategories.has(cat);
          row.style.display = sevMatch && catMatch ? '' : 'none';

          const advice = document.querySelector('[data-advice-target="' + row.dataset.index + '"]');
          if (advice) advice.style.display = 'none';
        });
      }

      function setGroupState(groupSelector, active) {
        document.querySelectorAll(groupSelector).forEach((btn) => {
          btn.dataset.active = active ? 'true' : 'false';
        });
      }

      document.querySelectorAll('.severity-filter').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (btn.dataset.severity === 'all') {
            setGroupState('.severity-filter', true);
          } else {
            document.querySelector('.severity-filter[data-severity="all"]').dataset.active = 'false';
            btn.dataset.active = btn.dataset.active === 'true' ? 'false' : 'true';
            const hasActive = Array.from(document.querySelectorAll('.severity-filter:not([data-severity="all"])')).some(b => b.dataset.active === 'true');
            if (!hasActive) document.querySelector('.severity-filter[data-severity="all"]').dataset.active = 'true';
          }
          filterIssues();
        });
      });

      document.querySelectorAll('.category-filter').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (btn.dataset.category === 'all') {
            setGroupState('.category-filter', true);
          } else {
            document.querySelector('.category-filter[data-category="all"]').dataset.active = 'false';
            btn.dataset.active = btn.dataset.active === 'true' ? 'false' : 'true';
            const hasActive = Array.from(document.querySelectorAll('.category-filter:not([data-category="all"])')).some(b => b.dataset.active === 'true');
            if (!hasActive) document.querySelector('.category-filter[data-category="all"]').dataset.active = 'true';
          }
          filterIssues();
        });
      });
    })();
  </script>`;
}

export { renderStyles, renderScripts };