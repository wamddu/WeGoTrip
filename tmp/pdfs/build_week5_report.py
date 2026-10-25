from pathlib import Path
from lxml import etree as E
from PIL import Image
from copy import deepcopy
import base64

root=E.parse('tmp/pdfs/template.hml')
table=root.findall('.//TABLE')[1]
rows=table.findall('ROW')

def para(text, style='24', char='10'):
    p=E.Element('P',ParaShape=style,Style='0')
    t=E.SubElement(p,'TEXT',CharShape=char)
    E.SubElement(t,'CHAR').text=text
    return p

def fill(row, texts):
    pl=rows[row].findall('CELL')[-1].find('PARALIST')
    for child in list(pl):pl.remove(child)
    for text in texts:pl.append(para(text))
    return pl

# Keep the supplied student information, study period, study hours and signature area.
fill(5,[
 '여행방 내 일정 및 저장 장소의 조회·등록·수정·삭제 기능을 구체화하고, 장소를 일정에 연결하는 사용 흐름을 구현한다. 날짜별 일정표와 지도 동선을 구성하며, 전체 일정과 파티 일정의 시간 중첩을 반영하여 파티별 이동 계획을 확인할 수 있도록 한다.'
])
pl=fill(6,[
 '1. 일정 및 장소 관리 API 명세 정리',
 '공통 경로 /api/v1과 Bearer Access Token 인증을 적용하는 저장 장소 API 5개 및 일정 API 5개를 정리하였다. 목록·단건 조회에는 GET, 등록에는 POST, 전체 수정에는 PUT, 삭제에는 DELETE를 사용한다. 성공 응답은 code와 data, 실패 응답은 code와 message로 구성한다. 목록은 items와 nextCursor를 사용하고, 화면에서는 일정을 날짜·시간순으로 표시하도록 명세를 정하였다.',
 '2. 저장 장소 관리와 일정 연결',
 '저장 장소는 name, address, category, note, coordinates 정보를 관리하며, 좌표 없이 등록할 수 있도록 구성하였다. 등록 요청에는 UUID 형식 Idempotency-Key를 사용하도록 정하였다. 장소 수정 시 연결된 일정의 장소 표시 정보도 갱신하며, 연결 일정이 있는 장소의 삭제는 409 PLACE_IN_USE로 차단하는 정책을 명세에 반영하였다.',
 '장소 추가 화면에는 검색, 이름·주소 입력, 분류 선택, 메모 작성, 저장 기능을 구성하였다. 검색한 장소의 위치를 지도에서 확인할 수 있으며, 일정 편집 시 저장 장소를 이름이나 주소로 찾아 연결할 수 있다. 방문 장소가 미정인 일정은 장소 없이 유지하고 나중에 연결할 수 있도록 하였다.',
 '3. 날짜별 일정 관리 및 지도 동선 표시',
 '일정에는 title, date, startTime, endTime, placeId, partyId, note를 사용한다. 일정 날짜는 여행 기간 내로 제한하고, placeId를 비우면 장소 연결을 해제하며, partyId를 비우면 공통 일정으로 관리하도록 명세를 정하였다. 보관된 여행의 일정은 삭제할 수 없도록 정책을 정리하였다.',
 '일정 화면에서는 여행 날짜와 DAY를 선택하고, 시간순 일정 카드에서 제목·시간·장소·참여 대상을 확인할 수 있도록 구성하였다. 일정표와 지도 동선을 전환할 수 있으며, 장소가 연결된 일정의 방문 순서를 번호와 연결선으로 표시하였다. 이 연결선은 방문 순서의 시각화이며 실제 도로 경로나 이동 시간 계산을 포함하지 않는다.',
 '4. 파티 일정과 전체 일정의 중첩 처리',
 '파티를 선택하면 전체 일정과 파티 일정이 시간상 겹치는 구간을 계산하여 해당 파티가 확인할 일정을 표시하도록 구현하였다. 전체 일정의 자유시간 구간에 파티의 개별 방문 일정이 있으면 선택한 파티 화면에 해당 방문 일정을 표시한다.',
 '예시에서 전체 롯데월드 일정은 14:00~20:00이고, 파티의 호캉스 일정은 13:00~15:00이다. 두 일정이 겹치는 14:00~15:00에는 파티 일정을 표시하고, 이후 15:00~20:00에는 전체 일정에 합류하는 것으로 표시한다. 중간 합류 안내와 원래 전체 일정 시간을 함께 제공하고, 지도에서는 공통 일정과 파티 일정을 색상으로 구분한다.',
 '5. 구현 결과 화면',
 '아래 이미지는 5주차 발표자료에 포함된 구현 화면을 발췌한 것이다.'
])

