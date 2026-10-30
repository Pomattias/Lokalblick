-- Lokalblick v3 – fresh databases only. No migration path, no legacy columns.
-- SQLite 3.37+ (STRICT tables); dates use sortable ISO-8601 YYYY-MM-DD.
PRAGMA foreign_keys = ON;
PRAGMA application_id = 0x4c425633;
BEGIN;
CREATE TABLE parties (
 id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK(trim(name)<>''), organization_number TEXT UNIQUE,
 kind TEXT, owner_class TEXT, investment_rule TEXT, investment_threshold REAL,
 rent_surcharge_rate REAL CHECK(rent_surcharge_rate IS NULL OR rent_surcharge_rate>=0)
) STRICT;
CREATE TABLE people (
 id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK(trim(name)<>''), email TEXT, phone TEXT
) STRICT;
CREATE UNIQUE INDEX people_email_unique ON people(lower(email)) WHERE email IS NOT NULL;
CREATE TABLE party_people (
 id TEXT PRIMARY KEY, party_id TEXT NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
 person_id TEXT NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
 job_title TEXT, valid_from TEXT NOT NULL, valid_to TEXT, is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)),
 CHECK(valid_to IS NULL OR valid_to>=valid_from), UNIQUE(party_id,person_id,valid_from)
) STRICT;
CREATE TABLE properties (
 id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK(trim(name)<>''), popular_name TEXT,
 management_object_number TEXT, address TEXT, city TEXT, latitude REAL, longitude REAL,
 maintenance_responsibility TEXT CHECK(maintenance_responsibility IN ('owner','tenant') OR maintenance_responsibility IS NULL),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(latitude IS NULL OR (latitude BETWEEN -90 AND 90)),
 CHECK(longitude IS NULL OR (longitude BETWEEN -180 AND 180))
) STRICT;
CREATE TABLE objects (
 id TEXT PRIMARY KEY, property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
 object_number TEXT NOT NULL CHECK(trim(object_number)<>''), ended_on TEXT, notes TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(property_id,object_number)
) STRICT;
CREATE TABLE object_versions (
 id TEXT PRIMARY KEY, object_id TEXT NOT NULL REFERENCES objects(id) ON DELETE RESTRICT,
 valid_from TEXT NOT NULL, area REAL CHECK(area IS NULL OR area>=0),
 apartment_area REAL CHECK(apartment_area IS NULL OR apartment_area>=0),
 common_area REAL CHECK(common_area IS NULL OR common_area>=0),
 apartment_count INTEGER CHECK(apartment_count IS NULL OR apartment_count>=0),
 category TEXT, maintenance_responsibility TEXT CHECK(maintenance_responsibility IN ('owner','tenant') OR maintenance_responsibility IS NULL),
 notes TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, created_by TEXT,
 UNIQUE(object_id,valid_from)
) STRICT;
CREATE INDEX object_versions_by_date ON object_versions(object_id,valid_from DESC);
CREATE TABLE object_links (
 id TEXT PRIMARY KEY,
 predecessor_object_id TEXT NOT NULL REFERENCES objects(id) ON DELETE RESTRICT,
 successor_object_id TEXT NOT NULL REFERENCES objects(id) ON DELETE RESTRICT,
 effective_on TEXT NOT NULL, relation_type TEXT NOT NULL CHECK(relation_type IN ('split','merge','replacement')),
 notes TEXT, UNIQUE(predecessor_object_id,successor_object_id),
 CHECK(predecessor_object_id<>successor_object_id)
) STRICT;
CREATE TABLE agreements (
 id TEXT PRIMARY KEY, agreement_number TEXT NOT NULL UNIQUE CHECK(trim(agreement_number)<>''),
 object_id TEXT NOT NULL REFERENCES objects(id) ON DELETE RESTRICT,
 original_start_on TEXT, signed_on TEXT, notes TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
CREATE TABLE agreement_versions (
 id TEXT PRIMARY KEY, agreement_id TEXT NOT NULL REFERENCES agreements(id) ON DELETE RESTRICT,
 valid_from TEXT NOT NULL, legal_end_on TEXT, terminated_on TEXT, termination_reason TEXT,
 notice_months INTEGER, renewal_months INTEGER, notice_by TEXT, move_in TEXT, move_out TEXT,
 cost_center TEXT, customer_type TEXT, agreement_type TEXT, usage TEXT,
 business_description TEXT, workplace_count INTEGER, hub_count INTEGER, eb_category TEXT,
 main_contract_url TEXT, comment TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(agreement_id,valid_from),
 CHECK(legal_end_on IS NULL OR legal_end_on>=valid_from),
 CHECK(notice_months IS NULL OR notice_months>=0),
 CHECK(renewal_months IS NULL OR renewal_months>=0),
 CHECK(workplace_count IS NULL OR workplace_count>=0),
 CHECK(hub_count IS NULL OR hub_count>=0)
) STRICT;
CREATE INDEX agreement_versions_by_date ON agreement_versions(agreement_id,valid_from DESC);
CREATE TABLE agreement_items (
 id TEXT PRIMARY KEY, agreement_id TEXT NOT NULL REFERENCES agreements(id) ON DELETE RESTRICT,
 type TEXT NOT NULL CHECK(type IN ('base','addition','heat','water','electricity','cooling','waste','tax','other')),
 name TEXT NOT NULL, base_amount REAL NOT NULL CHECK(base_amount>=0),
 valid_from TEXT, valid_to TEXT, adjustment_method TEXT NOT NULL DEFAULT 'none'
 CHECK(adjustment_method IN ('none','kpi','fixed','kpi-limited')),
 base_year INTEGER, base_index REAL, index_share REAL, annual_percent REAL,
 min_percent REAL, max_percent REAL, limit_basis TEXT, series_base TEXT,
 floor INTEGER NOT NULL DEFAULT 1 CHECK(floor IN (0,1)),
 reconcilable INTEGER NOT NULL DEFAULT 0 CHECK(reconcilable IN (0,1)),
 reported_amount REAL, sources TEXT,
 CHECK(valid_from IS NULL OR valid_to IS NULL OR valid_from<=valid_to),
 CHECK(index_share IS NULL OR index_share BETWEEN 0 AND 1)
) STRICT;
CREATE INDEX agreement_items_by_period ON agreement_items(agreement_id,valid_from,valid_to);
CREATE TRIGGER base_rent_no_overlap_insert BEFORE INSERT ON agreement_items
 WHEN NEW.type='base' AND EXISTS(
 SELECT 1 FROM agreement_items a WHERE a.agreement_id=NEW.agreement_id AND a.type='base'
 AND coalesce(a.valid_from,'0000-01-01')<=coalesce(NEW.valid_to,'9999-12-31')
 AND coalesce(NEW.valid_from,'0000-01-01')<=coalesce(a.valid_to,'9999-12-31'))
 BEGIN SELECT RAISE(ABORT,'Endast en bashyra per avtal och datum'); END;
CREATE TRIGGER base_rent_no_overlap_update BEFORE UPDATE ON agreement_items
 WHEN NEW.type='base' AND EXISTS(
 SELECT 1 FROM agreement_items a WHERE a.id<>NEW.id AND a.agreement_id=NEW.agreement_id AND a.type='base'
 AND coalesce(a.valid_from,'0000-01-01')<=coalesce(NEW.valid_to,'9999-12-31')
 AND coalesce(NEW.valid_from,'0000-01-01')<=coalesce(a.valid_to,'9999-12-31'))
 BEGIN SELECT RAISE(ABORT,'Endast en bashyra per avtal och datum'); END;
CREATE TABLE issues (
 id TEXT PRIMARY KEY, property_id TEXT REFERENCES properties(id) ON DELETE RESTRICT,
 object_id TEXT REFERENCES objects(id) ON DELETE RESTRICT,
 agreement_id TEXT REFERENCES agreements(id) ON DELETE RESTRICT,
 title TEXT NOT NULL CHECK(trim(title)<>''), description TEXT, kind TEXT, category TEXT,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','ongoing','done')),
 priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high')),
 estimated_cost REAL, ordered_cost REAL, final_cost REAL, planned_from TEXT, planned_to TEXT,
 planning_year INTEGER, planning_quarter INTEGER, planning_month INTEGER,
 include_in_budget INTEGER, budget_category TEXT, value_increasing INTEGER,
 standard_enhancing INTEGER, maintenance_completed_on TEXT, maintenance_result TEXT,
 action_kind TEXT, rent_surcharge_start TEXT, unit_id TEXT, journal TEXT, sources TEXT, notes TEXT,
 CHECK((property_id IS NOT NULL)+(object_id IS NOT NULL)+(agreement_id IS NOT NULL)=1),
 CHECK(planned_from IS NULL OR planned_to IS NULL OR planned_from<=planned_to)
) STRICT;
CREATE TABLE orders (
 id TEXT PRIMARY KEY,
 issue_id TEXT REFERENCES issues(id) ON DELETE RESTRICT,
 property_id TEXT REFERENCES properties(id) ON DELETE RESTRICT,
 object_id TEXT REFERENCES objects(id) ON DELETE RESTRICT,
 title TEXT NOT NULL, amount REAL, status TEXT NOT NULL DEFAULT 'draft'
 CHECK(status IN ('draft','ordered','done')),
 ordered_by TEXT REFERENCES people(id) ON DELETE RESTRICT, ordered_at TEXT,
 final_cost REAL, supplier TEXT, reference TEXT, delivery TEXT, completed_at TEXT,
 payment_status TEXT, paid_at TEXT, invoice_comment TEXT, owner_pays INTEGER,
 CHECK((issue_id IS NOT NULL)+(property_id IS NOT NULL)+(object_id IS NOT NULL)=1)
) STRICT;
CREATE TABLE stakeholder_assignments (
 id TEXT PRIMARY KEY,
 property_id TEXT REFERENCES properties(id) ON DELETE RESTRICT,
 object_id TEXT REFERENCES objects(id) ON DELETE RESTRICT,
 agreement_id TEXT REFERENCES agreements(id) ON DELETE RESTRICT,
 issue_id TEXT REFERENCES issues(id) ON DELETE RESTRICT,
 order_id TEXT REFERENCES orders(id) ON DELETE RESTRICT,
 role_code TEXT NOT NULL CHECK(role_code IN ('owner','owner_contact','coordinator','tenant','tenant_contact','asset_manager','project_manager','contractor','consultant','supplier','invoice_recipient')),
 party_id TEXT REFERENCES parties(id) ON DELETE RESTRICT,
 person_id TEXT REFERENCES people(id) ON DELETE RESTRICT,
 valid_from TEXT NOT NULL, valid_to TEXT,
 is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)),
 shared INTEGER NOT NULL DEFAULT 0 CHECK(shared IN (0,1)),
 assignment_mode TEXT NOT NULL DEFAULT 'assign' CHECK(assignment_mode IN ('assign','block')),
 notes TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, created_by TEXT,
 CHECK((property_id IS NOT NULL)+(object_id IS NOT NULL)+(agreement_id IS NOT NULL)+(issue_id IS NOT NULL)+(order_id IS NOT NULL)=1),
 CHECK(valid_to IS NULL OR valid_to>=valid_from),
 CHECK((assignment_mode='block' AND party_id IS NULL AND person_id IS NULL)
 OR (assignment_mode='assign' AND party_id IS NOT NULL AND
 ((role_code IN ('owner','tenant') AND person_id IS NULL)
 OR (role_code IN ('contractor','consultant','supplier','invoice_recipient'))
 OR (role_code NOT IN ('owner','tenant','contractor','consultant','supplier','invoice_recipient') AND person_id IS NOT NULL)))),
 CHECK(role_code<>'tenant' OR agreement_id IS NOT NULL),
 CHECK(role_code NOT IN ('contractor','consultant') OR issue_id IS NOT NULL OR order_id IS NOT NULL),
 CHECK(role_code NOT IN ('supplier','invoice_recipient') OR order_id IS NOT NULL)
) STRICT;
CREATE INDEX stakeholder_by_property ON stakeholder_assignments(property_id,role_code,valid_from,valid_to);
CREATE INDEX stakeholder_by_object ON stakeholder_assignments(object_id,role_code,valid_from,valid_to);
CREATE INDEX stakeholder_by_agreement ON stakeholder_assignments(agreement_id,role_code,valid_from,valid_to);
CREATE INDEX stakeholder_by_issue ON stakeholder_assignments(issue_id,role_code,valid_from,valid_to);
CREATE INDEX stakeholder_by_order ON stakeholder_assignments(order_id,role_code,valid_from,valid_to);
CREATE TRIGGER stakeholder_prevent_overlap BEFORE INSERT ON stakeholder_assignments
 WHEN EXISTS (
 SELECT 1 FROM stakeholder_assignments s
 WHERE s.role_code=NEW.role_code
 AND s.property_id IS NEW.property_id AND s.object_id IS NEW.object_id
 AND s.agreement_id IS NEW.agreement_id AND s.issue_id IS NEW.issue_id AND s.order_id IS NEW.order_id
 AND (s.assignment_mode='block' OR NEW.assignment_mode='block' OR s.shared=0 OR NEW.shared=0)
 AND coalesce(s.valid_from,'0000-01-01')<=coalesce(NEW.valid_to,'9999-12-31')
 AND coalesce(NEW.valid_from,'0000-01-01')<=coalesce(s.valid_to,'9999-12-31'))
 BEGIN SELECT RAISE(ABORT,'Överlappande rollkoppling'); END;
