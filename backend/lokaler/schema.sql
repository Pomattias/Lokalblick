PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS parties (
 id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL CHECK(trim(name) <> ''),
 UNIQUE(name COLLATE NOCASE)
) STRICT;
CREATE TABLE IF NOT EXISTS people (
 id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL CHECK(trim(name) <> ''),
 email TEXT, phone TEXT
) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS people_email ON people(lower(email)) WHERE email IS NOT NULL;
CREATE TABLE IF NOT EXISTS properties (
 id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL CHECK(trim(name) <> ''),
 popular_name TEXT, address TEXT, owner_party_id TEXT REFERENCES parties(id) ON DELETE RESTRICT
) STRICT;
CREATE TABLE IF NOT EXISTS objects (
 id TEXT PRIMARY KEY NOT NULL, property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
 name TEXT NOT NULL CHECK(trim(name) <> ''), area REAL CHECK(area >= 0),
 apartment_count INTEGER CHECK(apartment_count >= 0), valid_from TEXT, valid_to TEXT,
 CHECK(valid_from IS NULL OR valid_to IS NULL OR valid_from <= valid_to)
) STRICT;
CREATE TABLE IF NOT EXISTS agreements (
 id TEXT PRIMARY KEY NOT NULL, object_id TEXT NOT NULL REFERENCES objects(id) ON DELETE RESTRICT,
 number TEXT NOT NULL UNIQUE CHECK(trim(number) <> ''), tenant_party_id TEXT REFERENCES parties(id) ON DELETE RESTRICT,
 annual_rent REAL CHECK(annual_rent >= 0), valid_from TEXT, valid_to TEXT,
 terminated_on TEXT, termination_reason TEXT, usage TEXT, business_comment TEXT,
 staff_count TEXT, eb_category TEXT, main_contract_url TEXT,
 CHECK(valid_from IS NULL OR valid_to IS NULL OR valid_from <= valid_to)
) STRICT;
CREATE TABLE IF NOT EXISTS issues (
 id TEXT PRIMARY KEY NOT NULL, property_id TEXT REFERENCES properties(id) ON DELETE RESTRICT,
 object_id TEXT REFERENCES objects(id) ON DELETE RESTRICT,
 title TEXT NOT NULL CHECK(trim(title) <> ''), description TEXT,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','ongoing','done')),
 priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high')),
 estimated_cost REAL CHECK(estimated_cost >= 0), planned_from TEXT, planned_to TEXT, notes TEXT,
 CHECK((property_id IS NOT NULL) + (object_id IS NOT NULL) = 1),
 CHECK(planned_from IS NULL OR planned_to IS NULL OR planned_from <= planned_to)
) STRICT;
CREATE TABLE IF NOT EXISTS orders (
 id TEXT PRIMARY KEY NOT NULL, issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE RESTRICT,
 title TEXT NOT NULL CHECK(trim(title) <> ''), amount REAL CHECK(amount >= 0),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','ordered','done'))
) STRICT;
CREATE TABLE IF NOT EXISTS contacts (
 id TEXT PRIMARY KEY NOT NULL, person_id TEXT NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
 role TEXT NOT NULL CHECK(role IN ('owner','coordinator','tenant','business')),
 property_id TEXT REFERENCES properties(id) ON DELETE RESTRICT,
 agreement_id TEXT REFERENCES agreements(id) ON DELETE RESTRICT,
 issue_id TEXT REFERENCES issues(id) ON DELETE RESTRICT,
 order_id TEXT REFERENCES orders(id) ON DELETE RESTRICT,
 valid_from TEXT, valid_to TEXT, cancelled INTEGER NOT NULL DEFAULT 0 CHECK(cancelled IN (0,1)),
 CHECK((property_id IS NOT NULL) + (agreement_id IS NOT NULL) + (issue_id IS NOT NULL) + (order_id IS NOT NULL) = 1),
 CHECK(role <> 'owner' OR property_id IS NOT NULL),
 CHECK(role NOT IN ('tenant','business') OR agreement_id IS NOT NULL),
 CHECK(valid_from IS NULL OR valid_to IS NULL OR valid_from <= valid_to)
) STRICT;
CREATE TABLE IF NOT EXISTS object_links (
 id TEXT PRIMARY KEY NOT NULL, predecessor_id TEXT NOT NULL REFERENCES objects(id) ON DELETE RESTRICT,
 successor_id TEXT NOT NULL REFERENCES objects(id) ON DELETE RESTRICT,
 CHECK(predecessor_id <> successor_id), UNIQUE(predecessor_id, successor_id)
) STRICT;
CREATE INDEX IF NOT EXISTS objects_property ON objects(property_id);
CREATE INDEX IF NOT EXISTS agreements_object ON agreements(object_id);
CREATE INDEX IF NOT EXISTS issues_property ON issues(property_id);
CREATE INDEX IF NOT EXISTS issues_object ON issues(object_id);
CREATE INDEX IF NOT EXISTS orders_issue ON orders(issue_id);
CREATE INDEX IF NOT EXISTS contacts_property ON contacts(property_id, role);
CREATE INDEX IF NOT EXISTS contacts_agreement ON contacts(agreement_id, role);
CREATE INDEX IF NOT EXISTS contacts_issue ON contacts(issue_id, role);
CREATE INDEX IF NOT EXISTS contacts_order ON contacts(order_id, role);
CREATE TRIGGER IF NOT EXISTS agreement_overlap_insert BEFORE INSERT ON agreements
WHEN EXISTS (SELECT 1 FROM agreements a WHERE a.object_id = NEW.object_id
 AND coalesce(a.valid_from, '0000-01-01') <= coalesce(NEW.valid_to, '9999-12-31')
 AND coalesce(NEW.valid_from, '0000-01-01') <= coalesce(a.valid_to, '9999-12-31'))
