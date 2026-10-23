// Existing browser scenarios explicitly approve every proposed new root.
// Selective/deferred decisions are covered by import-approval-browser-check.
export async function approveAllImportRecords(page){
 await page.waitForFunction(()=>document.querySelector('.import-approval-dialog[open]')||!document.querySelector('.import-mapping-dialog[open]'));
 const dialog=page.locator('.import-approval-dialog[open]');
 if(!await dialog.count())return; // Source adapters without the canonical model.
 for(let step=0;step<6;step++){
  const confirm=dialog.locator('[data-confirm-import]');
  if(await confirm.count()){await confirm.click();return;}
  const all=dialog.locator('[data-select-creations=all]');
  if(await all.count())await all.click();
  await dialog.locator('[data-approval-next]').click();
 }
 throw Error('Import approval did not reach final confirmation.');
}