CREATE TRIGGER stakeholder_prevent_overlap_update BEFORE UPDATE ON stakeholder_assignments
 WHEN EXISTS (
 SELECT 1 FROM stakeholder_assignments s
 WHERE s.id<>NEW.id AND s.role_code=NEW.role_code
 AND s.property_id IS NEW.property_id AND s.object_id IS NEW.object_id
 AND s.agreement_id IS NEW.agreement_id AND s.issue_id IS NEW.issue_id AND s.order_id IS NEW.order_id
 AND (s.assignment_mode='block' OR NEW.assignment_mode='block' OR s.shared=0 OR NEW.shared=0)
 AND coalesce(s.valid_from,'0000-01-01')<=coalesce(NEW.valid_to,'9999-12-31')
 AND coalesce(NEW.valid_from,'0000-01-01')<=coalesce(s.valid_to,'9999-12-31'))
 BEGIN SELECT RAISE(ABORT,'Överlappande rollkoppling'); END;
-- Every contact must represent a dated person-party membership.
CREATE TRIGGER stakeholder_member_insert BEFORE INSERT ON stakeholder_assignments
 WHEN NEW.person_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM party_people pp WHERE pp.party_id=NEW.party_id AND pp.person_id=NEW.person_id
 AND pp.valid_from<=NEW.valid_from AND
 (pp.valid_to IS NULL OR (NEW.valid_to IS NOT NULL AND pp.valid_to>=NEW.valid_to)))
 BEGIN SELECT RAISE(ABORT,'Person saknar giltig partkoppling'); END;
