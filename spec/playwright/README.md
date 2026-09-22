# DataGrid browser integration tests

Requires Node 20+ for the test tooling. Install dependencies with `npm install`,
then install Chromium once with `npx playwright install chromium`.

Run `npm run test:playwright` for the routine Chromium tests:

- Export 2,000 rows from a paged DevExtreme DataGrid; read the downloaded XLSX
  and check every row's Unicode text, XML special characters, numbers, zero,
  booleans, dates and empty cells, plus header styling and Excel number format.
- Repeat the export three times on the same page and verify that actual XML
  workers were used and no workers or Blob URLs remain after each export.
- Export selected rows spanning several pages and check descending sort order.

Run `npm run test:playwright:stress` separately for 200,000 rows × 50 columns.
It downloads the workbook and streams it back in Node, checking every row's
first and last column and the total row count. This is a large-memory test with
a ten-minute timeout; it intentionally uses the normal browser heap limit.
It is a crash/truncation regression test, not a peak-memory benchmark.

Both commands rebuild this fork's browser bundle from source and bundle the
pinned DevExtreme npm dependency. All browser assets are served locally.
The fixture calls DevExtreme's `exportDataGrid` with this fork's Workbook;
it does not substitute DevExtreme's ExcelJS fork. Tests use UTC for repeatable
date assertions. No application license key is embedded in the fixture.

Downloads, failure traces and stress elapsed time are under `output/playwright/`.
The stress test is excluded from `npm run test:playwright` and the existing Mocha suites.
