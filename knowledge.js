(function(){
  'use strict';

  const lessons = [
    ['SAVING','Pay yourself first: move part of your income to savings before spending on wants.'],
    ['BUDGETING','A budget is not a restriction. It gives every rupee a job before the month begins.'],
    ['EMERGENCY','An emergency fund protects you from borrowing when an unexpected expense arrives.'],
    ['CREDIT','A credit card is borrowed money, not extra income. Spend only what you can repay.'],
    ['CREDIT','Paying the full credit-card bill on time can help you avoid interest on purchases.'],
    ['CREDIT','Credit utilization is the share of your available credit you are using at a given time.'],
    ['DEBT','High-interest debt can grow faster than your savings. Know the interest rate before borrowing.'],
    ['BANKING','Never share an OTP, PIN, CVV or password with someone claiming to be your bank.'],
    ['FRAUD','A real bank representative should not need your OTP to receive money into your account.'],
    ['INFLATION','Inflation means prices generally rise over time, reducing what the same amount of money can buy.'],
    ['INVESTING','Investing involves risk. A higher potential return usually comes with greater uncertainty.'],
    ['INVESTING','Diversification spreads money across different assets instead of relying on one investment.'],
    ['INVESTING','Past investment returns do not guarantee future returns. Always check the time period and risk.'],
    ['SIP','A SIP invests a fixed amount regularly. It does not guarantee a profit or remove market risk.'],
    ['SIP','Consistency can matter more than trying to perfectly predict when markets will rise or fall.'],
    ['COMPOUNDING','Compounding means returns can themselves earn returns when money stays invested over time.'],
    ['COMPOUNDING','Starting earlier gives compounding more time to work, even when the starting amount is small.'],
    ['GOALS','Give each major financial goal a target amount and deadline so progress can be measured.'],
    ['GOALS','Short-term goals generally need less exposure to volatile assets because there is less recovery time.'],
    ['GOALS','Separate emergency money from long-term investment money so one does not disrupt the other.'],
    ['TAX','Tax rules depend on the investment, income, holding period and current law. Check the applicable rules.'],
    ['FEES','Small recurring fees can reduce long-term returns. Always understand expense ratios and other charges.'],
    ['FEES','The cheapest financial product is not automatically suitable; compare cost with features and risk.'],
    ['INSURANCE','Insurance transfers certain financial risks to an insurer in exchange for a premium.'],
    ['INSURANCE','Insurance is mainly for protection against large losses, not a substitute for everyday savings.'],
    ['BANKING','A bank balance shows money available, not necessarily money you can safely spend.'],
    ['CASHFLOW','Cash flow is the money coming in and going out during a period. Track both sides.'],
    ['CASHFLOW','A monthly surplus gives you more room for saving, investing, goals and unexpected costs.'],
    ['SPENDING','Small frequent purchases can become a large monthly expense when repeated without noticing.'],
    ['SPENDING','Before a big purchase, compare its price with your goal and the number of working hours it represents.'],
    ['NEEDS','A need keeps your life functioning; a want improves convenience or enjoyment. Know which you are buying.'],
    ['SUBSCRIPTIONS','Unused subscriptions quietly drain money. Review recurring payments regularly and cancel what you no longer use.'],
    ['NEGOTIATION','Compare prices, fees and alternatives before accepting a financial product or service.'],
    ['LOANS','A loan with a lower monthly payment can still cost more overall if the repayment period is longer.'],
    ['LOANS','Compare the total repayment amount, interest rate and fees before choosing between loans.'],
    ['NET WORTH','Net worth is what you own minus what you owe. It can reveal progress better than income alone.'],
    ['RECORDS','Keeping transaction records makes it easier to spot mistakes, recurring costs and spending patterns.'],
    ['MARKETS','Market prices move because buyers and sellers disagree about value, expectations and future conditions.'],
    ['SCAMS','Urgency is a common scam tactic. Pause and independently verify unexpected payment requests.'],
    ['LEARNING','Financial literacy grows through small decisions: understand the product, its cost, its risk and its purpose.']
  ].map((x,i)=>({id:'lesson-'+(i+1),category:x[0],text:x[1]}));

  const seenKey='ledger.knowledgeSeen';
  const savedKey='ledger.knowledgeSaved';
  const $=id=>document.getElementById(id);

  function read(key){
    try{const v=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(v)?v:[];}catch(e){return[];}
  }
  function write(key,value){localStorage.setItem(key,JSON.stringify(value));}
  function savedSet(){return new Set(read(savedKey));}
  function seenSet(){return new Set(read(seenKey));}

  let seen=seenSet();
  let saved=savedSet();
  let current=null;
  let savedMode=false;
  let touchStartX=0;
  let touchStartY=0;
  let dragging=false;

  const card=$('knowledgeCard');

  function refreshHeader(){
    const learned=Math.min(seen.size,lessons.length);
    $('progressText').textContent=learned+' learned';
    $('remainingText').textContent=Math.max(lessons.length-learned,0)+' remaining';
    $('progressBar').style.width=(learned/lessons.length*100)+'%';
    $('savedCount').textContent=saved.size;
  }

  function markSeen(lesson){
    if(!seen.has(lesson.id)){
      seen.add(lesson.id);
      write(seenKey,[...seen]);
    }
  }

  function setSavedButton(lesson){
    const isSaved=saved.has(lesson.id);
    $('saveBtn').classList.toggle('saved',isSaved);
    $('saveBtn').setAttribute('aria-pressed',String(isSaved));
    $('saveIcon').textContent=isSaved?'♥':'♡';
    $('saveLabel').textContent=isSaved?'Saved':'Save knowledge';
  }

  function renderCard(lesson){
    current=lesson||null;
    if(!lesson){
      card.hidden=true;
      $('emptyState').hidden=false;
      refreshHeader();
      return;
    }
    card.hidden=false;
    $('emptyState').hidden=true;
    $('cardCategory').textContent=lesson.category;
    $('cardNumber').textContent=String(lesson.id.split('-')[1]).padStart(2,'0')+' / '+lessons.length;
    $('cardText').textContent=lesson.text;
    setSavedButton(lesson);
    card.classList.remove('card-enter');
    void card.offsetWidth;
    card.classList.add('card-enter');
  }

  function nextAvailableLesson(){
    return lessons.find(l=>!seen.has(l.id))||null;
  }

  function showNext(direction){
    if(!current)return;
    card.classList.remove('card-exit-left','card-exit-right');
    card.classList.add(direction==='left'?'card-exit-left':'card-exit-right');
    setTimeout(function(){
      card.classList.remove('card-exit-left','card-exit-right');
      if(savedMode){
        const list=lessons.filter(l=>saved.has(l.id));
        const position=list.findIndex(l=>l.id===current.id);
        renderCard(list[position+1]||null);
        renderSavedList();
        return;
      }
      const next=nextAvailableLesson();
      if(next){
        markSeen(next);
        refreshHeader();
        renderCard(next);
      }else renderCard(null);
    },210);
  }

  function startLessons(){
    savedMode=false;
    $('savedSection').hidden=true;
    const next=nextAvailableLesson();
    if(next){
      markSeen(next);
      refreshHeader();
      renderCard(next);
    }else renderCard(null);
  }

  function toggleSave(){
    if(!current)return;
    if(saved.has(current.id)) saved.delete(current.id);
    else saved.add(current.id);
    write(savedKey,[...saved]);
    setSavedButton(current);
    refreshHeader();
    renderSavedList();
  }

  function renderSavedList(){
    const list=lessons.filter(l=>saved.has(l.id));
    const box=$('savedList');
    box.innerHTML='';
    $('savedEmpty').hidden=list.length!==0;
    list.forEach((lesson)=>{
      const item=document.createElement('article');
      item.className='saved-item';
      const top=document.createElement('div');
      top.className='saved-item-top';
      const cat=document.createElement('span');
      cat.className='saved-item-category';
      cat.textContent=lesson.category;
      const remove=document.createElement('button');
      remove.className='text-btn';
      remove.type='button';
      remove.textContent='Remove';
      remove.addEventListener('click',()=>{
        saved.delete(lesson.id);
        write(savedKey,[...saved]);
        refreshHeader();
        renderSavedList();
        if(savedMode && current && current.id===lesson.id){
          renderCard(lessons.find(l=>saved.has(l.id))||null);
        }
      });
      top.append(cat,remove);
      const p=document.createElement('p');
      p.textContent=lesson.text;
      item.append(top,p);
      box.appendChild(item);
    });
  }

  function openSaved(){
    savedMode=true;
    $('savedSection').hidden=false;
    $('emptyState').hidden=true;
    $('savedToggle').setAttribute('aria-pressed','true');
    renderSavedList();
    renderCard(lessons.find(l=>saved.has(l.id))||null);
    window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'});
  }

  function closeSaved(){
    savedMode=false;
    $('savedSection').hidden=true;
    $('savedToggle').setAttribute('aria-pressed','false');
    startLessons();
  }

  $('saveBtn').addEventListener('click',toggleSave);
  $('savedToggle').addEventListener('click',openSaved);
  $('showSavedBtn').addEventListener('click',openSaved);
  $('closeSavedBtn').addEventListener('click',closeSaved);

  card.addEventListener('touchstart',e=>{
    const t=e.changedTouches[0];touchStartX=t.clientX;touchStartY=t.clientY;dragging=true;
  },{passive:true});
  card.addEventListener('touchend',e=>{
    if(!dragging)return;dragging=false;
    const t=e.changedTouches[0],dx=t.clientX-touchStartX,dy=t.clientY-touchStartY;
    if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)) showNext(dx<0?'left':'right');
  },{passive:true});

  card.addEventListener('click',e=>{
    if(e.target.closest('button'))return;
    if(!savedMode && e.clientX>card.getBoundingClientRect().left+card.offsetWidth/2) showNext('right');
  });

  document.addEventListener('keydown',e=>{
    if(e.key==='ArrowLeft')showNext('left');
    if(e.key==='ArrowRight')showNext('right');
    if(e.key.toLowerCase()==='s')toggleSave();
  });

  refreshHeader();
  startLessons();
})();