// Moved from frontend_src/letter-tagger.html — see tests_ui/legacy for the reference page. No DOM rendering in this module.

/* ======================= CompUp tag catalogue (from "CompUp – Letter Tags" guide) ======================= */
export const CATALOG = [
  // Personal
  {g:'Personal', key:'first_name', label:'First name', al:['first name','given name','fname','dear','hi','hello']},
  {g:'Personal', key:'last_name', label:'Last name', al:['last name','surname','family name','lname']},
  {g:'Personal', key:'email', label:'Email ID', al:['email','email id','email address','e mail','mail id','e mail id']},
  {g:'Personal', key:'mobile', label:'Mobile', al:['mobile','mobile number','mobile no','phone','phone number','contact number','contact no']},
  {g:'Personal', key:'joined_on', label:'Joining date', al:['joining date','date of joining','doj','joined on','join date','joined us on']},
  {g:'Personal', key:'current_date', label:'Current date', al:['current date','date','letter date','today','todays date','issue date','dated','date of issue']},
  {g:'Personal', key:'emp_code', label:'Employee ID', al:['employee id','emp id','employee code','emp code','emp no','employee no','employee number','staff id','associate id','ecode','e code','id','code']},
  {g:'Personal', key:'gender', label:'Gender', al:['gender','sex']},
  // Organisation
  {g:'Organisation', key:'organization', label:'Organisation name', al:['organization','organisation','company','company name','organization name','organisation name','employer','entity']},
  {g:'Organisation', key:'organization_address', label:'Organisation address', al:['organization address','organisation address','company address','office address','registered office','address']},
  // Band, level, promotion
  {g:'Band & level', key:'employee_schema.function', label:'Function', al:['function','current function']},
  {g:'Band & level', key:'employee_schema.family', label:'Family', al:['family','job family']},
  {g:'Band & level', key:'employee_schema.subfamily', label:'Subfamily', al:['subfamily','sub family','job subfamily','sub function']},
  {g:'Band & level', key:'employee_schema.level', label:'Level', al:['level','grade','job level','job grade','current level','current grade']},
  {g:'Band & level', key:'employee_schema.designation', label:'Designation', al:['designation','title','job title','role','position','current designation','current role']},
  {g:'Band & level', key:'employee_schema.promotion_needed', label:'Promotion needed', al:['promotion','promotion needed','promotion status']},
  {g:'Band & level', key:'employee_schema.updated_level', label:'Promoted level', al:['new level','revised level','promoted level','new grade','revised grade','promoted grade','updated level']},
  {g:'Band & level', key:'employee_schema.updated_designation', label:'Promoted designation', al:['new designation','revised designation','promoted designation','new title','new role','updated designation','promoted to','role of']},
  {g:'Band & level', key:'employee_schema.promoted_function', label:'Promoted function', al:['new function','promoted function','revised function']},
  {g:'Band & level', key:'employee_schema.promoted_family', label:'Promoted family', al:['new family','promoted family']},
  {g:'Band & level', key:'employee_schema.promoted_subfamily', label:'Promoted subfamily', al:['new subfamily','promoted subfamily']},
  {g:'Performance sheet column', key:'employee_schema.rating', label:'Rating (sheet column)', al:['rating','performance rating','appraisal rating','pms rating','rating of','final rating'], note:'Performance-sheet column. Confirm the column heading.'},
  {g:'Performance sheet column', key:'employee_schema.band', label:'Band (sheet column)', al:['band','current band'], note:'Performance-sheet column. Confirm the column heading.'},
  {g:'Performance sheet column', key:'employee_schema.location', label:'Location (sheet column)', al:['location','work location','base location','city'], note:'Performance-sheet column. Confirm the column heading.'},
  {g:'Performance sheet column', key:'employee_schema.department', label:'Department (sheet column)', al:['department','dept','business unit','bu','division'], note:'Performance-sheet column. Confirm the column heading.'},
  // Salary
  {g:'Salary', key:'currency_code', label:'Currency code', al:['currency','currency code']},
  {g:'Salary', key:'effective_date', label:'Effective date', al:['effective date','with effect from','effective from','w e f','wef','effective','effective on','applicable from','effective w e f']},
  {g:'Salary', key:'ctc', label:'Current CTC (revised)', money:true, al:['ctc','revised ctc','new ctc','annual ctc','total ctc','revised annual ctc','new annual ctc','revised salary','new salary','revised package','new package','revised compensation','cost to company','revised','revised to','increased to','total compensation','ctc pa','fixed ctc']},
  {g:'Salary', key:'old_ctc', label:'Old CTC', money:true, al:['old ctc','previous ctc','existing ctc','present ctc','existing salary','previous salary','existing package','old salary','existing compensation','prior ctc']},
  {g:'Salary', key:'increment_amount', label:'Increment amount', money:true, al:['increment','increment amount','hike amount','raise','increase','increase amount','salary increase','increment value','hike']},
  {g:'Salary', key:'new_base', label:'Current base salary', money:true, al:['base','base salary','base pay','new base','revised base','revised base salary','new base salary']},
  {g:'Salary', key:'eligible_pay', label:'Eligible variable pay', money:true, al:['eligible pay','eligible variable pay','eligible amount','eligible bonus']},
  {g:'Salary', key:'variable_payout', label:'Variable payout amount', money:true, al:['variable payout','payout','payout amount','bonus','bonus amount','incentive','incentive amount','performance bonus','bonus payout']},
  // Variable
  {g:'Variable pay', key:'variable_pay', label:'Variable pay', money:true, al:['variable pay','variable','variable component','target variable pay','variable pay target','target bonus','variable target','target incentive']},
  {g:'Variable pay', key:'variable_payout_percentage', label:'Variable payout %', al:['variable payout %','payout %','payout percentage','bonus %','variable payout percentage','bonus percentage']},
  {g:'Variable pay', key:'variable_schema', label:'Variable schema', al:['variable schema']},
  {g:'Variable pay', key:'emp_variable_plan_name', label:'Plan name', al:['plan name','variable plan','incentive plan','bonus plan','variable plan name']},
];
export const FORMULAS = [
  {g:'Formula', key:'fx:full_name', label:'Full name (first + last)', al:['employee name','name','full name','associate name','emp name','employee full name','name of employee','name of the employee','mr','ms','mrs','dear mr','dear ms'],
    build:w=>`${w('first_name')} ${w('last_name')}`},
  {g:'Formula', key:'fx:hike_pct', label:'Hike % (from ctc and old_ctc)', al:['hike %','increment %','hike percentage','increment percentage','percentage increase','hike percent','increment percent','increase %','raise %'],
    build:w=>w('(((ctc | float) - (old_ctc | float)) / (old_ctc | float) * 100) | round(1)')},
  {g:'Formula', key:'fx:monthly_ctc', label:'Monthly CTC (ctc ÷ 12)', al:['monthly ctc','monthly salary','monthly gross','per month','monthly compensation','revised monthly ctc','new monthly ctc','monthly'],
    build:w=>w('((ctc | float) / 12) | round(0) | int | indian_comma')},
  {g:'Formula', key:'fx:old_monthly_ctc', label:'Old monthly CTC', al:['old monthly ctc','existing monthly ctc','previous monthly ctc'],
    build:w=>w('((old_ctc | float) / 12) | round(0) | int | indian_comma')},
  {g:'Formula', key:'fx:today_long', label:"Today's date, e.g. May 19, 2026", al:[],
    build:w=>w("currentDatetime('%B %d, %Y')")},
  {g:'Formula', key:'fx:his_her', label:'his / her (from gender)', al:['his her','his or her'],
    build:w=>w('"his" if gender | lower == "male" else "her"')},
  {g:'Formula', key:'fx:he_she', label:'he / she (from gender)', al:['he she','he or she'],
    build:w=>w('"he" if gender | lower == "male" else "she"')},
];
export const FX = Object.fromEntries(FORMULAS.map(f=>[f.key,f]));
export const CAT = Object.fromEntries(CATALOG.map(c=>[c.key,c]));
export const KNOWN = new Set([...CATALOG.map(c=>c.key),'currentDatetime','format_date']);
export const MONEY_RX = /^(ctc|old_ctc|increment_amount|new_base|eligible_pay|variable_payout|variable_pay)$|_(current|old|new)_amount$|^factor_/;
export const isMoney = k => MONEY_RX.test(k||'');
export const FORMATS = [
  ['auto','Auto'],['none','As is'],['indian','Indian commas'],['indian_round','Indian, whole no.'],['dec0','No decimals (.0f)'],['house','Blank when 0 (house)'],['dash','“-” when 0 (house)'],['intl','Intl commas'],['dec2','2 decimals'],
  ['upper','UPPER CASE'],['title','Title Case'],['date','Reformat date'],
];
export const COND_PRESETS = [
  {id:'promo', label:'Employee is promoted', expr:'employee_schema.promotion_needed | lower | trim == "yes"'},
  {id:'var', label:'Has a variable payout', expr:'variable_payout is defined and (variable_payout | float) > 0'},
  {id:'varpay', label:'Has variable pay', expr:'variable_pay is defined and (variable_pay | float) > 0'},
  {id:'inc', label:'Has an increment', expr:'(increment_amount | float) > 0'},
  {id:'noinc', label:'Has no increment', expr:'(increment_amount | float) <= 0'},
  {id:'custom', label:'Custom condition…', expr:''},
];