CREATE TRIGGER stakeholder_member_update BEFORE UPDATE ON stakeholder_assignments
 WHEN NEW.person_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM party_people pp WHERE pp.party_id=NEW.party_id AND pp.person_id=NEW.person_id
 AND pp.valid_from<=NEW.valid_from AND
 (pp.valid_to IS NULL OR (NEW.valid_to IS NOT NULL AND pp.valid_to>=NEW.valid_to)))
 BEGIN SELECT RAISE(ABORT,'Person saknar giltig partkoppling'); END;
CREATE TABLE recurring_costs (
 id TEXT PRIMARY KEY, property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
 category TEXT NOT NULL CHECK(category IN ('heat','water','electricity','cooling','waste','other')),
 name TEXT NOT NULL, annual_amount REAL NOT NULL CHECK(annual_amount>=0),
 valid_from TEXT, valid_to TEXT, invoice_complete_years TEXT, sources TEXT,
 CHECK(valid_from IS NULL OR valid_to IS NULL OR valid_from<=valid_to)
) STRICT;
CREATE TABLE cost_evidence (
 id TEXT PRIMARY KEY, cost_id TEXT NOT NULL REFERENCES recurring_costs(id) ON DELETE RESTRICT,
 type TEXT NOT NULL CHECK(type IN ('annual','invoice')),
 year INTEGER, amount REAL NOT NULL, selected INTEGER NOT NULL DEFAULT 1 CHECK(selected IN (0,1)),
 invoice_reference TEXT, invoice_date TEXT, valid_from TEXT, valid_to TEXT,
 document_url TEXT, sources TEXT,
 CHECK((type='annual' AND year IS NOT NULL) OR
 (type='invoice' AND invoice_reference IS NOT NULL AND valid_from IS NOT NULL AND valid_to IS NOT NULL AND valid_from<=valid_to))
) STRICT;
CREATE UNIQUE INDEX annual_evidence_unique ON cost_evidence(cost_id,year) WHERE type='annual';
CREATE UNIQUE INDEX invoice_evidence_unique ON cost_evidence(cost_id,invoice_reference) WHERE type='invoice';
CREATE TABLE budgets (
 id TEXT PRIMARY KEY, property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
 budget_year INTEGER NOT NULL CHECK(budget_year BETWEEN 1900 AND 9999),
 scenario TEXT NOT NULL DEFAULT 'base', version INTEGER NOT NULL CHECK(version>=1),
 scenario_index REAL CHECK(scenario_index IS NULL OR scenario_index>0),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','locked')),
 locked_at TEXT, created_by TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, notes TEXT,
 UNIQUE(property_id,budget_year,scenario,version),
 CHECK(status<>'locked' OR locked_at IS NOT NULL)
) STRICT;
CREATE TABLE budget_lines (
 id TEXT PRIMARY KEY, budget_id TEXT NOT NULL REFERENCES budgets(id) ON DELETE RESTRICT,
 cost_id TEXT REFERENCES recurring_costs(id) ON DELETE RESTRICT,
 issue_id TEXT REFERENCES issues(id) ON DELETE RESTRICT,
 line_type TEXT NOT NULL CHECK(line_type IN ('revenue','operating','investment','other')),
 category TEXT, name TEXT NOT NULL, budget_amount REAL NOT NULL, notes TEXT,
 CHECK((cost_id IS NOT NULL)+(issue_id IS NOT NULL)<=1)
) STRICT;
-- Frozen budgets must remain immutable, including their lines.
CREATE TRIGGER budget_locked_update BEFORE UPDATE ON budgets WHEN OLD.status='locked'
 BEGIN SELECT RAISE(ABORT,'Låst budget får inte ändras'); END;
