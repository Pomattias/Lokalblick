// Synthetic source data. Mirrors the source layout without company records.
export const localDataHeaders=['Förvaltningsobjekt','Avtalsnummer','Kostnadsställe','Gatuadress','Kundtyp avtal','Area','Avtalstyp','Ursprungligt giltigt fr.o.m.','Aktuellt giltigt t.o.m.','Förlängningstid','Uppsägningstid','Uppsagd den','Uppsägningsorsak','Säg upp senast','Lokalkategori','Användning','Fastighetsförvaltare'];
export const localAgreementId=i=>'SF4100-'+String(i+1).padStart(3,'0')+'-4';
export const localDataRow=(i,center='003418')=>['4100',localAgreementId(i),center,'Testgatan 1','Intern',100+i,'Överenskommelse','2019-10-01','2027-12-31','12 mån','12 mån','','','2026-12-31','Kontor','Träffpunkt','TEST01 Test Förvaltare'];
