/* One resolver for all document references. Never fetches company documents. */
(function (root) {
  function fromContract(c) {
    return {
      id: "document:" + c.id,
      contractId: c.id,
      name: c.contractDocumentName || c.number || "Avtalsdokument",
      reference: c.contractDocumentUrl || "",
      kind: c.contractDocumentKind || "",
      source: c.enrichmentSource || c.source || "",
    };
  }
  function resolve(doc, cache) {
    const ref = String(doc.reference || "").trim();
    if (!ref) return { ...doc, status: "missing", label: "Dokument saknas" };
    if (/^https?:\/\//i.test(ref)) {
      try {
        const u = new URL(ref);
        if (u.username || u.password)
          return { ...doc, status: "blocked", label: "Ogiltig dokumentlänk" };
        return {
          ...doc,
          status: "ready",
          href: u.href,
          label: "Öppna dokument",
        };
      } catch {}
    }
    if (
      /^embedded:\/\//i.test(ref) &&
      /^blob:/.test(cache?.[ref.slice(11)] || "")
    )
      return {
        ...doc,
        status: "ready",
        href: cache[ref.slice(11)],
        label: "Öppna inbäddad PDF",
      };
    if (/^embedded:\/\//i.test(ref))
      return {
        ...doc,
        status: "reconnect",
        label: "Återanslut underlaget för inbäddad PDF",
      };
    if (/^(?:file:|[a-z]:[\\/]|\\\\)/i.test(ref))
      return {
        ...doc,
        status: "local",
        label: "Lokal referens – öppna i företagets filhanterare",
      };
    if (/^[\w .ÅÄÖåäö()-]+\.pdf$/i.test(ref))
      return {
        ...doc,
        status: "filename",
        label: "Filnamn – sök i dokumentkällan",
      };
    return {
      ...doc,
      status: "blocked",
      label: "Referensen behöver kontrolleras",
    };
  }
  function match(doc, contracts) {
    const name = String(doc.name || "")
      .replace(/\.pdf$/i, "")
      .trim()
      .toUpperCase();
    const hits = contracts.filter(
      (c) =>
        String(c.number || "")
          .trim()
          .toUpperCase() === name && name,
    );
    return hits.length === 1
      ? { contractId: hits[0].id, status: "matched" }
      : { status: "review", candidates: hits.map((x) => x.id) };
  }
  root.LokalblickDocuments = { fromContract, resolve, match };
})(globalThis);
