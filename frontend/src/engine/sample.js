// Moved from frontend_src/letter-tagger.html — see tests_ui/legacy for the reference page. No DOM rendering in this module.
import JSZip from 'jszip'
import { W, esc } from './helpers.js'

/* ======================= sample letter ======================= */
export function sampleDocx(){
  const x=s=>esc(s);
  const run=o=>{ const pr=(o.b?'<w:b/>':'')+(o.i?'<w:i/>':'')+(o.hl?'<w:highlight w:val="yellow"/>':''); return `<w:r>${pr?`<w:rPr>${pr}</w:rPr>`:''}<w:t xml:space="preserve">${x(o.t)}</w:t></w:r>`; };
  const P=(parts,o={})=>`<w:p>${o.jc?`<w:pPr><w:jc w:val="${o.jc}"/></w:pPr>`:''}${parts.map(q=>typeof q==='string'?run({t:q}):q.raw?q.raw:run(q)).join('')}</w:p>`;
  const merge=n=>({raw:`<w:fldSimple w:instr=" MERGEFIELD ${n} "><w:r><w:t>«${n}»</w:t></w:r></w:fldSimple>`});
  const cell=(t,b)=>`<w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr>${t?P([{t,b}]):(b?'<w:p><w:pPr><w:rPr><w:b/></w:rPr></w:pPr></w:p>':'<w:p/>')}</w:tc>`;
  const tr=(a,b,c,bold)=>`<w:tr>${cell(a,bold)}${cell(b,bold)}${cell(c,bold)}</w:tr>`;
  const border='<w:tblBorders><w:top w:val="single" w:sz="4" w:color="999999"/><w:left w:val="single" w:sz="4" w:color="999999"/><w:bottom w:val="single" w:sz="4" w:color="999999"/><w:right w:val="single" w:sz="4" w:color="999999"/><w:insideH w:val="single" w:sz="4" w:color="999999"/><w:insideV w:val="single" w:sz="4" w:color="999999"/></w:tblBorders>';
  const body=[
    P([{t:'NORTHWIND APPLIANCES PVT. LTD.', b:true}],{jc:'center'}),
    P(['Plot 14, MIDC Industrial Area, Pune 411019'],{jc:'center'}),
    P([]),
    P(['Date: <<Letter Date>>']),
    P(['Employee Code: [Employee Code]']),
    P([]),
    P(['To,']),
    P(['[Employee ', 'Name]']),
    P(['<<Designation>>, [Department]']),
    P([]),
    P([{t:'Subject: Annual Compensation Review FY 2026-27', b:true}]),
    P(['Dear ', merge('First_Name'), ',']),
    P(['Based on your performance rating of [Rating] for FY 2025-26, we are pleased to inform you that your existing annual CTC of Rs. XXXX has been revised to Rs. XXXX with effect from ', {t:'1st April 2026', hl:true}, '.']),
    P(['We are also pleased to promote you to the role of [New Designation] at level [New Level]. Your reporting manager will walk you through your new responsibilities.']),
    P(['Your variable pay target for the year is Rs. XXXX, paid on the basis of individual and company performance.']),
    P(['Please find the revised break-up of your compensation in Annexure 1.']),
    '<w:p><w:r><w:br w:type="page"/></w:r></w:p>',
    P([{t:'Annexure 1', b:true}]),
    P(['Revised salary for [Employee Name] w.e.f. ', {t:'1st April 2026', hl:true}, ':']),
    `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/>${border}</w:tblPr><w:tblGrid><w:gridCol w:w="4400"/><w:gridCol w:w="2300"/><w:gridCol w:w="2300"/></w:tblGrid>${tr('Components','Monthly','Annual',true)}${['Basic','HRA','Special Allowance*','Conveyance Allowance **'].map(x=>tr(x,'','')).join('')}${tr('Total Gross','','',true)}${['PF','Gratuity***'].map(x=>tr(x,'','')).join('')}${tr('Total Contributions','','',true)}${tr('Annual Variable Pay','','')}${tr('Total CTC','','',true)}</w:tbl>`,
    P([]),
    P(['Contact number on record: ', '{{ mobile | default(‘Not ', 'provided’, true) }}']),
    P(['All other terms and conditions of your employment remain unchanged. We thank you for your contribution and look forward to your continued association with Northwind.']),
    P([]),
    P(['For Northwind Appliances Pvt. Ltd.']),
    P([]),
    P([{t:'Authorised Signatory', b:true}]),
    P(['Human Resources']),
  ].join('');
  const doc=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<w:document xmlns:w="${W}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const z=new JSZip();
  z.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  z.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  z.file('word/document.xml', doc);
  return z.generateAsync({type:'arraybuffer'});
}
