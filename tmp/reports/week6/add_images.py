from pathlib import Path
import xml.etree.ElementTree as E
import copy,base64,re,io,sys
from PIL import Image
sys.stdout.reconfigure(encoding='utf8')
out=Path('output/reports')
root=E.parse(next(out.glob('*6주차_완성본.hml'))).getroot()
html=Path('output/presentations/WeGoTrip_HTML_PDF/WeGoTrip_정산_준비물.html').read_text(encoding='utf8')
assets={}
assetdir=Path('tmp/reports/week6/images');assetdir.mkdir(exist_ok=True)
for tag in re.findall(r'<img[^>]+>',html):
    attrs=dict(re.findall(r'([\w-]+)="([^"]*)"',tag))
    if 'data-source' in attrs:
        name=attrs['data-source'];data=base64.b64decode(attrs['src'].split(',',1)[1]);assets[name]=data
        (assetdir/(name if name.endswith('.png') else name+'.png')).write_bytes(data)
assert len(assets)==11
sec=root.find('./BODY/SECTION')
para_list=root.find('.//PARASHAPELIST');char_list=root.find('.//CHARSHAPELIST')
def pstyle(align='Left',space=500,line=145):
    p=copy.deepcopy(para_list[0]);pid=str(len(para_list));p.set('Id',pid);p.set('Align',align);p.set('KeepWithNext','false')
    p.find('PARAMARGIN').attrib.update(Prev='0',Next=str(space),LineSpacing=str(line))
    para_list.append(p);para_list.set('Count',str(len(para_list)));return pid
body_style=pstyle();title_style=pstyle(space=800);picture_style=pstyle('Center',300,100);cap_style=pstyle('Center',800)
def cstyle(size,bold=False):
    c=copy.deepcopy(root.find('.//CHARSHAPE[@Id="10"]'));cid=str(len(char_list));c.set('Id',cid);c.set('Height',str(size))
    if bold:E.SubElement(c,'BOLD')
    char_list.append(c);char_list.set('Count',str(len(char_list)));return cid
body_char=cstyle(1100);title_char=cstyle(1500,True);cap_char=cstyle(1000)
def para(text='',style=None,char=None,br=False):
    p=E.SubElement(sec,'P',{'ParaShape':style or body_style,'Style':'0','PageBreak':str(br).lower()})
    t=E.SubElement(p,'TEXT',{'CharShape':char or body_char})
    if text:E.SubElement(t,'CHAR').text=text
    return t
