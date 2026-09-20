// ==========================================
// LEDGER AI — LOCAL FINANCIAL ASSISTANT
// ==========================================

const STORAGE_KEY = "ledger.expenses";

// ------------------------------
// Load Ledger expenses
// ------------------------------

function loadExpenses() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error("Could not load Ledger data:", error);
    return [];
  }
}


// ------------------------------
// DOM elements
// ------------------------------

const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatMessages = document.getElementById("chatMessages");
const quickButtons = document.querySelectorAll(".quick-btn");


// ------------------------------
// Currency formatter
// ------------------------------

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function formatCurrency(amount) {
  return currencyFormatter.format(amount || 0);
}


// ------------------------------
// Date helpers
// ------------------------------

function isThisMonth(expense) {
  if (!expense.date) return false;

  const date = new Date(expense.date);

  if (isNaN(date.getTime())) return false;

  const now = new Date();

  return (
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  );
}


// ------------------------------
// Get current month's expenses
// ------------------------------

function getMonthlyExpenses() {
  const expenses = loadExpenses();

  return expenses.filter(isThisMonth);
}


// ------------------------------
// Total spending
// ------------------------------

function getTotal(expenses) {
  return expenses.reduce(
    (total, expense) => total + Number(expense.amount || 0),
    0
  );
}


// ------------------------------
// Category totals
// ------------------------------

function getCategoryTotals(expenses) {

  const totals = {};

  expenses.forEach((expense) => {

    const category = expense.category || "Other";

    totals[category] =
      (totals[category] || 0) +
      Number(expense.amount || 0);

  });

  return totals;
}


// ------------------------------
// Biggest expenses
// ------------------------------

function getBiggestExpenses(expenses) {

  return [...expenses]
    .sort(
      (a, b) =>
        Number(b.amount || 0) -
        Number(a.amount || 0)
    )
    .slice(0, 5);
}


// ------------------------------
// Add message to chat
// ------------------------------

function addMessage(text, sender) {

  const message = document.createElement("div");

  message.className =
    sender === "user"
      ? "message user-message"
      : "message assistant-message";


  const label = document.createElement("div");

  label.className = "message-label";

  label.textContent =
    sender === "user"
      ? "You"
      : "Ledger AI";


  const bubble = document.createElement("div");

  bubble.className = "message-bubble";

  // textContent prevents user-entered HTML from being executed.
  bubble.textContent = text;


  message.appendChild(label);
  message.appendChild(bubble);

  chatMessages.appendChild(message);

  chatMessages.scrollTop =
    chatMessages.scrollHeight;
}


// ------------------------------
// Analyse user question
// ------------------------------