pic_template=root.find('.//PICTURE')
binlist=root.find('.//BINDATALIST')
storage=root.find('.//BINDATASTORAGE')
figure_specs=[
 (6,(260,330,1810,1260),'그림 1. 날짜별 일정표, 여행 날짜 선택 및 지도 동선 화면'),
 (7,(260,320,1780,1260),'그림 2. 장소 검색·추가와 저장 장소의 일정 연결 화면'),
 (8,(155,110,2005,1190),'그림 3. 전체 일정과 파티 일정의 중첩 및 중간 합류 표시')
]
for i,(slide,box,caption) in enumerate(figure_specs,4):
    image=Image.open(f'tmp/pdfs/slide-{slide}.png').crop(box)
    path=Path(f'tmp/pdfs/report-figure-{i-3}.png');image.save(path)
    data=path.read_bytes()
    E.SubElement(binlist,'BINITEM',BinData=str(i),Format='png',Type='Embedding')
    b=E.SubElement(storage,'BINDATA',Encoding='Base64',Id=str(i),Size=str(len(data)))
    b.text=base64.b64encode(data).decode('ascii')
    pic=deepcopy(pic_template)
    w=41000;h=round(w*image.height/image.width)
    so=pic.find('SHAPEOBJECT');so.set('InstId',str(2100000000+i));so.set('TextWrap','TopAndBottom')
    so.find('SIZE').set('Width',str(w));so.find('SIZE').set('Height',str(h))
    pos=so.find('POSITION')
    for k,v in {'TreatAsChar':'true','HorzOffset':'0','VertOffset':'0','HorzRelTo':'Para','VertRelTo':'Para','AllowOverlap':'false','AffectLSpacing':'true'}.items():pos.set(k,v)
    so.find('SHAPECOMMENT').text=caption
    comp=pic.find('SHAPECOMPONENT');comp.set('InstID',str(1100000000+i));comp.set('OriWidth',str(w));comp.set('OriHeight',str(h))
    rot=comp.find('ROTATIONINFO');rot.set('CenterX',str(w//2));rot.set('CenterY',str(h//2))
    rect=pic.find('IMAGERECT')
    for k,v in {'X0':0,'X1':w,'X2':w,'X3':0,'Y0':0,'Y1':0,'Y2':h,'Y3':h}.items():rect.set(k,str(v))
    clip=pic.find('IMAGECLIP');clip.set('Right',str(image.width*75));clip.set('Bottom',str(image.height*75))
    pic.find('IMAGE').set('BinItem',str(i))
    p=E.Element('P',ParaShape='22',Style='0');t=E.SubElement(p,'TEXT',CharShape='10');t.append(pic);E.SubElement(t,'CHAR').text=''
    pl.append(p);pl.append(para(caption,'22','2'));pl.append(para('','22'))
binlist.set('Count',str(len(binlist)))

fill(7,[
 '① 발표자료의 API 명세를 기준으로 기능별 요청·응답과 여행 멤버 접근 조건, 장소·일정 연결 관계를 정리하였다.',
 '② 날짜 선택 → 일정 확인 → 장소 검색·저장 → 일정에 장소 연결 → 지도 동선 확인의 사용자 흐름을 중심으로 화면 구성을 학습하였다.',
 '③ 전체 일정과 파티 일정의 시간 구간을 비교하고, 자유시간 대체 및 중간 합류 사례를 통해 화면 표시 방식을 정리하였다. 구현 결과는 발표자료에 제시된 화면을 근거로 기록하였다.'
])
fill(8,[
 '일정 및 저장 장소 API 총 10개의 명세를 정리하고, 날짜별 일정 조회와 장소 추가·연결 화면을 구현하여 여행 계획을 관리할 기반을 마련하였다. 일정표와 지도 동선 화면을 제공하고, 파티별 일정 중첩과 중간 합류 표시를 통해 공통·개별 일정을 함께 확인할 수 있도록 하였다.',
 '발표자료 기준으로 이번 주의 일정·장소 관리와 화면 시각화 목표에 해당하는 결과를 제시하였다. 다만 실제 DB 저장·재조회 결과, 다중 기기 동기화 및 자동화 테스트 수치는 자료에서 확인되지 않으므로 별도의 검증 성과로 기재하지 않았다. 지도 연결선의 범위는 방문 순서 표시까지이며 실제 경로·소요 시간 계산은 후속 보완 사항이다.'
])
fill(9,[
 '1. 10조 5주차 발표자료.pdf: 여행 통합 관리 앱의 프로젝트 일정, 일정·장소 API 명세, 구현 화면 및 내주 계획.',
 '2. WeGoTrip · 01 저장 장소 API: 발표자료 화면 4P, 저장 장소 CRUD 5개와 요청·응답 및 연결 일정 정책.',
 '3. WeGoTrip · 02 일정 API: 발표자료 화면 5P, 일정 CRUD 5개와 날짜·장소·파티 정보 관리 정책.',
 '4. 발표자료 화면 6P·8P·10P: 날짜별 일정, 장소 추가·연결, 파티 일정 및 지도 동선 구현 사례. 본 보고서 그림 1~3의 출처.'
])
fill(10,[
 '비용 기록 및 정산 기능을 추가한다. 여행 중 발생하는 공동 지출을 기록하고, 결제자와 정산 대상 및 금액을 관리하는 흐름을 구체화한다. 기존 여행 멤버 정보와 연계할 데이터 및 API·화면 구성을 검토하고, 지출 등록부터 멤버별 정산 확인까지의 사용 흐름을 구현할 계획이다.'
])

# Give body paragraphs adequate spacing without changing the template's headings.
for n in ('22','24'):
    ps=root.find(f'.//PARASHAPE[@Id="{n}"]')
    ps.set('Align','Left')
    ps.find('PARAMARGIN').set('Next','300')
root.write('tmp/pdfs/week5-completed.hml',encoding='UTF-8',xml_declaration=True)
print('Created report XML with 3 embedded figures.')
