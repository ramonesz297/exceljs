/* global window */
/* eslint-disable no-await-in-loop, no-loop-func */
// URL instrumentation runs in Chromium.
/* eslint-disable node/no-unsupported-features/node-builtins */
const {test, expect} = require('@playwright/test');
const ExcelJS = require('../../excel');

test('paged grid exports all values and styles; repeated exports release workers and Blob URLs', async ({page}, info) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const urls = new Set();
    const workers = new Set();
    let createdWorkers = 0;
    const create = window.URL.createObjectURL.bind(window.URL);
    const revoke = window.URL.revokeObjectURL.bind(window.URL);
    window.URL.createObjectURL = blob => {
      const url = create(blob);
      urls.add(url);
      return url;
    };
    window.URL.revokeObjectURL = url => { urls.delete(url); revoke(url); };
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        workers.add(this);
        createdWorkers++;
      }

      terminate() { workers.delete(this); return super.terminate(); }
    };
    window.resources = () => ({urls: urls.size, workers: workers.size, createdWorkers});
  });
  await page.goto('/?rows=2000');
  await expect(page.locator('#status')).toHaveText('Ready');
  for (let iteration = 0; iteration < 3; iteration++) {
    const previousWorkers = await page.evaluate(() => window.resources().createdWorkers);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', {name: 'Export all', exact: true}).click();
    const download = await downloadPromise;
    const file = info.outputPath(`export-${iteration}.xlsx`);
    await download.saveAs(file);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(file);
    const sheet = workbook.getWorksheet('D\'Alsace');
    expect(sheet.rowCount).toBe(2001);
    expect(sheet.columnCount).toBe(6);
    for (let id = 0; id < 2000; id++) {
      const row = sheet.getRow(id + 2);
      expect(row.getCell(1).value).toBe(id);
      expect(row.getCell(2).value).toBe(`Рядок ${id} <&> 😀`);
      expect(row.getCell(3).value).toBe(id / 4);
      expect(row.getCell(4).value).toBe(id % 2 === 1);
      expect(row.getCell(5).value).toEqual(new Date('2026-01-01T00:00:00Z'));
      expect(row.getCell(6).value).toBeNull();
    }
    expect(sheet.getCell('A1').font.bold).toBe(true);
    expect(sheet.getCell('C2').numFmt).toBe('#,##0.00');
    expect(sheet.autoFilter).toBeTruthy();
    await expect.poll(() => page.evaluate(() => {
      const {urls, workers} = window.resources();
      return {urls, workers};
    })).toEqual({urls: 0, workers: 0});
    expect(await page.evaluate(() => window.resources().createdWorkers)).toBeGreaterThan(previousWorkers);
  }
  expect(errors).toEqual([]);
});

test('selected rows export across pages in grid sort order', async ({page}, info) => {
  await page.goto('/');
  await expect(page.locator('#status')).toHaveText('Ready');
  await page.evaluate(async () => {
    window.grid.columnOption('id', 'sortOrder', 'desc');
    await window.grid.selectRows([0, 25, 119], false);
  });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', {name: 'Export selected', exact: true}).click();
  const file = info.outputPath('selected.xlsx');
  await (await downloadPromise).saveAs(file);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const sheet = workbook.worksheets[0];
  expect(sheet.getColumn(1).values.slice(2)).toEqual([119, 25, 0]);
  expect(sheet.rowCount).toBe(4);
});