BEGIN SELECT RAISE(ABORT, 'Objektet har redan ett avtal under perioden.'); END;
CREATE TRIGGER IF NOT EXISTS agreement_overlap_update BEFORE UPDATE ON agreements
WHEN EXISTS (SELECT 1 FROM agreements a WHERE a.id <> NEW.id AND a.object_id = NEW.object_id
 AND coalesce(a.valid_from, '0000-01-01') <= coalesce(NEW.valid_to, '9999-12-31')
 AND coalesce(NEW.valid_from, '0000-01-01') <= coalesce(a.valid_to, '9999-12-31'))
BEGIN SELECT RAISE(ABORT, 'Objektet har redan ett avtal under perioden.'); END;
CREATE TRIGGER IF NOT EXISTS contact_overlap_insert BEFORE INSERT ON contacts
WHEN NEW.cancelled = 0 AND EXISTS (SELECT 1 FROM contacts c WHERE c.cancelled = 0 AND c.role = NEW.role
 AND c.property_id IS NEW.property_id AND c.agreement_id IS NEW.agreement_id
 AND c.issue_id IS NEW.issue_id AND c.order_id IS NEW.order_id
 AND (NEW.role = 'coordinator' OR c.person_id = NEW.person_id)
 AND coalesce(c.valid_from, '0000-01-01') <= coalesce(NEW.valid_to, '9999-12-31')
 AND coalesce(NEW.valid_from, '0000-01-01') <= coalesce(c.valid_to, '9999-12-31'))
BEGIN SELECT RAISE(ABORT, 'Personkopplingen överlappar en befintlig koppling. Avsluta den tidigare perioden först.'); END;
CREATE TRIGGER IF NOT EXISTS contact_overlap_update BEFORE UPDATE ON contacts
WHEN NEW.cancelled = 0 AND EXISTS (SELECT 1 FROM contacts c WHERE c.cancelled = 0 AND c.id <> NEW.id AND c.role = NEW.role
 AND c.property_id IS NEW.property_id AND c.agreement_id IS NEW.agreement_id
 AND c.issue_id IS NEW.issue_id AND c.order_id IS NEW.order_id
 AND (NEW.role = 'coordinator' OR c.person_id = NEW.person_id)
 AND coalesce(c.valid_from, '0000-01-01') <= coalesce(NEW.valid_to, '9999-12-31')
 AND coalesce(NEW.valid_from, '0000-01-01') <= coalesce(c.valid_to, '9999-12-31'))
BEGIN SELECT RAISE(ABORT, 'Personkopplingen överlappar en befintlig koppling. Avsluta den tidigare perioden först.'); END;
CREATE TABLE IF NOT EXISTS workspace (
 key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL CHECK(json_valid(value))
) STRICT;
