// Moved from frontend_src/letter-tagger.html — see tests_ui/legacy for the reference page. No DOM rendering in this module.
import { lsGet } from './helpers.js'

/* ======================= state ======================= */
export const state = {
  fileName:'', srcBuf:null, xml:{}, parts:[], isSample:false, comments:false, mainPath:'word/document.xml',
  an:null, rows:[], removedRows:[], edits:{}, csv:null, csvAlias:new Map(), extraKeys:new Set(),
  settings:{ money:'indian', spaced:true, guard:false, removeHl:true },
  logic:[], lg:[], lgRails:new Map(), closing:null, sel:{pids:[], anchor:null, text:''}, view:'source', filter:'all', built:null, learned: lsGet('lt.learned', {}),
  tables:[], tableEdits:{}, ghostMap:new Map(), learnedCells: lsGet('lt.cells', {}), csvHeaders:[],
  tagOps:[], origXml:{}, origHash:'', previewOverrides:{}, unplaced:[], tab:'doc', pv:{}, pvIdx:0, batch:null, compiled:null, fixes:[],
  team:null, teamClients:[], teamSetups:[], teamStatus:'', teamReadOnly:false, mergeB:null, switchUi:null, inlineUi:null, placing:null, typed:new Set(), switchOps:[], tColl:new Set(), tOpts:new Set(), csvExtra:[],
};
export const savedSettings = lsGet('lt.settings', null);
if (savedSettings) Object.assign(state.settings, savedSettings);