function generateResponse(question) {

  const q = question.toLowerCase().trim();

  const expenses = loadExpenses();

  const monthlyExpenses =
    expenses.filter(isThisMonth);

  const monthlyTotal =
    getTotal(monthlyExpenses);

  const categoryTotals =
    getCategoryTotals(monthlyExpenses);


  // --------------------------------
  // No data
  // --------------------------------

  if (expenses.length === 0) {

    return (
      "I don't have any expenses to analyse yet. " +
      "Add a few transactions in Ledger first, " +
      "then come back and ask me about your spending."
    );
  }


  // --------------------------------
  // Total spending
  // --------------------------------

  if (
    q.includes("how much") &&
    (
      q.includes("spent") ||
      q.includes("spend") ||
      q.includes("spending")
    )
  ) {

    if (monthlyExpenses.length === 0) {

      return (
        "You haven't recorded any expenses " +
        "for this month yet."
      );

    }

    return (
      "You have spent " +
      formatCurrency(monthlyTotal) +
      " this month across " +
      monthlyExpenses.length +
      " transaction" +
      (monthlyExpenses.length === 1 ? "." : "s.")
    );
  }


  // --------------------------------
  // Biggest category
  // --------------------------------

  if (
    q.includes("most") ||
    q.includes("highest") ||
    q.includes("biggest category") ||
    q.includes("where do i spend")
  ) {

    if (monthlyExpenses.length === 0) {

      return (
        "There isn't enough spending data " +
        "from this month yet."
      );

    }

    const sorted =
      Object.entries(categoryTotals)
        .sort((a, b) => b[1] - a[1]);

    const topCategory = sorted[0];

    const percentage =
      monthlyTotal > 0
        ? ((topCategory[1] / monthlyTotal) * 100).toFixed(1)
        : 0;

    return (
      "Your highest spending category this month " +
      "is " +
      topCategory[0] +
      " at " +
      formatCurrency(topCategory[1]) +
      ". That's approximately " +
      percentage +
      "% of your recorded spending."
    );
  }


  // --------------------------------
  // Category questions
  // --------------------------------

  const categories = [
    "food",
    "groceries",
    "fuel",
    "bills",
    "transport",
    "housing",
    "leisure",
    "other"
  ];

  const mentionedCategory =
    categories.find(category =>
      q.includes(category)
    );


  if (
    mentionedCategory &&
    (
      q.includes("how much") ||
      q.includes("spent") ||
      q.includes("spend")
    )
  ) {

    const categoryName =
      mentionedCategory.charAt(0).toUpperCase() +
      mentionedCategory.slice(1);

    const amount =
      categoryTotals[categoryName] || 0;

    return (
      "You have spent " +
      formatCurrency(amount) +
      " on " +
      categoryName +
      " this month."
    );
  }


  // --------------------------------
  // Biggest expenses
  // --------------------------------

  if (
    q.includes("biggest expense") ||
    q.includes("largest expense") ||
    q.includes("top expenses")
  ) {

    const biggest =
      getBiggestExpenses(monthlyExpenses);

    if (biggest.length === 0) {

      return (
        "You don't have any expenses " +
        "recorded this month."
      );

    }

    let response =
      "Your largest expenses this month are:\n\n";

    biggest.forEach((expense, index) => {

      response +=
        (index + 1) +
        ". " +
        expense.description +
        " — " +
        formatCurrency(expense.amount) +
        "\n";

    });

    return response;
  }


  // --------------------------------
  // Saving advice
  // --------------------------------

  if (
    q.includes("save") ||
    q.includes("saving") ||
    q.includes("reduce spending") ||
    q.includes("cut expenses")
  ) {

    if (monthlyExpenses.length === 0) {

      return (
        "Start by recording your expenses. " +
        "Once I have some spending data, " +
        "I can identify your biggest categories " +
        "and suggest areas to review."
      );
    }

    const sorted =
      Object.entries(categoryTotals)
        .sort((a, b) => b[1] - a[1]);

    const topCategory = sorted[0];

    const potentialSaving =
      topCategory[1] * 0.15;

    return (
      "Your largest spending category is " +
      topCategory[0] +
      " at " +
      formatCurrency(topCategory[1]) +
      ".\n\n" +
      "A practical starting point would be to " +
      "review that category and see whether you " +
      "can reduce it by around 15%.\n\n" +
      "That would represent approximately " +
      formatCurrency(potentialSaving) +
      " in potential monthly savings."
    );
  }


  // --------------------------------
  // Transaction count
  // --------------------------------

  if (
    q.includes("transaction") ||
    q.includes("transactions")
  ) {

    return (
      "You have recorded " +
      monthlyExpenses.length +
      " transaction" +
      (monthlyExpenses.length === 1 ? "" : "s") +
      " this month."
    );
  }


  // --------------------------------
  // Average transaction
  // --------------------------------

  if (
    q.includes("average") ||
    q.includes("avg")
  ) {

    if (monthlyExpenses.length === 0) {

      return (
        "There isn't enough data to calculate " +
        "your average transaction yet."
      );

    }

    const average =
      monthlyTotal / monthlyExpenses.length;

    return (
      "Your average transaction this month " +
      "is " +
      formatCurrency(average) +
      "."
    );
  }


  // --------------------------------
  // General spending summary
  // --------------------------------

  if (
    q.includes("summary") ||
    q.includes("overview") ||
    q.includes("financial")
  ) {

    if (monthlyExpenses.length === 0) {

      return (
        "You don't have any expenses recorded " +
        "for this month yet."
      );

    }

    const sorted =
      Object.entries(categoryTotals)
        .sort((a, b) => b[1] - a[1]);

    let response =
      "Here's your spending summary for this month:\n\n";

    response +=
      "Total: " +
      formatCurrency(monthlyTotal) +
      "\n";

    response +=
      "Transactions: " +
      monthlyExpenses.length +
      "\n";

    response +=
      "Top category: " +
      sorted[0][0] +
      " (" +
      formatCurrency(sorted[0][1]) +
      ")";

    return response;
  }


  // --------------------------------
  // Help
  // --------------------------------

  if (
    q.includes("help") ||
    q.includes("what can you do")
  ) {

    return (
      "I can analyse the expense data stored in " +
      "your Ledger.\n\n" +
      "Try asking:\n" +
      "• How much did I spend?\n" +
      "• Where do I spend the most?\n" +
      "• How much did I spend on food?\n" +
      "• What are my biggest expenses?\n" +
      "• How can I save?\n" +
      "• What's my average transaction?\n" +
      "• Give me a spending summary."
    );
  }


  // --------------------------------
  // Fallback
  // --------------------------------

  return (
    "I can currently answer questions about " +
    "your recorded expenses, categories, spending " +
    "and saving opportunities.\n\n" +
    "Try asking something like " +
    "\"Where do I spend the most?\""
  );
}


