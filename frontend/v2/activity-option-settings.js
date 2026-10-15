import {normalizeActivityOptions,optionUsage} from "./activity-options.js";
const esc=x=>String(x??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
export function activityOptionSettings(data){
  const registry=normalizeActivityOptions(data.activityOptions,data.activities);
  const titles={type:"Typer",category:"Kategorier",status:"Statusar"};
  const descriptions={
    type:"Ärendetyper. Grundtyperna behåller befintlig budgetlogik.",
    category:"Kategorier kan gälla alla ärendetyper eller en vald typ.",
    status:"Ordningen här blir ordningen i ärendeformuläret. Befintliga statusvärden behålls."
  };
  const types=registry.type.map(row=>'<option value="'+esc(row.name)+'">'+esc(row.name)+'</option>').join("");
  const block=kind=>{
    const rows=registry[kind];
    return '<section class="activity-option-block" data-activity-option-kind="'+kind+'"><h3>'+titles[kind]+'</h3>'+
      '<p>'+descriptions[kind]+'</p><div class="activity-option-list">'+
      rows.map((row,index)=>{
        const usage=optionUsage(data,kind,row.name);
        const attrs='data-option-kind="'+kind+'" data-option-name="'+esc(row.name)+'"';
        const scope=kind==="category"?'<label class="activity-option-scope">Gäller <select data-option-scope '+attrs+'>'+
          '<option value="">Alla typer</option>'+registry.type.map(t=>'<option value="'+esc(t.name)+'"'+(row.types.includes(t.name)?' selected':'')+'>'+esc(t.name)+'</option>').join("")+
          '</select></label>':"";
        return '<div class="activity-option-row'+(row.active?'':' is-inactive')+'"><div class="activity-option-name"><strong>'+esc(row.name)+'</strong>'+
          '<small>'+ (usage?usage+' ärenden':'Ej använd')+(row.active?'':' · inaktiv')+'</small></div>'+scope+
          '<div class="activity-option-actions">'+
          '<button type="button" data-option-action="move" data-option-direction="-1" '+attrs+(index===0?' disabled':'')+' aria-label="Flytta '+esc(row.name)+' uppåt">↑</button>'+
          '<button type="button" data-option-action="move" data-option-direction="1" '+attrs+(index===rows.length-1?' disabled':'')+' aria-label="Flytta '+esc(row.name)+' nedåt">↓</button>'+
          '<button type="button" data-option-action="toggle" '+attrs+'>'+ (row.active?'Inaktivera':'Aktivera')+'</button>'+
          '<button type="button" data-option-action="delete" '+attrs+(usage?' disabled title="Används i befintliga ärenden"':'')+' aria-label="Ta bort '+esc(row.name)+'">Ta bort</button>'+
          '</div></div>';
      }).join("")+'</div><div class="activity-option-add">'+
      '<input type="text" maxlength="90" data-option-new="'+kind+'" placeholder="Nytt alternativ" aria-label="Nytt alternativ i '+titles[kind].toLowerCase()+'">'+
      (kind==="category"?'<select data-option-new-scope="'+kind+'" aria-label="Gäller ärendetyp"><option value="">Alla typer</option>'+types+'</select>':'')+
      '<button type="button" data-option-action="add" data-option-kind="'+kind+'">Lägg till</button></div></section>';
  };
  return '<section class="activity-option-settings" data-activity-option-settings>'+
    '<h2>Ärenden – valbara alternativ</h2>'+
    '<p>Gemensamma register för Typ, Kategori och Status. Ändringar används i ärendeformulär och filter. Äldre värden behålls på sina ärenden. Alternativ som används kan inaktiveras, men inte raderas.</p>'+
    '<div class="activity-option-grid">'+["type","category","status"].map(block).join("")+'</div>'+
    '<small>Ändringar får datum och ansvarig i ändringshistoriken. Spara till Excel om arbetsboken är ansluten.</small></section>';
}
