// The tests explicitly select every new root in the single review surface.
// Product code never preselects new properties, objects or agreements.
export async function approveAllImportRecords(page){
 const dialog=page.locator('.import-mapping-dialog[open]');
 if(!await dialog.count())return;
 const mode=dialog.locator('[data-import-new-mode]');if(await mode.count())await mode.selectOption('include');
 const list=dialog.locator('[data-new-records]');
 if(await list.count()){
  await list.evaluate(node=>node.open=true);
  await list.locator('[data-select-creations=all]').click();
 }
 await dialog.locator('[data-apply]').click();
}

// Only test fixtures expand advanced settings automatically. The product keeps
// them behind the corresponding column header and uses one selection control.
export async function revealImportSettings(page){
 await page.locator('.import-mapping-dialog details[data-sheet-settings],.import-mapping-dialog details[data-import-enrichment],.import-mapping-dialog details[data-final-impact]').evaluateAll(nodes=>nodes.forEach(node=>node.open=true));
}

// Open advanced settings from the same field control used by the user.
export async function withImportColumnSettings(page,column,inspect){
 const header=typeof column==='string'?page.locator('[data-import-column]').filter({has:page.locator('.import-column-name strong',{hasText:column})}):column;
 await header.locator('[data-preview-map]').selectOption('@settings');
 const settings=page.locator('.import-column-settings-dialog[open]');
 await inspect(settings);
 await page.locator('.import-mapping-dialog[aria-busy=false]').waitFor();
 await settings.locator('[data-settings-close]').click();
}
