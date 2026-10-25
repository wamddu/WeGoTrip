import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Presentation, PresentationFile } from '@oai/artifact-tool';

const ROOT = 'C:/Programings/2026_2_창의학기제';
const BUILD = path.join(ROOT, 'tmp/presentation-expense-packing');
const SKILL = 'C:/Users/user/.codex/plugins/cache/openai-primary-runtime/presentations/26.1007.11041/skills/presentations';
const PYTHON = 'C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
process.env.RUNTIME_NODE_MODULES='C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
process.env.RUNTIME_NODE='C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe';
const FONT = 'Pretendard';
const C = { navy:'#152A45', blue:'#1769C9', teal:'#087E82', ink:'#22344B', muted:'#647589', line:'#DCE4EC', pale:'#F4F7FA', light:'#C6DEF9', white:'#FFFFFF' };
const pres = Presentation.create({slideSize:{width:1440,height:810}});
const SOURCE = '참고자료: C:/Users/user/Downloads/10조 5주차 발표자료 (1).pdf';
const EXP = '구현 근거: C:/Programings/2026_2_창의학기제/docs/EXPENSE-SETTLEMENT-IMPLEMENTATION.md';
const PACK = '구현 근거: C:/Programings/2026_2_창의학기제/docs/CHECKLIST-IMPLEMENTATION.md';

