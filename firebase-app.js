import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getFirestore, collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCAIiKncK4Q15quFOwgrTeTAwPYfq9vtGM",
  authDomain: "dolgvani-17e11.firebaseapp.com",
  projectId: "dolgvani-17e11",
  storageBucket: "dolgvani-17e11.firebasestorage.app",
  messagingSenderId: "864709276642",
  appId: "1:864709276642:web:88929f36e355d1698fffbb",
  measurementId: "G-FT7L81KNEV"
};

const OWNER = "glebopyx@gmail.com";
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
const $ = id => document.getElementById(id);
const fmt = n => n.toLocaleString("ru-RU");
const dateFmt = new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"long",year:"numeric"});
const shortFmt = new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",year:"numeric"});
let currentUser = null;
let returns = [];
let comments = [];
let latestBalance = 15n;

function isOwner(user=currentUser) {
  return !!user && user.email?.toLowerCase() === OWNER && user.emailVerified;
}
function setMessage(id, message, error=false) {
  const el=$(id); if (!el) return;
  el.textContent=message; el.style.color=error?"#e18a83":"#9a9eaa";
}
function balanceAt(now=new Date()) {
  const events=[];
  const due=new Date(2026,10,30,23,59,59,999);
  let month=new Date(2026,11,1);
  while(month<=now) {
    events.push({time:month.getTime(),type:"double"});
    month=new Date(month.getFullYear(),month.getMonth()+1,1);
  }
  for(const item of returns) {
    const time=item.createdAt?.toDate ? item.createdAt.toDate().getTime() : null;
    if(time!==null && time<=now.getTime() && time>due.getTime())
      events.push({time,type:"return",amount:BigInt(item.amount)});
  }
  events.sort((a,b)=>a.time-b.time || (a.type==="double"?-1:1));
  let balance=15n;
  for(const event of events) {
    if(event.type==="double") balance*=2n;
    else balance=balance>event.amount?balance-event.amount:0n;
  }
  return balance;
}
function refreshDebt() {
  const now=new Date();
  latestBalance=balanceAt(now);
  $("amount").textContent=fmt(latestBalance);
  $("statusText").textContent=now>new Date(2026,10,30,23,59,59,999)?"СРОК ИСПОЛНЕНИЯ НАРУШЕН":"Срок возврата ещё не истёк";
  const next=new Date(now.getFullYear(),now.getMonth()+1,1);
  $("nextDate").textContent=dateFmt.format(next);
  $("countdown").textContent="Осталось дней: "+Math.max(0,Math.ceil((next-new Date(now.getFullYear(),now.getMonth(),now.getDate()))/86400000));
  const due=new Date(2026,10,30,23,59,59,999);
  let overdue=0;
  if(now>due) overdue=Math.max(0,(now.getFullYear()-2026)*12+now.getMonth()-11+1);
  $("overdue").textContent=overdue+" "+(overdue===1?"месяц":overdue>=2&&overdue<=4?"месяца":"месяцев");
  if(returns.length) {
    const total=returns.reduce((sum,x)=>sum+BigInt(x.amount),0n);
    $("lastAmount").textContent="Возвращено всего: "+fmt(total)+" стрел";
  }
  const slider=$("monthsAhead");
  if(slider) {
    const ahead=Number(slider.value);
    $("projectedDebt").textContent=fmt(latestBalance*(2n**BigInt(ahead)));
    $("projectionDate").textContent=ahead===0?"Текущая сумма с учётом возвратов.":"Прогноз после "+ahead+" ежемесячных удвоений.";
  }
  const history=$("history");
  if(history) {
    history.querySelectorAll("[data-return-row]").forEach(row=>row.remove());
    returns.forEach(item=>{
      const tr=document.createElement("tr"); tr.dataset.returnRow="1";
      const values=[item.createdAt?.toDate?shortFmt.format(item.createdAt.toDate()):"Дата не указана","Возврат: "+(item.note||"без комментария"),"−"+fmt(item.amount)+" стрел"];
      values.forEach(value=>{const td=document.createElement("td");td.textContent=value;tr.append(td)});
      history.prepend(tr);
    });
  }
}
function renderComments() {
  const host=$("commentsList"); host.replaceChildren();
  if(!comments.length) {
    const p=document.createElement("p");p.className="note";p.textContent="Пока комментариев нет. История ждёт первого свидетеля.";host.append(p);return;
  }
  for(const item of comments) {
    const card=document.createElement("article");card.className="comment";
    const top=document.createElement("div");top.className="comment-top";
    const name=document.createElement("b");name.textContent=item.name;
    const date=document.createElement("time");date.textContent=item.createdAt?.toDate?dateFmt.format(item.createdAt.toDate()):"только что";
    top.append(name,date);card.append(top);
    const body=document.createElement("p");body.textContent=item.text;card.append(body);
    if(isOwner()) {
      const del=document.createElement("button");del.className="text-button";del.textContent="Удалить";
      del.addEventListener("click",async()=>{if(confirm("Удалить этот комментарий?")){try{await deleteDoc(doc(db,"comments",item.id));}catch(e){setMessage("commentMessage","Не удалось удалить комментарий: "+e.message,true)}}});
      card.append(del);
    }
    host.append(card);
  }
}
$("ownerLogin").addEventListener("click",async()=>{
  try { await signInWithPopup(auth,provider); }
  catch(e) { setMessage("ownerMessage","Ошибка входа: "+e.message,true); }
});
$("ownerLogout").addEventListener("click",()=>signOut(auth));
$("returnForm").addEventListener("submit",async e=>{
  e.preventDefault();
  if(!isOwner()) return setMessage("ownerMessage","Нет прав владельца.",true);
  const amount=Number($("returnAmount").value);
  const note=$("returnNote").value.trim().slice(0,160);
  if(!Number.isSafeInteger(amount)||amount<1) return setMessage("ownerMessage","Укажи целое число больше нуля.",true);
  if(BigInt(amount)>latestBalance) return setMessage("ownerMessage","Возврат не может превышать текущий долг ("+fmt(latestBalance)+").",true);
  try {
    await addDoc(collection(db,"returns"),{amount,note,createdAt:serverTimestamp(),createdBy:currentUser.email});
    $("returnForm").reset();setMessage("ownerMessage","Возврат записан. Долг пересчитан.");
  } catch(e) {setMessage("ownerMessage","Не удалось сохранить возврат: "+e.message,true);}
});
$("commentForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const name=$("commentName").value.trim(), text=$("commentText").value.trim();
  if(name.length<2||name.length>32||text.length<2||text.length>500) return setMessage("commentMessage","Имя: 2–32 символа. Комментарий: 2–500 символов.",true);
  try {
    await addDoc(collection(db,"comments"),{name,text,createdAt:serverTimestamp()});
    $("commentForm").reset();setMessage("commentMessage","Комментарий опубликован.");
  } catch(e) {setMessage("commentMessage","Не удалось опубликовать: "+e.message,true);}
});
onAuthStateChanged(auth,user=>{
  currentUser=user;
  const owner=isOwner();
  $("ownerLogin").hidden=!!user;
  $("ownerLogout").hidden=!user;
  $("ownerTools").hidden=!owner;
  $("ownerIdentity").textContent=owner?"Вход выполнен: "+user.email:user?"Вошли как "+user.email+" (нет прав владельца)":"Вход владельца не выполнен";
  if(user&&!owner) setMessage("ownerMessage","Этот аккаунт не имеет прав владельца.",true);
  renderComments();
});
onSnapshot(query(collection(db,"returns"),orderBy("createdAt","asc")),snap=>{
  returns=snap.docs.map(d=>({id:d.id,...d.data()}));refreshDebt();
},e=>setMessage("ownerMessage","Ошибка чтения возвратов: "+e.message,true));
onSnapshot(query(collection(db,"comments"),orderBy("createdAt","desc"),limit(60)),snap=>{
  comments=snap.docs.map(d=>({id:d.id,...d.data()}));renderComments();
},e=>setMessage("commentMessage","Ошибка загрузки комментариев: "+e.message,true));
$("monthsAhead").addEventListener("input",refreshDebt);
