/* Column mapping stays in the adapter. Every supplemental row is a proposal. */
(function (root) {
  const norm = (v) =>
    String(v ?? "")
      .trim()
      .toLocaleLowerCase("sv")
      .replace(/[^a-zåäö0-9]/g, "");
  const clone = (v) => JSON.parse(JSON.stringify(v));
  function analyze(workbook, data, schema, fileName) {
    const output = clone(data),
      review = output.importReview || (output.importReview = []);
    let count = 0;
    const aliases = {
      title: ["Åtgärd", "Ärende", "Önskemål", "Aktivitet", "Rubrik"],
      name: ["Projekt", "Namn", "Aktivitet"],
      propertyId: ["Fastighet ID"],
      contractId: ["Avtal ID"],
      budgetYear: ["Budgetår", "Planår", "År"],
      year: ["Planår", "År", "Budgetår"],
      period: ["År"],
      estimatedCost: ["Bedömd kostnad", "Kostnad", "Belopp"],
      cost: ["Kostnad", "Bedömd kostnad", "Belopp"],
    };
    for (const sheetName of workbook.SheetNames) {
      const matrix = root.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
        defval: "",
      });
      let headerIndex = -1,
        best = 0;
      for (let i = 0; i < Math.min(matrix.length, 10); i++) {
        const hits = matrix[i].filter((x) =>
          schema.columns.some(([key, label]) =>
            [key, label, ...(aliases[key] || [])].some(
              (a) => norm(a) === norm(x),
            ),
          ),
        ).length;
        if (hits > best) {
          best = hits;
          headerIndex = i;
        }
      }
      if (best < 2) continue;
      const headers = matrix[headerIndex];
      const at = (row, names) => {
        const index = headers.findIndex((h) =>
          names.some((n) => norm(h) === norm(n)),
        );
        return index < 0 ? "" : row[index];
      };
      for (let r = headerIndex + 1; r < matrix.length; r++) {
        const row = matrix[r];
        if (!row.some((v) => String(v).trim())) continue;
        const record = {};
        schema.columns.forEach(([key, label]) => {
          const value = at(row, [label, key, ...(aliases[key] || [])]);
          if (value !== "") {
            const numeric =
              /^(area|year|period|budget|cost|estimatedCost|preliminaryCost|finalCost|actual|planning|orderedCost|employees|users|rooms)/.test(
                key,
              );
            if (numeric && typeof value === "string") {
              const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
              if (!Number.isFinite(parsed))
                throw Error(
                  "Ogiltigt tal i " +
                    sheetName +
                    ", rad " +
                    (r + 1) +
                    ": " +
                    label,
                );
              record[key] = parsed;
            } else record[key] = value;
          }
        });
        if (!Object.keys(record).length) continue;
        const number = at(row, ["Avtalsnummer", "Avtal"]);
        const cs = number
          ? output.contracts.filter((c) => norm(c.number) === norm(number))
          : [];
        const address = at(row, ["Adress", "Gatuadress", "Fastighet"]);
        const ps = address
          ? output.properties.filter(
              (p) =>
                norm(p.address) === norm(address) ||
                norm(p.designation) === norm(address),
            )
          : [];
        if (cs.length === 1) {
          record.contractId = cs[0].id;
          record.propertyId = cs[0].propertyId;
        } else if (ps.length === 1) record.propertyId = ps[0].id;
        const property = output.properties.find(
          (p) => p.id === record.propertyId,
        );
        const matches = (output[schema.key] || []).filter((x) =>
          record.id
            ? x.id === record.id
            : record.sourceId
              ? x.sourceId === record.sourceId
              : false,
        );
        review.push({
          id: root.crypto.randomUUID(),
          kind: "record",
          collection: schema.key,
          source: fileName,
          sheet: sheetName,
          row: r + 1,
          record,
          recordId: matches.length === 1 ? matches[0].id : "",
          status: "pending",
          requiresProperty: !property,
          address: String(address),
          number: String(number),
        });
        count++;
      }
    }
    if (!count)
      throw Error(
        "Inga igenkända rader. Använd Lokalblicks kolumnrubriker eller kopiera till en kanonisk tabell.",
      );
    (output.sourceRegistry || (output.sourceRegistry = [])).push({
      id: root.crypto.randomUUID(),
      name: fileName,
      kind: schema.key,
      rows: count,
      importedAt: new Date().toISOString(),
    });
    return { data: output, report: { sourceRows: count, needsReview: count } };
  }
  root.LokalblickSupplementalAdapter = { analyze };
})(globalThis);