// ------------------------------
// Send message
// ------------------------------

function sendMessage(question) {

  const cleanQuestion =
    question.trim();

  if (!cleanQuestion) return;


  // User message
  addMessage(
    cleanQuestion,
    "user"
  );


  // Small delay for natural chat feel
  setTimeout(() => {

    const response =
      generateResponse(cleanQuestion);

    addMessage(
      response,
      "assistant"
    );

  }, 350);
}


// ------------------------------
// Form submission
// ------------------------------

chatForm.addEventListener("submit", (event) => {

  event.preventDefault();

  const question =
    chatInput.value.trim();

  if (!question) return;

  chatInput.value = "";

  sendMessage(question);

  chatInput.focus();

});


// ------------------------------
// Quick question buttons
// ------------------------------

quickButtons.forEach((button) => {

  button.addEventListener("click", () => {

    const question =
      button.dataset.question;

    if (!question) return;

    sendMessage(question);

  });

});


/* =========================================================
   LEDGER INTELLIGENCE UPGRADE
   Local-only: Money Coach + Fund Intelligence + Investment Lab
   ========================================================= */
(function(){
  const style=document.createElement("style");
  style.textContent=String.raw`
    .li-shell{margin:0 0 14px;display:grid;gap:12px}
    .li-hero{background:#0a0a0a;color:#fff;border-radius:16px;padding:20px;box-shadow:0 10px 28px rgba(0,0,0,.08)}
    .li-kicker{margin:0 0 6px;font-size:.62rem;letter-spacing:.14em;color:#aaa;font-weight:700}
    .li-hero h2{margin:0 0 7px;font-size:1.35rem;letter-spacing:-.035em}
    .li-hero p{margin:0;color:#bdbdbd;font-size:.78rem;line-height:1.5}
    .li-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
    .li-tab{border:1px solid #e2e2e2;background:#fff;border-radius:12px;padding:11px 8px;text-align:left;cursor:pointer}
    .li-tab b{display:block;font-size:.72rem}.li-tab small{display:block;color:#767676;font-size:.61rem;margin-top:4px;line-height:1.3}
    .li-tab.active{background:#0a0a0a;color:#fff;border-color:#0a0a0a}.li-tab.active small{color:#aaa}
    .li-panel{background:#fff;border:1px solid #e2e2e2;border-radius:15px;padding:16px;box-shadow:0 8px 25px rgba(0,0,0,.04)}
    .li-panel[hidden]{display:none}
    .li-snapshot{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:10px}
    .li-stat{padding:11px;background:#f6f6f6;border:1px solid #e2e2e2;border-radius:10px}.li-stat span{display:block;color:#767676;font-size:.6rem;text-transform:uppercase;letter-spacing:.06em}.li-stat strong{display:block;margin-top:4px;font:600 .9rem "SF Mono",monospace;overflow-wrap:anywhere}
    .li-title{margin:0 0 11px;font-size:.98rem}.li-note{padding:10px;background:#f6f6f6;border:1px dashed #ddd;border-radius:9px;font-size:.67rem;line-height:1.45;color:#555;margin-bottom:10px}
    .li-filter{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:10px}.li-filter label{font-size:.61rem;color:#767676;font-weight:600}.li-filter .wide{grid-column:1/-1}
    .li-filter input,.li-filter select,.li-lab input{width:100%;min-height:40px;margin-top:5px;border:1px solid #e2e2e2;border-radius:9px;padding:8px;background:#fafafa}
    .li-funds{display:grid;gap:8px}.li-fund{border:1px solid #e2e2e2;border-radius:11px;padding:12px}.li-fund h3{margin:0;font-size:.78rem}.li-tags{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}.li-tag{font-size:.57rem;border:1px solid #e2e2e2;border-radius:99px;padding:3px 6px;color:#555;background:#f6f6f6}.li-reason{margin-top:9px;padding:8px;background:#f6f6f6;border-radius:8px;font-size:.66rem;line-height:1.45;color:#555}
    .li-lab{display:grid;grid-template-columns:2fr 1fr;gap:7px}.li-rates{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:8px}.li-proj{display:grid;gap:7px;margin-top:11px}.li-scenario{padding:11px;border:1px solid #e2e2e2;border-radius:10px;background:#f6f6f6}.li-scenario.base{background:#0a0a0a;color:#fff;border-color:#0a0a0a}.li-scenario strong{display:block;margin-top:6px;font:600 1rem "SF Mono",monospace}.li-scenario small{display:block;margin-top:4px;color:#767676;font-size:.6rem}.li-scenario.base small{color:#aaa}
    .li-disclaimer{font-size:.62rem;line-height:1.5;color:#888;margin:10px 2px 0}
    @media(max-width:360px){.li-tabs,.li-snapshot{grid-template-columns:1fr}.li-lab,.li-rates,.li-filter{grid-template-columns:1fr}.li-filter .wide{grid-column:auto}}
  `;
  document.head.appendChild(style);

  const funds=[
    ["UTI Nifty 50 Index Fund","Index","Higher","5+ years","Broad index exposure","Compare tracking difference, costs and scheme documents."],
    ["HDFC Index Fund - NIFTY 50 Plan","Index","Higher","5+ years","Broad index exposure","Compare implementation, costs and tracking against the index."],
    ["Parag Parikh Flexi Cap Fund","Flexi Cap","Higher","5+ years","Flexible equity","Research how an active flexi-cap scheme approaches diversified equity exposure."],
    ["HDFC Flexi Cap Fund","Flexi Cap","Higher","5+ years","Flexible equity","Compare another flexi-cap approach, its costs and current disclosures."],
    ["HDFC Balanced Advantage Fund","Hybrid","Moderate","3+ years","Dynamic allocation","Study how a hybrid category can combine equity and debt exposure."],
    ["ICICI Prudential Balanced Advantage Fund","Hybrid","Moderate","3+ years","Dynamic allocation","Compare another dynamic hybrid framework and its current documents."],
    ["HDFC Short Term Debt Fund","Debt","Lower","1–3 years","Short-duration debt","Research shorter-duration fixed-income exposure, costs and credit risks."],
    ["Parag Parikh ELSS Tax Saver Fund","ELSS","Higher","3+ years","Tax-saving equity","Research the ELSS category and verify current lock-in/tax rules."]
  ];

  const fmt=new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0});
  const money=n=>fmt.format(Number(n)||0);
  const read=(k,d)=>{try{const x=localStorage.getItem(k);return x?JSON.parse(x):d}catch(e){return d}};
  const exps=()=>read("ledger.expenses",[]);
  const incs=()=>read("ledger.income",[]);
  const thisMonth=x=>{if(!x.date)return false;const d=new Date(x.date),n=new Date();return !isNaN(d)&&d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear()};
  const sum=a=>a.reduce((s,x)=>s+Number(x.amount||0),0);
  const monthly=()=>exps().filter(thisMonth);
  const income=()=>{const a=incs(),m=a.filter(thisMonth);return sum(m.length?m:a)};
  const top=()=>{const o={};monthly().forEach(x=>{const k=x.category||"Other";o[k]=(o[k]||0)+Number(x.amount||0)});return Object.entries(o).sort((a,b)=>b[1]-a[1])[0]||["Other",0]};

  const old=document.querySelector(".ai-intro");
  if(!old)return;
  const shell=document.createElement("section");
  shell.className="li-shell";
  shell.innerHTML=String.raw`
    <div class="li-hero"><p class="li-kicker">LEDGER INTELLIGENCE</p><h2>Your money. Understood.</h2><p>Three local tools for spending decisions, investment research and mathematical planning. No API key or backend required.</p></div>
    <div class="li-tabs">
      <button class="li-tab active" data-li="coach"><b>Money Coach</b><small>Save & understand cash flow.</small></button>
      <button class="li-tab" data-li="funds"><b>Fund Intelligence</b><small>Research candidates without rankings.</small></button>
      <button class="li-tab" data-li="lab"><b>Investment Lab</b><small>Model different assumptions.</small></button>
    </div>
    <section class="li-panel" data-lipanel="coach"><h3 class="li-title">Turn spending into decisions.</h3><div id="liSnapshot" class="li-snapshot"></div></section>
    <section class="li-panel" data-lipanel="funds" hidden><h3 class="li-title">Research, don't guess.</h3><div class="li-note"><b>Educational research mode.</b> The candidate list is static, not live market data, not a ranking and not a recommendation.</div><div class="li-filter"><label class="wide">Search<input id="liSearch" placeholder="Index, flexi cap, hybrid..."></label><label>Category<select id="liCat"><option>All</option><option>Index</option><option>Flexi Cap</option><option>Hybrid</option><option>Debt</option><option>ELSS</option></select></label><label>Risk lens<select id="liRisk"><option>All</option><option>Lower</option><option>Moderate</option><option>Higher</option></select></label></div><div id="liFunds" class="li-funds"></div></section>
    <section class="li-panel" data-lipanel="lab" hidden><h3 class="li-title">Investment Lab</h3><div class="li-lab"><label>Monthly contribution<input id="liAmt" type="number" min="0" value="5000"></label><label>Years<input id="liYears" type="number" min="1" max="50" value="10"></label></div><div class="li-rates"><label>Lower %<input id="liLow" type="number" min="0" max="50" step=".5" value="6"></label><label>Base %<input id="liBase" type="number" min="0" max="50" step=".5" value="10"></label><label>Higher %<input id="liHigh" type="number" min="0" max="50" step=".5" value="14"></label></div><div id="liProj" class="li-proj"></div><p class="li-disclaimer"><b>Illustrative only.</b> These are mathematical scenarios, not forecasts, expected returns, guarantees or investment advice.</p></section>
    <p class="li-disclaimer">For security-specific personalized advice, use an appropriately authorized service/professional. Verify current scheme documents, costs, tax rules and risk disclosures before acting.</p>
  `;
  old.insertAdjacentElement("afterend",shell);

  function snapshot(){
    const m=monthly(),sp=sum(m),ii=income(),sur=ii-sp,rate=ii?sur/ii*100:0,t=top();
    document.getElementById("liSnapshot").innerHTML='<div class="li-stat"><span>Income</span><strong>'+money(ii)+'</strong></div><div class="li-stat"><span>Spent</span><strong>'+money(sp)+'</strong></div><div class="li-stat"><span>Surplus</span><strong>'+money(sur)+'</strong></div>';
    return{m,sp,ii,sur,rate,t};
  }
  function renderFunds(){
    const q=document.getElementById("liSearch").value.toLowerCase(),cat=document.getElementById("liCat").value,risk=document.getElementById("liRisk").value;
    const list=funds.filter(f=>(cat==="All"||f[1]===cat)&&(risk==="All"||f[2]===risk)&&(!q||f.join(" ").toLowerCase().includes(q)));
    document.getElementById("liFunds").innerHTML=list.length?list.map(f=>'<article class="li-fund"><h3>'+f[0]+'</h3><div class="li-tags"><span class="li-tag">'+f[1]+'</span><span class="li-tag">'+f[2]+' risk lens</span><span class="li-tag">'+f[3]+'</span></div><div class="li-reason"><b>Why it appears:</b> '+f[5]+'<br><b>Focus:</b> '+f[4]+'</div></article>').join(""):'<div class="li-note">No candidates match those filters.</div>';
  }
  function fv(p,y,r){const rate=r/100/12,n=y*12;return rate===0?p*n:p*((Math.pow(1+rate,n)-1)/rate)*(1+rate)}
  function renderLab(){
    const p=Number(document.getElementById("liAmt").value)||0,y=Math.max(1,Number(document.getElementById("liYears").value)||1);
    const rs=[["Lower",Number(document.getElementById("liLow").value)||0],["Base",Number(document.getElementById("liBase").value)||0],["Higher",Number(document.getElementById("liHigh").value)||0]],invested=p*y*12;
    document.getElementById("liProj").innerHTML=rs.map((r,i)=>'<div class="li-scenario '+(i===1?"base":"")+'"><b>'+r[0]+' scenario</b><small>'+r[1].toFixed(1)+'% assumed</small><strong>'+money(fv(p,y,r[1]))+'</strong><small>Contributions: '+money(invested)+'</small></div>').join("");
  }
  document.querySelectorAll(".li-tab").forEach(b=>b.addEventListener("click",()=>{
    document.querySelectorAll(".li-tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");
    document.querySelectorAll("[data-lipanel]").forEach(p=>p.hidden=p.dataset.lipanel!==b.dataset.li);
    if(b.dataset.li==="funds")renderFunds();if(b.dataset.li==="lab")renderLab();
  }));
  ["liSearch","liCat","liRisk"].forEach(id=>document.getElementById(id).addEventListener(id==="liSearch"?"input":"change",renderFunds));
  ["liAmt","liYears","liLow","liBase","liHigh"].forEach(id=>document.getElementById(id).addEventListener("input",renderLab));
  snapshot();renderFunds();renderLab();
})();
/* =========================================================
   CHAT RENDER FIX
   ========================================================= */