def title(t):para(t,title_style,title_char,True)
bindlist=root.find('.//BINDATALIST');storage=root.find('.//BINDATASTORAGE')
pic_template=copy.deepcopy(root.find('.//PICTURE'))
count=0
def picture(t,name,maxw,maxh):
    global count
    count+=1;data=assets[name];im=Image.open(io.BytesIO(data));w,h=im.size;scale=min(maxw/w,maxh/h);W,H=round(w*scale),round(h*scale)
    bid=str(len(bindlist)+1)
    E.SubElement(bindlist,'BINITEM',{'BinData':bid,'Format':'png','Type':'Embedding'});bindlist.set('Count',str(len(bindlist)))
    enc=base64.b64encode(data).decode();E.SubElement(storage,'BINDATA',{'Encoding':'Base64','Id':bid,'Size':str(len(enc))}).text=enc
    pic=copy.deepcopy(pic_template);so=pic.find('SHAPEOBJECT');so.set('InstId',str(900000+count));so.set('TextWrap','TopAndBottom');so.set('ZOrder',str(count+10))
    so.find('SIZE').attrib.update(Width=str(W),Height=str(H))
    so.find('POSITION').attrib.update(TreatAsChar='true',AffectLSpacing='true',HorzOffset='0',VertOffset='0',HorzRelTo='Para',VertRelTo='Para')
    so.find('SHAPECOMMENT').text=name
    sc=pic.find('SHAPECOMPONENT');sc.attrib.update(InstID=str(910000+count),OriWidth=str(W),OriHeight=str(H))
    sc.find('ROTATIONINFO').attrib.update(CenterX=str(W//2),CenterY=str(H//2))
    pic.find('IMAGERECT').attrib.update(X1=str(W),X2=str(W),Y2=str(H),Y3=str(H))
    pic.find('IMAGECLIP').attrib.update(Left='0',Top='0',Right=str(w*75),Bottom=str(h*75))
    pic.find('IMAGE').set('BinItem',bid);t.append(pic)
def pair(a,b):
    t=para(style=picture_style);picture(t,a,24000,47000);E.SubElement(t,'CHAR').text='  ';picture(t,b,24000,47000)
def caption(t):para(t,cap_style,cap_char)
title('학습 결과 1  지출 내역과 정산 결과')
para('지출 내역과 정산 결과를 나누어 볼 수 있도록 구성하였다. 총지출과 개인 부담액을 먼저 확인한 뒤, 누가 누구에게 얼마를 보내야 하는지 살펴볼 수 있다. 아래 예시에서는 저녁 식사와 아쿠아리움 이용료를 합쳐 총 188,000원이 기록되어 있다.')
pair('정산화면.png','정산결과화면.png')
caption('그림 1  지출 내역(왼쪽)과 여행 전체 정산 결과(오른쪽)')
para('결제한 금액과 실제로 부담할 금액을 구분해 정산 결과를 계산하였다. 송금 수신자가 입금을 확인한 뒤 완료 상태를 기록하도록 하여, 돈을 보내는 사람과 확인하는 사람의 역할을 구분하였다.')
title('학습 결과 2  지출 입력과 분담금 설정')
para('지출 금액과 날짜, 결제자를 입력하고 함께 부담할 멤버를 선택하도록 하였다. 똑같이 나누는 경우에는 균등 분할을 사용하고, 멤버마다 부담액이 다른 경우에는 금액을 직접 지정할 수 있다.')
pair('지출추가1.png','지출추가2.png')
caption('그림 2  지출 기본 정보(왼쪽)와 멤버별 분담금 입력(오른쪽)')
para('결제자도 분담자에 포함할 수 있도록 구성하였다. 분담금 합계가 지출 총액과 맞는지 확인하고, 균등 분할에서 생기는 원 단위 나머지도 빠짐없이 배분하도록 처리하였다.')
title('학습 결과 3  멤버별 준비물 관리')
para('준비물은 같은 이름이라도 담당자별로 각각 관리하도록 하였다. 모든 멤버가 여권을 챙기는 상황에서 한 사람의 체크가 다른 사람의 준비 상태에 영향을 주지 않도록 하기 위해서다.')
pair('준비물화면.png','준비물화면2.png')
caption('그림 3  전체 준비 현황(왼쪽)과 담당자별 준비물 목록(오른쪽)')
para('전체·내 준비물·미완료 필터와 멤버 선택 기능을 통해 필요한 항목을 찾아볼 수 있다. 준비물 체크와 해제는 해당 담당자만 할 수 있도록 화면과 서버에서 권한을 검사하였다.')
title('학습 결과 4  데이터 저장 구조')
para('화면에 입력한 정보가 어떻게 연결되어 저장되는지 확인하였다. 지출의 기본 정보와 개인별 부담액을 분리하고, 정산 완료 기록과 준비물 상태도 각각의 테이블에서 관리하였다.')
for name,cap,ex,w in [
 ('expenseDB.png','그림 4  expense 테이블','지출 제목, 총금액, 결제자, 날짜 등을 저장한다. 예시에는 저녁 83,000원과 아쿠아리움 105,000원이 기록되어 있다.',48000),
 ('expense_participantDB.png','그림 5  expense_participant 테이블','지출 ID와 여행 멤버 ID를 연결해 개인별 부담액을 저장한다. 저녁 식사비 83,000원은 27,667원, 27,667원, 27,666원으로 나누어 합계를 맞췄다.',27500),
 ('settlement_confirmationDB.png','그림 6  settlement_confirmation 테이블','송금자와 수신자, 금액, 완료 여부 및 정산 기준 버전을 저장한다. 수신자의 완료 처리 기록을 관리하며, 지출이 변경되면 현재 기준으로 정산을 다시 계산한다.',50000),
 ('packing_itemDB.png','그림 7  packing_item 테이블','준비물의 제목, 담당 멤버와 완료 여부를 저장한다. 멤버별 항목을 독립적으로 관리해 다른 사람의 체크 상태와 섞이지 않도록 하였다.',26000)]:
    t=para(style=picture_style);picture(t,name,w,9500);caption(cap);para(ex)
title('개발 일정과 내주 계획')
para('아래는 발표자료에 사용한 개발 일정이다. 주차별 계획과 진행 표시는 첨부한 간트 차트 그대로 유지하였다.')
t=para(style=picture_style);picture(t,'gantt',50000,31000)
caption('그림 8  주차별 개발 일정')
para('이번 주에는 지출 정산과 준비물 관리에 필요한 입력 화면, 저장 구조, 권한 처리를 정리하였다. 여러 사람이 같은 여행 정보를 보더라도 각자가 변경할 수 있는 범위를 구분해야 한다는 점을 배웠다.')
para('다음 주에는 여행방 멤버들이 사용할 실시간 채팅 기능을 구현할 예정이다. 메시지를 보내고 받는 기본 흐름과 대화 내역 표시를 먼저 구성하고, 같은 여행방의 멤버만 접근할 수 있도록 처리하겠다. 연결이 끊기거나 다시 접속했을 때의 동작도 함께 살펴볼 계획이다.')
dest=out/'2026-2학기__010_최정흠_주간학습보고서_6주차_이미지포함.hml'
E.ElementTree(root).write(dest,encoding='utf-8',xml_declaration=True)
print(dest, 'images added',count)
