// Fields needed by the existing views. Every fact has one storage owner.
export const viewCollections = { parties: 'organizations', people: 'people', properties: 'properties', objects: 'objects', agreements: 'contracts', issues: 'activities', orders: 'orders', agreement_items:'agreementItems', recurring_costs:'recurringCosts', cost_evidence:'costEvidence' };
export const viewFields = {
 parties: { name:'name', organization_number:'organizationNumber', kind:'type', owner_class:'ownerClass', investment_rule:'investmentRule', investment_threshold:'investmentThreshold', rent_surcharge_rate:'rentSurchargeRate' },
 people: { name:'name', email:'email', phone:'phone', party_id:'organizationId', job_title:'role' },
 properties: { name:'designation', popular_name:'popularName', address:'address', city:'city', owner_party_id:'ownerPartyId', latitude:'latitude', longitude:'longitude' },
 objects: { property_id:'propertyId', area:'area', apartment_count:'apartmentCount', apartment_area:'apartmentArea', common_area:'commonArea', category:'category', valid_from:'start', valid_to:'end' },
 agreements: { object_id:'objectId', tenant_party_id:'tenantPartyId', valid_from:'start', valid_to:'end', terminated_on:'terminatedOn', termination_reason:'terminationReason', usage:'use', business:'business', workplace_count:'workplaceCount', hub_count:'hubCount', eb_category:'category', main_contract_url:'contractDocumentUrl', notice_months:'noticePeriodMonths', renewal_months:'renewalPeriodMonths', notice_by:'notice', move_in:'moveInDate', move_out:'moveOutDate', comment:'comment' },
 issues: { sources:'sources',maintenance_completed_on:'maintenanceCompletedOn',maintenance_result:'maintenanceResult',property_id:'propertyId', object_id:'objectId', title:'title', description:'description', status:'status', priority:'priority', estimated_cost:'estimatedCost', planned_from:'startDate', planned_to:'endDate', notes:'notes', kind:'type', category:'category', final_cost:'finalCost', ordered_cost:'orderedCost', planning_year:'planningYear', planning_quarter:'planningQuarter', planning_month:'planningMonth', include_in_budget:'includeInBudget', budget_category:'budgetCategory', value_increasing:'valueIncreasing', journal:'journal', action_kind:'actionKind', standard_enhancing:'standardEnhancing', rent_surcharge_start:'rentSurchargeStartDate', unit_id:'unitId' },
 orders: { issue_id:'activityId', title:'title', amount:'orderedCost', status:'status', ordered_by:'orderedByPersonId', ordered_at:'orderedAt', final_cost:'finalCost', supplier:'supplier', reference:'orderReference', delivery:'deliveryText', completed_at:'completedAt', payment_status:'paymentStatus', paid_at:'paidAt', invoice_comment:'invoiceComment', owner_pays:'ownerPays' }
};
Object.assign(viewFields, {
 agreement_items:{agreement_id:'contractId',type:'type',name:'name',base_amount:'baseAmount',valid_from:'start',valid_to:'end',adjustment_method:'adjustmentMethod',base_year:'baseYear',base_index:'baseIndex',index_share:'indexPercent',annual_percent:'annualPercent',min_percent:'minPercent',max_percent:'maxPercent',limit_basis:'limitBasis',series_base:'seriesBase',floor:'floor',reconcilable:'reconcilable',reported_amount:'reportedAmount',sources:'sources'},
 recurring_costs:{property_id:'propertyId',category:'category',name:'name',annual_amount:'annualAmount',valid_from:'start',valid_to:'end',invoice_complete_years:'invoiceCompleteYears',sources:'sources'},
 cost_evidence:{cost_id:'costId',type:'type',year:'year',amount:'amount',selected:'selected',invoice_reference:'invoiceReference',invoice_date:'invoiceDate',valid_from:'start',valid_to:'end',document_url:'documentUrl',sources:'sources'}
});
Object.assign(viewCollections,{
 businesses:'businesses',contract_businesses:'contractBusinesses'
});
Object.assign(viewFields,{
 businesses:{name:'name',type:'type',description:'description',organization_id:'organizationId',unit_id:'unitId',status:'status'},
 contract_businesses:{agreement_id:'contractId',business_id:'businessId',valid_from:'fromDate',valid_to:'toDate',cost_share_percent:'costSharePercent',cancelled:'cancelled'}
});
export const workspaceKeys = ['budgetPlans','indexSeries','priceBaseAmounts','auditLog','sourceRegistry','importReview','documents','importMappings','importFieldPreferences','activityOptions','currentUser','investmentThreshold','rentSurchargeRate','settings'];
Object.assign(viewCollections,{spaces:'spaces',building_parts:'buildingParts',inspections:'inspections',inspection_points:'inspectionPoints'});
viewFields.objects.maintenance_responsibility='maintenanceResponsibility';
viewFields.properties.maintenance_responsibility='maintenanceResponsibility';
Object.assign(viewFields,{
 spaces:{object_id:'objectId',property_id:'propertyId',name:'name',floor:'floor'},
 building_parts:{space_id:'spaceId',name:'name',responsibility:'responsibility'},
 inspections:{object_id:'objectId',property_id:'propertyId',inspected_on:'inspectedOn',inspector_id:'inspectorId',status:'status',notes:'notes',sources:'sources'},
 inspection_points:{inspection_id:'inspectionId',part_id:'partId',space_id:'spaceId',assessment:'assessment',comment:'comment',last_action:'lastAction',photo_reference:'photoReference',issue_id:'issueId',source_plans:'sourcePlans',sources:'sources'}
});