(function(){
  function appendLedgerMessage(text, sender){
    const box=document.getElementById("chatMessages");
    if(!box) return;
    const wrap=document.createElement("div");
    wrap.className="message "+(sender==="user"?"user-message":"assistant-message");
    const label=document.createElement("div");
    label.className="message-label";
    label.textContent=sender==="user"?"You":"Ledger AI";
    const bubble=document.createElement("div");
    bubble.className="message-bubble";
    bubble.textContent=String(text);
    wrap.appendChild(label);
    wrap.appendChild(bubble);
    box.appendChild(wrap);
    box.scrollTop=box.scrollHeight;
  }

  function localAnswer(q){
    const s=q.toLowerCase();
    const data=(()=>{
      try{return JSON.parse(localStorage.getItem("ledger.expenses")||"[]")}catch(e){return[]}
    })();
    const income=(()=>{
      try{return JSON.parse(localStorage.getItem("ledger.income")||"[]")}catch(e){return[]}
    })();
    const now=new Date();
    const month=data.filter(x=>{const d=new Date(x.date);return !isNaN(d)&&d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()});
    const total=month.reduce((a,x)=>a+Number(x.amount||0),0);
    const inc=income.filter(x=>{const d=new Date(x.date);return !isNaN(d)&&d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()});
    const it=(inc.length?inc:income).reduce((a,x)=>a+Number(x.amount||0),0);
    const money=n=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(n||0);
    if(/how.*save|saving|save money|reduce|cut/.test(s)){
      const surplus=it-total;
      if(it<=0)return"Add your income in Ledger first. Then I can calculate a realistic saving target from your actual cash flow.";
      if(surplus<=0)return"Your recorded spending is "+money(Math.abs(surplus))+" above income. Start by reviewing your largest category and reducing flexible spending before increasing investments.";
      return"Your recorded surplus is "+money(surplus)+". A practical first target could be to protect part of that surplus each month, then review your largest spending category for reductions.";
    }
    if(/where|most|biggest|highest/.test(s)){
      const cats={};month.forEach(x=>cats[x.category||"Other"]=(cats[x.category||"Other"]||0)+Number(x.amount||0));
      const top=Object.entries(cats).sort((a,b)=>b[1]-a[1])[0];
      return top?"Your largest current-month category is "+top[0]+" at "+money(top[1])+".":"There are no current-month expenses to analyse yet.";
    }
    if(/how much.*spend|spent/.test(s))return"You recorded "+money(total)+" of spending this month across "+month.length+" transactions.";
    if(/invest|sip/.test(s)){
      const surplus=it-total;
      return surplus>0?"Your recorded monthly surplus is "+money(surplus)+". You can use part of this for goal-based investing after considering your emergency reserve, time horizon and risk tolerance.":"Your recorded cash flow does not currently show a positive surplus, so review spending/income before increasing investments.";
    }
    if(/summary|overview|financial/.test(s))return"Current month: income "+money(it)+", spending "+money(total)+", surplus "+money(it-total)+", transactions "+month.length+".";
    return"Try asking: “How can I save money?”, “Where do I spend the most?”, “How much can I invest?”, or “Give me a financial summary.”";
  }

  function sendLedgerQuestion(q){
    q=String(q||"").trim();
    if(!q)return;
    appendLedgerMessage(q,"user");
    setTimeout(()=>appendLedgerMessage(localAnswer(q),"assistant"),120);
  }

  const form=document.getElementById("chatForm");
  const input=document.getElementById("chatInput");
  if(form && input){
    form.addEventListener("submit",function(e){
      e.preventDefault();
      const q=input.value.trim();
      input.value="";
      sendLedgerQuestion(q);
    });
  }

  document.querySelectorAll(".quick-btn").forEach(btn=>{
    btn.addEventListener("click",()=>sendLedgerQuestion(btn.dataset.question||btn.textContent));
  });
})();