function txt(s, value, x,y,w,h, size=28, color=C.ink, bold=false, align='left', name='') {
  const sh=s.shapes.add({geometry:'textbox',name:name || `text-${s.shapes.items.length}`,position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
  sh.text=value;
  sh.text.style={fontSize:size,typeface:FONT,color,bold,alignment:align,verticalAlignment:'top',autoFit:'none',wrap:'square',insets:0};
  return sh;
}
function rule(s,x,y,w,color=C.line) {
  s.shapes.add({geometry:'rect',position:{left:x,top:y,width:w,height:1.5},fill:color,line:{fill:'none',width:0}});
}
function slide(title, section, note, dark=false) {
  const s=pres.slides.add();
  s.background.fill=dark?C.navy:C.white;
  const n=pres.slides.items.length;
  if(title){
    txt(s,section,80,45,1040,30,20,dark?'#AFC8E4':C.teal,true);
    txt(s,title,80,93,1280,76,48,dark?C.white:C.navy,true,'left','primary-heading');
  }
  rule(s,80,754,1280,dark?'#39516B':C.line);
  txt(s,'WeGoTrip  /  10조',80,770,500,26,18,dark?'#AFC8E4':C.muted);
  txt(s,String(n).padStart(2,'0'),1260,770,100,26,18,dark?'#AFC8E4':C.muted,false,'right');
  s.speakerNotes.text=note;
  return s;
}
function table(s, values, x,y,width,height, widths, opts={}) {
  const rows=values.length, cols=values[0].length;
  const t=s.tables.add({rows,columns:cols,left:x,top:y,width,height,columnWidths:widths,values});
  t.styleOptions={headerRow:false,firstColumn:false,bandedRows:false};
  const border={style:'solid',color:C.line,width:1};
  t.cells.block({row:0,column:0,rowCount:rows,columnCount:cols}).assign({borders:{top:border,bottom:border,left:border,right:border}});
  for(let r=0;r<rows;r++) {
    t.rows[r].height=opts.rowHeights?.[r] ?? height/rows;
    for(let c=0;c<cols;c++) {
      const cell=t.getCell(r,c);
      t.cells.block({row:r,column:c,rowCount:1,columnCount:1}).assign({borders:{top:border,bottom:border,left:border,right:border}});
      cell.fill=r===0?C.navy:(r%2===0?C.pale:C.white);
      cell.text.style={typeface:FONT,fontSize:opts.size??27,color:r===0?C.white:C.ink,bold:r===0,alignment:opts.aligns?.[c]??'left',verticalAlignment:'middle',autoFit:'none',insets:{top:8,bottom:8,left:14,right:14}};
    }
  }
  return t;
}
function pair(s,no,title,body,y) {
  txt(s,no,80,y,72,70,40,C.blue,true);
  txt(s,title,180,y,430,56,34,C.navy,true);
  txt(s,body,650,y,700,86,29,C.ink);
  rule(s,180,y+106,1170);
}

// 01 — clean typographic cover.
{
 const s=slide(null,'',`${SOURCE}\n원본 표지의 팀 정보를 유지했습니다. 이번 자료는 지출·정산과 준비물 구현 보고이며, 특정 발표 주차는 임의로 지정하지 않았습니다.\n발표: 여행 비용을 함께 기록하고 각자의 준비 상태를 확인하도록 연결한 기능을 소개하겠습니다.`,true);
 txt(s,'10조  ·  여행 통합 관리 앱',80,80,1100,40,26,'#AFC8E4',true);
 txt(s,'WeGoTrip',80,177,1260,128,100,C.white,true,'left','primary-heading');
 txt(s,'지출 기록·정산과\n준비물 관리 구현',80,340,1240,172,61,C.white,true);
 txt(s,'서버 저장부터 사용자별 권한과 상태 공유까지',84,555,1180,54,30,'#C2D5E9');
 rule(s,80,645,1280,'#39516B');
 txt(s,'최정흠  22011683     김시혁  22011685     윤호영  22011687',80,680,1280,46,25,'#AFC8E4');
}
// 02 — scope as an editorial list, no UI cards.
{
 const s=slide('이번 구현 범위','구현 개요',`${EXP}\n${PACK}\n발표: 비용 기록, 정산, 준비물을 서버 데이터로 연결했습니다. 세 기능 모두 여행 멤버가 조회할 수 있으며, 상태 변경 권한은 실제 담당자에게 제한했습니다.`);
 txt(s,'여행 멤버가 함께 확인하고, 각자가 맡은 상태를 관리합니다.',80,184,1280,56,31,C.muted);
 pair(s,'01','지출 기록','결제자·참여자·분담금을 등록하고\n소그룹과 메모를 함께 저장',285);
 pair(s,'02','정산','여행 전체의 결제액과 부담액을 비교해\n누가 누구에게 보낼지 계산',428);
 pair(s,'03','준비물','모든 멤버에게 개인 항목을 생성하고\n담당자별 완료 상태를 공유',571);
}
// 03 — exact source timeline rebuilt as an editable native table.
{
 const s=slide('프로젝트 일정','개발 로드맵',`${SOURCE} — 3페이지.\n필수 간트차트의 개발 내용, 주차, 기간과 원본 진행 표시를 모두 유지해 편집 가능한 표로 재구성했습니다. 원본은 1~6주차 항목까지 완료 표시가 있고, 비용 기록·정산은 7주차 계획입니다. 이번 구현 보고에서 원본의 완료 표시를 현재 전체 진척으로 해석하지 않습니다. 준비물은 원본 로드맵에 별도 항목이 없으며 이번 추가 구현 범위입니다.\n발표: 기존 로드맵에서 비용 기록과 정산은 7주차 항목입니다. 이번에는 이 기능과 준비물 관리까지 구현했습니다.`);
 const tasks=[
 ['기획 및 기초 환경 구축',1,1,'1주차'],
 ['DB/API 설계 및 UI 뼈대 구축',2,3,'2~3주차'],
 ['로그인 및 여행방 기능 추가',4,4,'4주차'],
 ['일정 및 장소 등록 기능',5,5,'5주차'],
 ['여행 동선 시각화',6,6,'6주차'],
 ['비용 기록 및 정산 기능 추가',7,7,'7주차'],
 ['실시간 그룹 채팅 기능 추가',8,8,'8주차'],
 ['GPS 위치 공유 기능 추가',9,10,'9~10주차'],
 ['AI 챗봇 기능 추가',11,13,'11~13주차'],
 ['전체 통합 및 QA',14,14,'14주차']
 ];
 txt(s,'추진 일정 (주차)',585,179,600,34,23,C.muted,false,'center');
 const values=[['구분','개발 내용',...Array.from({length:14},(_,i)=>String(i+1)),'기간'],...tasks.map((t,i)=>[String(i+1),t[0],...Array.from({length:14},(_,w)=>(i<5 && w+1>=t[1] && w+1<=t[2])?'✓':''),t[3]])];
 const t=table(s,values,80,226,1280,456,[55,409,...Array(14).fill(50),116],{size:20,rowHeights:[36,...Array(10).fill(42)],aligns:['center','left',...Array(15).fill('center')]});
 for(let r=0;r<11;r++)for(let c=0;c<17;c++) {
   const cell=t.getCell(r,c);
   const edge={style:'solid',color:'#D5E2EE',width:0.7};
   t.cells.block({row:r,column:c,rowCount:1,columnCount:1}).assign({borders:{top:edge,bottom:edge,left:edge,right:edge}});
   cell.text.style={typeface:FONT,fontSize:r===0?18:(c===1?22:20),color:r===0?C.white:C.ink,bold:r===0,alignment:c===1?'left':'center',verticalAlignment:'middle',autoFit:'none',insets:{left:c===1?13:0,right:c===1?6:0,top:0,bottom:0}};
   if(r>0){
     cell.fill=C.white;
     const task=tasks[r-1];
     if(c>=2&&c<=15&&c-1>=task[1]&&c-1<=task[2]){
       cell.fill=r<=5?C.blue:C.light;
       cell.text.color=C.white;
       cell.text.bold=true;
       cell.text.fontSize=24;
     }
     if(r===6&& (c===0||c===1||c===16)) {cell.fill='#EAF4FF';cell.text.color=C.blue;cell.text.bold=true;}
   }
 }
 txt(s,'원본 3페이지의 계획과 진행 표시를 유지한 간트차트',80,708,760,30,20,C.muted);
 txt(s,'이번 보고: 지출·정산 + 준비물',890,706,470,32,23,C.blue,true,'right');
}
// 04 — editable expense example, not a claimed screenshot.
{
 const s=slide('지출 기록과 분담금 저장','지출 기록',`${EXP}\n화면 근거: frontend/src 내 ExpenseForm 및 expense API 연결 코드.\n이 슬라이드의 식비 30,000원은 기능 설명을 위한 예시이며 실제 DB 내역이나 앱 캡처가 아닙니다.\n발표: 결제자와 함께 부담할 멤버를 지정합니다. 균등 분할은 자동 계산하고 직접 지정은 분담 합계가 총액과 일치하는지 확인합니다. 소그룹과 메모도 서버에 저장됩니다.`);
 txt(s,'등록 데이터 예시',80,200,730,46,30,C.navy,true);
 table(s,[['입력 항목','예시'],['지출 제목 · 금액','저녁 식사 · 30,000원'],['지출 날짜','2026.10.09'],['결제자 · 참여자','A · A, B, C'],['분담 방식','균등 분할 → 각 10,000원'],['소그룹 · 메모','전체 · 해운대 식사']],80,264,752,394,[265,487],{size:27,rowHeights:[54,68,68,68,68,68]});
 txt(s,'균등 분할 / 직접 지정',910,250,445,55,32,C.blue,true);
 txt(s,'참여자마다 실제 부담할\n금액을 저장합니다.',910,315,440,94,29);
 rule(s,910,435,445);
 txt(s,'등록·수정·삭제 공유',910,469,445,55,32,C.blue,true);
 txt(s,'목록과 정산 결과를\n서버 데이터로 갱신합니다.',910,534,440,94,29);
 txt(s,'원화 정수 단위  ·  분담 합계 = 지출 총액',80,695,1280,36,25,C.muted);
}
// 05 — arithmetic grounded in an editable table.
{
 const s=slide('결제액과 부담액으로 정산 계산','정산 계산',`${EXP}\n예시: A가 30,000원을 결제하고 A/B/C가 10,000원씩 부담. 잔액은 A +20,000원, B -10,000원, C -10,000원. B→A 및 C→A 각 10,000원.\n정산은 여행 전체 기준이며 소그룹 필터는 지출 목록에 적용됩니다. 송금 횟수가 항상 최소라는 보장은 없습니다.\n발표: 잔액이 양수이면 받을 사람, 음수이면 보낼 사람입니다. 이 잔액을 연결해 송금 제안을 계산합니다.`);
 txt(s,'잔액 = 결제액 − 부담액',80,200,1150,64,39,C.blue,true);
 const balances=table(s,[['멤버','결제액','부담액','잔액'],['A','30,000원','10,000원','+20,000원'],['B','0원','10,000원','−10,000원'],['C','0원','10,000원','−10,000원']],80,302,808,310,[100,220,220,268],{size:29,aligns:['center','right','right','right'],rowHeights:[55,85,85,85]});
 balances.getCell(1,3).text.color=C.blue;
 balances.getCell(1,3).text.bold=true;
 txt(s,'송금 제안',960,305,400,46,30,C.navy,true);
 txt(s,'B → A',960,386,360,60,43,C.blue,true);
 txt(s,'10,000원',960,448,360,52,34);
 txt(s,'C → A',960,539,360,60,43,C.blue,true);
 txt(s,'10,000원',960,601,360,52,34);
 txt(s,'여행 전체 지출을 기준으로 계산합니다.',80,692,1280,40,28,C.muted);
}
// 06 — confirmation ownership and revision semantics.
{
 const s=slide('입금 확인은 받는 사람이 기록','정산 권한',`${EXP}\n코드 근거: backend SettlementService 및 frontend settlement confirmation UI.\n완료와 취소는 송금 수신자만 할 수 있습니다. 서버에서도 수신자 여부를 검사해 다른 사용자의 변경 요청을 403으로 거부합니다. 지출이 변경되면 settlement_revision이 증가해 새 정산 상태는 대기로 시작하며 예전 확인 기록은 보존됩니다. 실제 금융 송금 API는 없습니다.\n발표: B가 A에게 보낼 금액이 있을 때 완료 버튼은 A에게만 보입니다. 금액이 바뀌면 오래된 확인 기록을 새 계산 결과에 적용하지 않습니다.`);
 txt(s,'B → A  10,000원',80,196,1120,65,43,C.blue,true);
 txt(s,'은행 송금 후, A가 입금을 확인해 완료로 기록',80,274,1280,44,29,C.muted);
 table(s,[['사용자','상태 조회','완료 기록 · 취소'],['A · 송금 받는 사람','가능','가능'],['B · 송금할 사람','가능','불가'],['C · 다른 멤버','가능','불가']],80,353,1280,265,[550,310,420],{size:29,rowHeights:[55,70,70,70],aligns:['left','center','center']});
 txt(s,'지출 변경 → 새 정산 버전 → 다시 입금 확인',80,660,1280,48,31,C.teal,true);
 txt(s,'완료 기록은 수동 확인 기능이며 실제 송금 기능은 아닙니다.',80,711,1280,28,20,C.muted);
}
// 07 — fan-out and individual completion.
{
 const s=slide('모두의 준비물을 개인 항목으로 생성','준비물 등록',`${PACK}\n기존 packing_item 구조를 사용합니다. 모든 멤버가 각자 준비를 선택하면 등록 당시 ACTIVE 멤버마다 같은 이름의 개인 항목을 1개 생성하고 한 트랜잭션으로 저장합니다. 이후 합류한 멤버에게는 자동 생성되지 않습니다.\n여권 예시는 실제 DB 데이터가 아닌 4명 여행의 설명용 데이터입니다. A만 체크했다면 1/4이며 다른 사람들의 상태는 바뀌지 않습니다.\n발표: 공용 체크 하나가 끝나는 대신 각자 여권 항목을 갖게 됩니다. A가 챙긴 사실은 A의 완료 상태로만 반영됩니다.`);
 txt(s,'“모든 멤버가 각자 준비”',80,221,650,66,39,C.blue,true);
 txt(s,'여권 1개 등록\n↓\n현재 멤버 4명의 항목 생성',80,335,620,164,35);
 txt(s,'A만 체크하면',80,557,620,45,29,C.muted);
 txt(s,'1 / 4 완료',80,610,620,66,47,C.teal,true);
 const packing=table(s,[['준비물','담당자','상태'],['여권','A','완료'],['여권','B','미완료'],['여권','C','미완료'],['여권','D','미완료']],735,250,625,377,[220,150,255],{size:29,rowHeights:[57,80,80,80,80],aligns:['left','center','center']});
 packing.getCell(1,2).text.color=C.teal;
 packing.getCell(1,2).text.bold=true;
 txt(s,'등록 당시 여행 멤버 기준으로 생성합니다.',735,679,625,40,24,C.muted);
}
// 08 — independent status viewing, own completion only.
{
 const s=slide('담당자별 준비 상태와 진행률 확인','준비물 조회',`${PACK}\nUI 근거: 멤버별 준비 현황, 담당자 필터 및 전체/내 준비물/미완료 선택. 모든 멤버가 목록을 볼 수 있지만 완료/해제는 해당 항목 담당자만 가능하며 서버에도 같은 권한 검사가 있습니다. 홈과 여행 개요의 준비물 진행률은 개인 항목을 기준으로 집계합니다.\n발표: 내 준비물로 내가 챙길 목록을 좁히고, 전체 목록에서는 누가 아직 준비하지 않았는지 확인할 수 있습니다.`);
 const cols=[['내 준비물','내가 챙길 항목만\n모아서 확인'],['담당자별 상태','멤버별 완료 수와\n남은 항목 확인'],['미완료','아직 챙기지 않은\n준비물에 집중']];
 cols.forEach((v,i)=>{
   const x=80+i*440;
   txt(s,v[0],x,220,390,56,36,C.blue,true);
   txt(s,v[1],x,295,380,105,31);
 });
 rule(s,80,438,1280);
 table(s,[['항목 관계','상태 조회','완료 체크 · 해제'],['내 준비물','가능','가능'],['다른 멤버의 준비물','가능','불가']],80,485,1280,197,[550,310,420],{size:29,rowHeights:[57,70,70],aligns:['left','center','center']});
 txt(s,'홈과 여행 개요에도 개인 항목 기준 진행률을 반영합니다.',80,706,1280,34,25,C.muted);
}
// 09 — server connectivity and the actual persistence model.
{
 const s=slide('API와 데이터베이스 연결','서버 구현',`${EXP}\n${PACK}\nController 근거: backend/src/main/java/com/travel/travelbackend/controller/ExpenseController.java, SettlementController.java, PackingController.java.\nExpense CRUD: GET/POST /expenses, GET/PUT/DELETE /expenses/{id}. 정산 GET /settlement 및 PUT /settlement/confirmations. 준비물 CRUD와 PUT /packing-items/{id}/completion. 공통 prefix /api/v1/trips/{tripId}.\n지출·정산 DB 변경은 사용자 사전 승인을 거쳐 이미 적용됐으며 준비물은 기존 스키마를 재사용했습니다.\n발표: 화면의 기록은 각 API를 통해 서버에 저장됩니다. 정산 완료 상태도 별도 테이블에서 관리하며 준비물은 기존 구조를 활용했습니다.`);
 txt(s,'공통 경로  /api/v1/trips/{tripId}',80,191,1280,40,26,C.muted);
 table(s,[['기능','주요 API','저장 위치'],
   ['지출','/expenses\n조회 · 등록 · 수정 · 삭제','expense\nexpense_participant'],
   ['정산','/settlement\n/settlement/confirmations','trip.settlement_revision\nsettlement_confirmation'],
   ['준비물','/packing-items\n/{id}/completion','packing_item\n담당자 · 완료 상태']
 ],80,270,1280,395,[205,535,540],{size:28,rowHeights:[56,113,113,113]});
 txt(s,'지출·정산: 승인된 DB 변경 반영    |    준비물: 기존 DB 구조 활용',80,703,1280,37,25,C.teal,true);
}
// 10 — meaningful implementation details rather than generic architecture art.
{
 const s=slide('공유 데이터의 일관성 보호','예외 처리',`${EXP}\n${PACK}\n같은 Idempotency-Key의 재시도는 중복 생성을 방지합니다. 지출은 정산 버전, 준비물은 항목 상태 토큰으로 동시 변경을 검증하고 충돌 시 409를 반환하며 화면에서 최신 데이터 재조회 안내를 제공합니다. 모든 멤버 준비물 생성은 한 트랜잭션으로 처리합니다. 화면 진입·앱 복귀·새로고침 시 공유 데이터를 갱신하며 실시간 푸시 동기화라고 주장하지 않습니다.\n발표: 버튼을 숨기는 것에 더해 서버에서도 권한을 확인합니다. 통신 재시도나 동시 수정 때 생길 수 있는 중복과 오래된 변경도 막았습니다.`);
 table(s,[['상황','처리 방식','결과'],
   ['다른 사람이 상태 변경','수신자 · 담당자 권한 검사','서버에서 변경 거부'],
   ['같은 저장 요청 재전송','요청 식별자 재사용','중복 등록 방지'],
   ['동시에 같은 데이터 수정','버전 · 상태 토큰 비교','최신 데이터 확인 안내'],
   ['모든 멤버 준비물 등록','여러 항목을 한 번에 저장','일부만 생성되는 상황 방지']
 ],80,239,1280,415,[335,480,465],{size:27,rowHeights:[59,89,89,89,89]});
 txt(s,'화면 진입 · 앱 복귀 · 새로고침 시 서버 상태 갱신',80,699,1280,43,28,C.muted);
}
// 11 — prior verified results with explicit practical limits.
{
 const s=slide('검증 결과와 남은 확인','구현 검증',`${EXP}\n${PACK}\n문서에 기록된 최신 검증 결과: 지출·정산 통합 테스트 23개, 준비물 API 통합 테스트 29개, 프론트엔드 전체 테스트 142개, 타입 검사 통과. 이번 발표자료 제작 중 테스트를 다시 실행한 수치가 아닙니다. 실제 브라우저/Android 사용 흐름 QA 완료는 주장하지 않습니다.\n발표: 자동 검증에서는 저장, 계산, 권한과 재시도 흐름을 확인했습니다. Android에서 여러 계정으로 화면을 조작하는 확인은 다음 검증 항목입니다.`);
 txt(s,'자동 테스트 통과 수',80,189,1280,38,27,C.muted);
 const metrics=[['23','지출·정산 API 테스트'],['29','준비물 API 테스트'],['142','프론트엔드 전체 테스트']];
 metrics.forEach((v,i)=>{const x=80+i*440;txt(s,v[0],x,242,390,122,96,C.blue,true);txt(s,v[1],x,385,390,60,28,C.navy,true);});
 rule(s,80,476,1280);
 txt(s,'확인한 항목',80,518,285,45,28,C.teal,true);
 txt(s,'저장·분담 계산·권한·중복 요청 처리  /  타입 검사 통과',370,518,990,51,28);
 txt(s,'다음 확인',80,607,285,45,28,C.teal,true);
 txt(s,'Android 사용 흐름  /  여러 계정의 상태 공유·동시 수정',370,607,990,54,28);
 txt(s,'수치는 구현 문서에 기록된 검증 결과입니다.',80,708,1280,27,20,C.muted);
}
// 12 — closing repeats concrete outcomes and leaves a useful discussion prompt.
{
 const s=slide(null,'',`${EXP}\n${PACK}\n발표: 이제 여행 비용을 함께 기록하고 정산 대상과 금액을 확인할 수 있으며 준비물도 각자의 상태로 관리할 수 있습니다. 이후 실제 기기와 다중 계정 사용 흐름을 확인하겠습니다. 질의응답을 받겠습니다.`,true);
 txt(s,'WeGoTrip  ·  구현 보고',80,90,1280,40,27,'#AFC8E4',true);
 txt(s,'감사합니다',80,225,1280,125,86,C.white,true,'left','primary-heading');
 txt(s,'지출은 함께 기록하고\n정산은 수신자가 확인하고\n준비물은 각자가 체크합니다.',80,420,1280,175,40,'#D7E4F2');
 txt(s,'Q&A',80,666,1280,53,36,'#AFC8E4',true);
}

await fs.mkdir(path.join(BUILD,'render'),{recursive:true});
await fs.writeFile(path.join(BUILD,'deck.proto.json'),JSON.stringify(pres.toProto()));
const candidate=path.join(BUILD,'candidate.pptx');
await (await PresentationFile.exportPptx(pres)).save(candidate);
console.log(`Candidate exported: ${pres.slides.items.length} slides`);
for(const [i,s] of pres.slides.items.entries()) {
  const stem=`slide-${String(i+1).padStart(2,'0')}`;
  const png=await pres.export({slide:s,format:'png',scale:1});
  await fs.writeFile(path.join(BUILD,'render',`${stem}.png`),new Uint8Array(await png.arrayBuffer()));
  const layout=await s.export({format:'layout'});
  await fs.writeFile(path.join(BUILD,'render',`${stem}.layout.json`),await layout.text());
  console.log(`Rendered ${stem}`);
}
if(process.argv.includes('--finalize')) {
  const {finalizePresentation}=await import(pathToFileURL(path.join(SKILL,'container_tools/artifact_tool_utils.mjs')).href);
  const finalPath=path.join(ROOT,'output/presentations/WeGoTrip_지출정산_준비물_발표자료.pptx');
  await finalizePresentation({
    workspaceDir:ROOT,candidatePath:candidate,finalPath,pythonExecutable:PYTHON,
    integrityValidatorPath:path.join(SKILL,'container_tools/inspect_presentation_package_integrity.py'),
    layoutValidatorPath:path.join(SKILL,'container_tools/inspect_presentation_layout_geometry.py'),
    layoutArgs:['--expected-slide-size-emu','13716000,7715250','--validate-bullet-geometry','--validate-heading-fit','--cover-role','cover','--require-native-table-slide','3'],
    requiredNativeTableOwnerSlides:[3],
    fontPolicy:{basis:'design',families:[FONT]},verifyArtifactToolImport:true,
    receiptPath:path.join(BUILD,'final-v2.validation.json')
  });
  console.log(`Finalized: ${finalPath}`);
}