CREATE TRIGGER budget_locked_delete BEFORE DELETE ON budgets WHEN OLD.status='locked'
 BEGIN SELECT RAISE(ABORT,'Låst budget får inte tas bort'); END;
CREATE TRIGGER budget_line_locked_insert BEFORE INSERT ON budget_lines
 WHEN EXISTS(SELECT 1 FROM budgets b WHERE b.id=NEW.budget_id AND b.status='locked')
 BEGIN SELECT RAISE(ABORT,'Låst budget får inte ändras'); END;
CREATE TRIGGER budget_line_locked_update BEFORE UPDATE ON budget_lines
 WHEN EXISTS(SELECT 1 FROM budgets b WHERE b.id=OLD.budget_id AND b.status='locked')
 OR EXISTS(SELECT 1 FROM budgets b WHERE b.id=NEW.budget_id AND b.status='locked')
 BEGIN SELECT RAISE(ABORT,'Låst budget får inte ändras'); END;
CREATE TRIGGER budget_line_locked_delete BEFORE DELETE ON budget_lines
 WHEN EXISTS(SELECT 1 FROM budgets b WHERE b.id=OLD.budget_id AND b.status='locked')
 BEGIN SELECT RAISE(ABORT,'Låst budget får inte ändras'); END;
CREATE TABLE spaces (
 id TEXT PRIMARY KEY, property_id TEXT REFERENCES properties(id) ON DELETE RESTRICT,
 object_id TEXT REFERENCES objects(id) ON DELETE RESTRICT,
 name TEXT NOT NULL, floor TEXT, notes TEXT,
 CHECK((property_id IS NOT NULL)+(object_id IS NOT NULL)=1)
) STRICT;
CREATE TABLE building_parts (
 id TEXT PRIMARY KEY, space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE RESTRICT,
 name TEXT NOT NULL, responsibility TEXT CHECK(responsibility IN ('owner','tenant') OR responsibility IS NULL),
 kind TEXT, notes TEXT
) STRICT;
CREATE TABLE inspections (
 id TEXT PRIMARY KEY, property_id TEXT REFERENCES properties(id) ON DELETE RESTRICT,
 object_id TEXT REFERENCES objects(id) ON DELETE RESTRICT,
 inspected_on TEXT, inspector_id TEXT REFERENCES people(id) ON DELETE RESTRICT,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','completed')),
 notes TEXT, sources TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK((property_id IS NOT NULL)+(object_id IS NOT NULL)=1)
) STRICT;
CREATE TABLE inspection_points (
 id TEXT PRIMARY KEY, inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE RESTRICT,
 part_id TEXT REFERENCES building_parts(id) ON DELETE RESTRICT,
 space_id TEXT REFERENCES spaces(id) ON DELETE RESTRICT,
 assessment TEXT NOT NULL DEFAULT 'unchecked' CHECK(assessment IN ('unchecked','excellent','good','ok','defect','urgent')),
 comment TEXT, last_action TEXT, photo_reference TEXT,
 issue_id TEXT REFERENCES issues(id) ON DELETE RESTRICT, source_plans TEXT, sources TEXT,
 CHECK((part_id IS NOT NULL)+(space_id IS NOT NULL)=1)
) STRICT;
CREATE UNIQUE INDEX inspection_once_per_part ON inspection_points(inspection_id,part_id) WHERE part_id IS NOT NULL;
CREATE UNIQUE INDEX inspection_once_per_space ON inspection_points(inspection_id,space_id) WHERE space_id IS NOT NULL;
CREATE TRIGGER inspection_completed_update BEFORE UPDATE ON inspections WHEN OLD.status='completed'
 BEGIN SELECT RAISE(ABORT,'Avslutad besiktning är låst'); END;
