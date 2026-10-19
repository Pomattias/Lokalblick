import { emptyData } from './model.js';
// Synthetic demonstration data only. This module never reads company data.
export function demoData() {
 const data = emptyData();
 data.parties = [{ id: 'PAR-1', name: 'Exempelhus AB' }, { id: 'PAR-2', name: 'Kulturförvaltningen (exempel)' }];
 data.people = [{ id: 'PER-1', name: 'Alex Lind', email: 'alex@example.invalid', phone: null }, { id: 'PER-2', name: 'Kim Berg', email: 'kim@example.invalid', phone: null }, { id: 'PER-3', name: 'Robin Ek', email: null, phone: null }];
 data.properties = [{ id: 'FAS-1', name: 'Eken 4', popular_name: 'Kulturhuset', address: 'Exempelvägen 12', owner_party_id: 'PAR-1' }, { id: 'FAS-2', name: 'Björken 2', popular_name: null, address: 'Exempelgatan 8', owner_party_id: 'PAR-1' }];
 data.objects = [{ id: 'OBJ-1', property_id: 'FAS-1', name: 'Bibliotek', area: 480, apartment_count: null, valid_from: null, valid_to: null }, { id: 'OBJ-2', property_id: 'FAS-1', name: 'Samlingslokal', area: 120, apartment_count: null, valid_from: null, valid_to: null }, { id: 'OBJ-3', property_id: 'FAS-2', name: 'Bostäder', area: 320, apartment_count: 5, valid_from: null, valid_to: null }];
 data.agreements = [{ id: 'AVT-1', object_id: 'OBJ-1', number: '2026-01', tenant_party_id: 'PAR-2', annual_rent: 864000, valid_from: '2026-01-01', valid_to: '2029-12-31' }, { id: 'AVT-2', object_id: 'OBJ-2', number: '2026-02', tenant_party_id: 'PAR-2', annual_rent: 180000, valid_from: null, valid_to: null }];
 data.issues = [{ id: 'ARE-1', property_id: null, object_id: 'OBJ-1', title: 'Förbättra belysningen', description: 'Utred arbetsbelysningen vid läsplatserna.', status: 'ongoing', priority: 'high', estimated_cost: 45000, planned_from: '2026-11-02', planned_to: '2026-11-30', notes: 'Inventering bokas med verksamheten.' }];
 data.orders = [{ id: 'BES-1', issue_id: 'ARE-1', title: 'Inventering av armaturer', amount: 5000, status: 'draft' }];
 data.contacts = [{ id: 'KOP-1', person_id: 'PER-1', role: 'coordinator', property_id: 'FAS-1', agreement_id: null, issue_id: null, order_id: null, valid_from: null, valid_to: null }, { id: 'KOP-2', person_id: 'PER-2', role: 'owner', property_id: 'FAS-1', agreement_id: null, issue_id: null, order_id: null, valid_from: null, valid_to: null }, { id: 'KOP-3', person_id: 'PER-3', role: 'tenant', property_id: null, agreement_id: 'AVT-1', issue_id: null, order_id: null, valid_from: null, valid_to: null }];
 return data;
}
