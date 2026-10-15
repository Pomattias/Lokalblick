# Styrbara ärendealternativ

I **Mer → Inställningar → Ärenden** administreras Typ, Kategori och Status. Alternativen sparas som `activityOptions` i Lokalblick-data, som `workspace.activityOptions` för företags-API eller i den befintliga dolda Excel-fliken **Tilläggsdata** för egen fil.

- Val läses från samma register i ärendeformulär och typfilter, utan dubbla kodlistor.
- Ett aktivt alternativ kan inaktiveras eller flyttas; existerande ärenden behåller sitt lagrade textvärde och kan fortfarande visa det.
- Kategorier kan begränsas till en ärendetyp. Om ett tidigare ärende har ett värde utanför den aktuella listan visas det som ett gammalt värde och skrivs inte över.
- Borttagning kräver att ingen aktivitet använder värdet. Typer med kategorikoppling får inte tas bort innan kopplingen hanterats. Raderade alternativ tas bort på riktigt ur inställningsdata.
- Importerade värden som inte finns i registret visas under Inställningar **inaktiva** tills någon aktivt godkänner dem. De bevaras på befintliga ärenden.
- Ändringar loggas med tid och angiven användare i `auditLog`. Inga ärendens historik eller tidigare budgetversioner skrivs om.
- **Typ och Status är fortfarande affärsbegrepp**. Till exempel används `Avslaget` och `Klar` vid budgeturval och befintliga grundtyper vid budgetklassificering. Inaktivera dem gärna i formulärlistan om de inte längre ska kunna väljas, men döp inte om lagrade värden som om de vore enbart etiketter. Nya, egna ärendetyper saknar automatisk budgetklassificering tills en uttrycklig regel lagts till.

Fortsatt utveckling sker på `utveckling`. `main` ändras endast efter särskilt beslut.
