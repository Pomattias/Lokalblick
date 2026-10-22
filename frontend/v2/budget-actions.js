/** Route budget buttons through the app's mutation boundary.
 * getData reads the current workspace after asynchronous saves replace it.
 * mutation retains ownership of validation, auditing, persistence and rollback.
 * Other buttons are ignored; no event listeners or global state are installed. */
export async function handleBudgetAction(
  button,
  {
    getData,
    ui,
    mutation,
    actor,
    render,
    showBudgetAdjustment,
    loadBudgetIndex,
    calc,
    clone,
    confirm = (message) => globalThis.confirm(message),
  },
) {
  if (button.dataset.budgetAdjust)
    showBudgetAdjustment(button.dataset.budgetAdjust);
  if (
    button.hasAttribute("data-budget-reopen") &&
    confirm(
      "Skapa ny budgetversion " +
        ui.year +
        "? Den låsta versionen sparas i historiken.",
    )
  ) {
    await mutation((d) => {
      const plan = d.budgetPlans.find((p) => Number(p.year) === ui.year);
      globalThis.LokalblickBudgetFollowup.beginVersion(
        plan,
        "Ny arbetsbudget från låst version",
        actor(),
      );
    });
    await loadBudgetIndex(ui.year);
  }
  if (button.hasAttribute("data-budget-index")) {
    await loadBudgetIndex(ui.year, true);
    return;
  }
  if (button.hasAttribute("data-budget-index-reset")) {
    const plan = getData().budgetPlans.find((p) => Number(p.year) === ui.year);
    if (plan?.status === "Låst") throw Error("Skapa en ny budgetversion först");
    if (Number(plan?.preliminaryIndex) > 0) {
      await mutation((d) => {
        const target = d.budgetPlans.find((p) => Number(p.year) === ui.year);
        if (!target || target.status === "Låst")
          throw Error("Budgeten är låst");
        target.preliminaryIndex = 0;
        target.preliminaryIndexUpdatedAt = new Date().toISOString();
        target.preliminaryIndexUpdatedBy = actor();
        target.targets = calc().summarize(calc().budgetProposal(d, ui.year));
      });
    } else render();
    return;
  }
  if (button.hasAttribute("data-budget-create"))
    await mutation((d) => {
      const live = calc().budgetRows(d, ui.year);
      d.budgetPlans.push({
        year: ui.year,
        status: "Arbetsbudget",
        createdAt: new Date().toISOString(),
        preliminaryIndex: 0,
        adjustments: {},
        lines: [],
        targets: calc().summarize(live),
        notes: {},
      });
    });
  if (
    button.hasAttribute("data-budget-lock") &&
    confirm("Lås budget " + ui.year + " som baslinje?")
  )
    await mutation((d) => {
      const plan = d.budgetPlans.find((p) => Number(p.year) === ui.year);
      if (!plan || plan.status === "Låst") return;
      const live = calc().budgetProposal(d, ui.year, { strict: true });
      const lockedIndex = calc().budgetIndex(d, ui.year, plan.preliminaryIndex);
      plan.lines = live.map((line) => ({
        ...line,
        lockedAt: new Date().toISOString(),
        lockedBy: actor(),
        indexSnapshot: clone(lockedIndex),
        sourceSnapshot: clone(
          (
            d[line.sourceType === "contract" ? "contracts" : "activities"] || []
          ).find((x) => x.id === line.sourceId) || {},
        ),
      }));
      plan.targets = calc().summarize(plan.lines);
      plan.lockedIndexMonth = lockedIndex.month;
      plan.lockedIndexStatus = lockedIndex.status;
      plan.lockedIndexYear = lockedIndex.year;
      plan.lockedIndexValue = lockedIndex.value;
      plan.lockedIndexSource = lockedIndex.source;
      plan.status = "Låst";
      plan.lockedAt = new Date().toISOString();
      plan.lockedBy = actor();
    });
}
