import { esc, options } from "./views.js";

const ourPerson = (data, person) =>
  (person.organizationId &&
    (data.organizations || []).some(org => org.id === person.organizationId && org.type === "our")) ||
  (!person.organizationId && !/^Verksamhetsansvarig$/i.test(String(person.role || "")));

export function propertyPersonChoices(root, data, select) {
  const kind = select.dataset.propertyPersonSelect;
  const ownerId = root.querySelector('[data-owner-select]')?.value || "";
  const all = data.people || [];
  const selected = select.value;
  const people = kind === "owner"
    ? all.filter(p => p.organizationId === ownerId || p.id === selected)
    : kind === "our"
      ? all.filter(p => ourPerson(data, p) || p.id === selected)
      : all;
  return people;
}

export function refreshPropertyPersonSelectors(root, data, preferred = {}) {
  root.querySelectorAll('[data-property-person-select]').forEach(select => {
    const kind = select.dataset.propertyPersonSelect;
    const contractId = select.dataset.propertyContractContact || "";
    const current = kind === preferred.kind &&
      (kind !== "contract" || contractId === preferred.contractId)
      ? preferred.id : select.value;
    // Retain a just-selected existing reference when listing people from a
    // different owner; other owner changes must explicitly clear the contact.
    const people = propertyPersonChoices(root, data, select);
    if (current && !people.some(person => person.id === current)) {
      const person = data.people.find(p => p.id === current);
      if (person && kind !== "owner") people.push(person);
    }
    select.innerHTML = options(people, p=>p.id, p=>p.name, current || "", "Ej kopplad");
    select.value = people.some(p=>p.id===current) ? current : "";
    const panel=select.closest('.property-person-field,.property-person-inline');
    const edit=panel?.querySelector('[data-person-edit]');
    if (edit) edit.disabled = !select.value;
  });
}

export function contextPersonSelect(root, kind, contractId = "") {
  if (kind === "contract")
    return [...root.querySelectorAll('[data-property-contract-contact]')]
      .find(x=>x.dataset.propertyContractContact===contractId) || null;
  return root.querySelector('[data-property-person-select="'+kind+'"]');
}

export function newPersonDefaults(root, data, kind, contractId = "") {
  if (kind === "owner") {
    const organizationId = root.querySelector('[data-owner-select]')?.value || "";
    if (!organizationId) throw Error("Välj fastighetsägare innan du lägger till en kontaktperson.");
    return { organizationId, role:"Kontaktperson" };
  }
  if (kind === "our") {
    const org=(data.organizations||[]).find(x=>x.type==="our");
    return { organizationId:org?.id || "", role:"Kontaktperson" };
  }
  if (kind === "contract") {
    const contract=(data.contracts||[]).find(x=>x.id===contractId);
    if (!contract) throw Error("Avtalet kunde inte hittas.");
    const tenant=(data.organizations||[]).find(x=>x.type==="tenant");
    return { organizationId:tenant?.id || "", unitId:contract.unitId || "", role:"Verksamhetsansvarig" };
  }
  throw Error("Okänd kontaktroll.");
}

export function personFormHtml(person, isNew) {
  return '<form id="property-person-form" class="property-person-form">'+
    '<div class="section-title"><div><small>PERSONREGISTER</small>'+
    '<h2>'+(isNew?"Ny person":"Redigera person")+'</h2></div>'+
    '<button type="button" data-person-dialog-close>Stäng</button></div>'+
    '<p>'+(isNew
      ?"Personen sparas i det gemensamma registret. Kopplingen till fastigheten sparas när du sparar Fastighet."
      :"Ändringar av en person gäller på alla fastigheter och avtal där personen används.")+'</p>'+
    '<label>Namn <input name="name" required maxlength="160" value="'+esc(person.name||"")+'"></label>'+
    '<label>Befattning <input name="role" maxlength="160" value="'+esc(person.role||"")+'"></label>'+
    '<label>Telefonnummer <input name="phone" type="tel" autocomplete="tel" maxlength="50" value="'+esc(person.phone||"")+'"></label>'+
    '<label>E-post <input name="email" type="email" maxlength="254" value="'+esc(person.email||"")+'"></label>'+
    '<div class="actions"><button type="button" data-person-dialog-close>Avbryt</button>'+
    '<button type="submit" class="primary">Spara person</button></div></form>';
}

export function updatedPersonRecord(person, formData) {
  const name = String(formData.get("name") || "").trim();
  const role = String(formData.get("role") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const email = String(formData.get("email") || "").trim();
  if (!name) throw Error("Ange personens namn.");
  if (name.length > 160 || role.length > 160 || phone.length > 50 || email.length > 254)
    throw Error("Personens uppgifter är för långa.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw Error("Ange en giltig e-postadress.");
  return {...person, name, role, phone, email};
}