CREATE TRIGGER inspection_completed_delete BEFORE DELETE ON inspections WHEN OLD.status='completed'
 BEGIN SELECT RAISE(ABORT,'Avslutad besiktning är låst'); END;
CREATE TRIGGER inspection_points_completed_insert BEFORE INSERT ON inspection_points
 WHEN EXISTS(SELECT 1 FROM inspections i WHERE i.id=NEW.inspection_id AND i.status='completed')
 BEGIN SELECT RAISE(ABORT,'Avslutad besiktning är låst'); END;
CREATE TRIGGER inspection_points_completed_update BEFORE UPDATE ON inspection_points
 WHEN EXISTS(SELECT 1 FROM inspections i WHERE i.id=OLD.inspection_id AND i.status='completed')
 OR EXISTS(SELECT 1 FROM inspections i WHERE i.id=NEW.inspection_id AND i.status='completed')
 BEGIN SELECT RAISE(ABORT,'Avslutad besiktning är låst'); END;
CREATE TRIGGER inspection_points_completed_delete BEFORE DELETE ON inspection_points
 WHEN EXISTS(SELECT 1 FROM inspections i WHERE i.id=OLD.inspection_id AND i.status='completed')
 BEGIN SELECT RAISE(ABORT,'Avslutad besiktning är låst'); END;
CREATE TABLE store_meta (
 id INTEGER PRIMARY KEY CHECK(id=1), model_version INTEGER NOT NULL CHECK(model_version=3),
 version INTEGER NOT NULL DEFAULT 0
) STRICT;
INSERT INTO store_meta(id,model_version,version) VALUES (1,3,0);
COMMIT;
