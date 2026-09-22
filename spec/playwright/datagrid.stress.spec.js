const {test, expect} = require('@playwright/test');
const assert = require('assert');
const ExcelJS = require('../../excel');

test('200,000 x 50 grid exports without a browser crash or truncated worksheet', async ({page}, info) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('crash', () => errors.push('Browser page crashed'));
  await page.goto('/?rows=200000&wide=1');
  await expect(page.locator('#status')).toHaveText('Ready');
  const start = Date.now();
  const downloadPromise = page.waitForEvent('download', {timeout: 540000});
  await page.getByRole('button', {name: 'Export all', exact: true}).click();
  const file = info.outputPath('large.xlsx');
  await (await downloadPromise).saveAs(file);
  // Stream the result in Node so validation does not build a second 10-million-cell workbook.
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(file);
  let count = 0;
  for await (const sheet of reader) {
    for await (const row of sheet) {
      count++;
      if (count > 1) {
        const id = count - 2;
        assert.strictEqual(row.getCell(1).value, id);
        assert.strictEqual(row.getCell(50).value, (id * 50) + 49);
      }
    }
  }
  expect(count).toBe(200001);
  expect(errors).toEqual([]);
  await info.attach('elapsed', {body: `${Date.now() - start} ms (export + validation)`, contentType: 'text/plain'});
});
