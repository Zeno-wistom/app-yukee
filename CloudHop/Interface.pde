// Figma reference: Android Expanded - 7 (42:213). All UI coordinates use 2000x400.
final int CREAM=0xffF5F3EA, PAPER=0xffFFFEF8, INK=0xff304D43, MUTED=0xff738277;
final int GREEN=0xff537861, MINT=0xffDFE8D8, PEACH=0xffEDD6BC, LINE=0xffDFE3D7;
final int DARK=0xff253E34, RED=0xffAD6355;
ArrayList<Control> controls=new ArrayList<Control>();
HashMap<String,PImage> icons=new HashMap<String,PImage>();
String focusId="";
float carouselNudge=0;
String[] gameNames={"云端拾光","弹跳花园","星轨节拍","微风旋律"};
String[] gameTypes={"头颈活动","跳蹲活动","腕部活动","扭腰活动"};
String[] gameEnglish={"CLOUD HOP","BOUNCE GARDEN","STAR RHYTHM","BREEZE FLOW"};

class Control {
 String id;float x,y,w,h;boolean enabled;
 Control(String id,float x,float y,float w,float h,boolean enabled){this.id=id;this.x=x;this.y=y;this.w=w;this.h=h;this.enabled=enabled;}
}
void loadUIAssets(){for(String name:new String[]{"power","arrow","back","pause","play"})icons.put(name,loadImage("ui/"+name+".png"));}
boolean hitUI(float x,float y,float w,float h){
 float s=min(width/UI_W,height/UI_H),mx=(mouseX-(width-UI_W*s)/2)/s,my=(mouseY-(height-UI_H*s)/2)/s;
 return mx>=x&&mx<=x+w&&my>=y&&my<=y+h;
}
void textUI(String s,float x,float y,float size,int c){fill(c);textFont(ui);textSize(size);textAlign(LEFT,CENTER);text(s,x,y);}
void strong(String s,float x,float y,float size,int c){fill(c);textFont(bold);textSize(size);textAlign(LEFT,CENTER);text(s,x,y);}
void centered(String s,float x,float y,float size,int c){fill(c);textFont(ui);textSize(size);textAlign(CENTER,CENTER);text(s,x,y);}
void tag(String s,float x,float y,int c){strong(s,x,y,14,c);}
void card(float x,float y,float w,float h,int c,float radius){
 noStroke();fill(INK,9);rect(x,y+5,w,h,radius);fill(c);rect(x,y,w,h,radius);
}
void lineUI(float x,float y,float w){stroke(LINE);strokeWeight(1);line(x,y,x+w,y);noStroke();}
void register(String id,float x,float y,float w,float h,boolean enabled){controls.add(new Control(id,x,y,w,h,enabled));}
void btn(String id,String title,float x,float y,float w,float h,boolean primary,boolean enabled){
 boolean hover=enabled&&hitUI(x,y,w,h);
 noStroke();fill(!enabled?LINE:primary?(hover?0xff42634F:GREEN):(hover?0xffD8E2D0:MINT));rect(x,y,w,h,13);
 centered(title,x+w/2,y+h/2-1,20,!enabled?MUTED:primary?PAPER:INK);
 register(id,x,y,w,h,enabled);focusOutline(id,x,y,w,h,13);
}
void textButton(String id,String title,float x,float y,float w,float h,int c){
 if(hitUI(x,y,w,h)){noStroke();fill(c,10);rect(x,y,w,h,8);}
 centered(title,x+w/2,y+h/2,18,c);register(id,x,y,w,h,true);focusOutline(id,x,y,w,h,8);
}
void focusOutline(String id,float x,float y,float w,float h,float r){if(focusId.equals(id)){noFill();stroke(0xffC29052);strokeWeight(3);rect(x-3,y-3,w+6,h+6,r);noStroke();}}
void icon(String name,float x,float y,float size,boolean flipped){
 PImage im=icons.get(name);if(im==null)return;
 pushMatrix();translate(x,y);if(flipped){translate(size,0);scale(-1,1);}image(im,0,0,size,size);popMatrix();
}
void iconBtn(String id,String name,float x,float y,float size,boolean flipped){
 boolean hover=hitUI(x,y,size,size);noStroke();fill(hover?MINT:PAPER);rect(x,y,size,size,15);
 icon(name,x+size*0.24f,y+size*0.24f,size*0.52f,flipped);register(id,x,y,size,size,true);focusOutline(id,x,y,size,size,15);
}
void pill(String s,float x,float y,float w,int bg,int fg){noStroke();fill(bg);rect(x,y,w,28,14);centered(s,x+w/2,y+13,15,fg);}
void drawApp(){
 controls.clear();noStroke();fill(CREAM);rect(0,0,UI_W,UI_H);
 if(screen.equals("dashboard"))drawDashboard();
 else if(screen.equals("standby"))drawStandby();
 else if(screen.equals("select")||screen.equals("detail"))drawSelection(screen.equals("detail"));
 else drawGameFlow();
 if(!overlay.isEmpty()){controls.clear();drawOverlay();}
 if(millis()<toastUntil){
  float tw=toast.equals("存档已删除，可撤销")?470:540;
  noStroke();fill(DARK,245);rect(1000-tw/2,354,tw,37,14);
  centered(toast,toast.equals("存档已删除，可撤销")?935:1000,371,17,PAPER);
  if(toast.equals("存档已删除，可撤销") && overlay.isEmpty())textButton("undo","撤销",1115,355,105,34,0xffD8E8BD);
 }
 boolean hover=false;for(Control c:controls)if(c.enabled&&hitUI(c.x,c.y,c.w,c.h)){hover=true;break;}
 cursor(hover?HAND:ARROW);
}

void drawDashboard(){
 tag("EMOSYNC / DESKTOP COMPANION",65,34,MUTED);
 java.time.LocalDateTime now=java.time.LocalDateTime.now();
 String[] weekdays={"周一","周二","周三","周四","周五","周六","周日"};
 textUI(now.format(java.time.format.DateTimeFormatter.ofPattern("yyyy. MM. dd"))+"  /  "+weekdays[now.getDayOfWeek().getValue()-1],65,80,29,INK);
 textFont(numbers);textSize(107);fill(INK);textAlign(LEFT,CENTER);text(now.format(java.time.format.DateTimeFormatter.ofPattern("HH:mm")),62,155);
 textUI("今天，也记得照顾自己。",69,218,20,MUTED);
 dashboardRow("routine","DAILY ROUTINE","日常安排",store.completed()+" / 3",64,251,466,48,MINT);
 dashboardRow("emotion","EMOTION","此刻心情",store.mood.equals("未记录")?"记录一下":store.mood,64,317,466,48,0xffF0DFC9);
 drawRobot(638,33,724,334,false);
 tag("A LITTLE CARE, EVERY DAY",1457,47,MUTED);
 functionTile("drink","DRINK TIME","喝水休息",store.water+" 杯",1457,84,false);
 functionTile("light","LIGHT","屏幕氛围",store.warm?"暖光":"清光",1687,84,false);
 functionTile("sound","SOUND","声音",store.volume==0?"关闭":nf(round(store.volume*100),1)+"%",1457,184,false);
 functionTile("games","GAME TIME","动一动","开始",1687,184,true);
 functionTile("gentle","WEAK HINT","轻柔提醒",store.strongReminder?"":"已选",1457,284,false);
 functionTile("strong","STRONG HINT","明显提醒",store.strongReminder?"已选":"",1687,284,false);
 iconBtn("power","power",1910,17,50,false);
}
void dashboardRow(String id,String en,String zh,String value,float x,float y,float w,float h,int bg){
 noStroke();fill(hitUI(x,y,w,h)?lerpColor(bg,INK,0.04f):bg);rect(x,y,w,h,17);
 tag(en,x+19,y+23,INK);textUI(zh,x+180,y+23,17,MUTED);
 textAlign(RIGHT,CENTER);fill(INK);textFont(ui);textSize(17);text(value,x+w-21,y+23);
 register(id,x,y,w,h,true);focusOutline(id,x,y,w,h,17);
}
void functionTile(String id,String en,String zh,String value,float x,float y,boolean primary){
 boolean on=(id.equals("gentle")&&!store.strongReminder)||(id.equals("strong")&&store.strongReminder);
 int bg=primary?GREEN:on?MINT:PAPER;
 card(x,y,188,76,hitUI(x,y,188,76)?lerpColor(bg,primary?PAPER:GREEN,0.05f):bg,24);
 tag(en,x+20,y+21,primary?0xffDFE8D8:MUTED);textUI(zh,x+20,y+48,22,primary?PAPER:INK);
 if(value.length()>0){textFont(ui);textSize(14);textAlign(RIGHT,CENTER);fill(primary?0xffE3ECCC:MUTED);text(value,x+170,y+48);}
 register(id,x,y,188,76,true);focusOutline(id,x,y,188,76,24);
}
void drawRobot(float x,float y,float w,float h,boolean sleeping){
 int faceBg=store.warm?DARK:0xff273F44;
 noStroke();fill(INK,12);rect(x-6,y-6,w+12,h+12,32);
 fill(faceBg);rect(x,y,w,h,27);
 stroke(255,16);strokeWeight(1);noFill();rect(x+9,y+9,w-18,h-18,22);noStroke();
 for(int dx=26;dx<w-20;dx+=22)for(int dy=26;dy<h-18;dy+=22){fill(255,6);rect(x+dx,y+dy,2,2);}
 tag("ROBOT FACE",x+26,y+30,0xff9CB7A0);
 pill(sleeping?"休息中":"陪伴中",x+w-115,y+18,88,0xff3B5444,0xffDEEDD2);
 float bob=sin(millis()*0.0016f)*3;
 boolean blink=(millis()%5100)<170;
 float eyeH=sleeping||blink?8:store.mood.equals("有点累")?28:76;
 int glow=lerpColor(faceBg,store.warm?0xffE4EDC5:0xffC8E8E9,0.25f+store.brightness*0.75f);
 fill(glow);
 float ey=y+133+bob;
 rect(x+213,ey+(76-eyeH)/2,43,eyeH,7);rect(x+469,ey+(76-eyeH)/2,43,eyeH,7);
 if(!sleeping){
  fill(0xffA7C9A2,130*store.brightness);rect(x+175,ey+68,25,8,3);rect(x+525,ey+68,25,8,3);
  fill(glow);rect(x+327,y+205+bob,12,8);rect(x+339,y+213+bob,47,8);rect(x+386,y+205+bob,12,8);
 }
 centered(sleeping?"不用着急，我在这里。":store.mood.equals("有点累")?"累了，就一起休息一会儿。":"准备好，和我一起动一动吗？",x+w/2,y+h-38,20,0xffC0D1B9);
}
void drawStandby(){
 fill(0xffE9EBE2);rect(0,0,UI_W,UI_H);drawRobot(638,33,724,334,true);
 tag("EMOSYNC / REST MODE",65,54,MUTED);strong("好好休息。",65,134,42,INK);
 textUI("点击唤醒，回到你的日常。",65,195,22,MUTED);
 btn("wake","唤醒伙伴",1480,154,360,65,true,true);
}

void selectionHeader(){
 centered("HI, IT'S BREAK TIME. LET'S PLAY!",1000,28,26,INK);
 tag("MOVE A LITTLE / FEEL A LITTLE BETTER",62,37,MUTED);
 iconBtn("back","back",61,332,50,false);
 textUI("返回首页",127,357,18,MUTED);
}
void drawSelection(boolean detail){
 selectionHeader();
 carouselNudge=lerp(carouselNudge,0,0.18f);
 drawGameCard((selectedGame+2)%4,290,150,300,138,false,false);
 drawGameCard((selectedGame+2)%4,1409,150,300,138,false,false);
 drawGameCard((selectedGame+3)%4,440,112,469,216,false,false);
 drawGameCard((selectedGame+1)%4,1093,112,469,216,false,false);
 if(detail)drawDetailCard();else drawGameCard(selectedGame,675+carouselNudge,67,650,300,true,true);
 iconBtn("previous","arrow",14,190,56,true);iconBtn("next","arrow",1930,190,56,false);
 for(int i=0;i<4;i++){noStroke();fill(i==selectedGame?GREEN:LINE);rect(963+i*21,381,i==selectedGame?14:7,6,3);}
 if(!detail)textUI("左右切换 · 点击中央卡片了解玩法",1470,357,18,MUTED);
}
void drawGameCard(int index,float x,float y,float w,float h,boolean front,boolean interactive){
 int bg=index==0?0xffD8E9DE:index==1?0xffEBDEC9:index==2?0xffDCE3EB:0xffE8E5D1;
 card(x,y,w,h,PAPER,16);
 pushMatrix();translate(x,y);scale(w/650,h/300);
 noStroke();fill(bg);rect(0,0,650,185,16,16,0,0);
 drawCardArt(index,0,0,650,185);
 if(front){
  pill(index==0?"摄像头体感":"玩法待定义",22,17,120,PAPER,INK);
  strong(gameNames[index],25,221,35,INK);
  textUI(gameTypes[index]+(index==0?"  ·  20 层云端冒险":"  ·  界面预览"),26,268,19,MUTED);
  tag(gameEnglish[index],406,225,MUTED);
  if(index==0)pill("进入探索",501,252,123,MINT,GREEN);
 }else{
  strong(gameNames[index],28,222,32,INK);textUI(gameTypes[index],28,268,22,MUTED);
 }
 popMatrix();
 if(!front){noStroke();fill(CREAM,120);rect(x,y,w,h,16);}
 if(interactive){register("detail",x,y,w,h,true);focusOutline("detail",x,y,w,h,16);}
}
void drawCardArt(int index,float x,float y,float w,float h){
 pushMatrix();translate(x,y);scale(w/650,h/185);noStroke();
 if(index==0){
  fill(0xffC7E1DF);rect(0,0,650,185,16,16,0,0);
  fill(0xffF4F5E6);rect(40,44,96,22);rect(59,30,49,20);rect(451,35,111,23);rect(469,21,56,24);
  fill(0xffF7EABD);rect(554,78,32,32);rect(546,87,48,15);
  for(int i=0;i<4;i++){
   float px=111+i*112,py=153-i*28;
   fill(0xffCCAA80);rect(px,py,134,17);fill(0xffA7C289);rect(px,py-4,134,6);
   fill(0xffEABE5D);rect(px+60,py-30,11,17);fill(0xffFFEBAC);rect(px+61,py-29,4,11);
  }
  fill(0xffD18F6A);rect(144,109,18,8);fill(0xffF1D3A5);rect(147,117,12,11);fill(0xff5F918B);rect(145,128,17,18);fill(INK);rect(144,146,7,6);rect(158,146,7,6);
 }else{
  fill(index==1?0xffD9CFB4:index==2?0xffCBD5E1:0xffDBDDC6);
  for(int i=0;i<6;i++){rect(60+i*100,125-(i%3)*25,90,60);}
  fill(PAPER,160);for(int i=0;i<5;i++)rect(50+i*123,44+(i%2)*23,39,9);
  fill(index==1?0xffB18D60:index==2?0xff899AB8:0xff9FAB82);
  rect(300,54,44,44,8);rect(285,101,76,51,12);rect(270,111,16,35,5);rect(362,111,16,35,5);
 }
 popMatrix();
}
void drawDetailCard(){
 card(675,67,650,300,PAPER,16);drawCardArt(selectedGame,675,67,650,87);
 iconBtn("select","back",692,161,34,false);
 strong(gameNames[selectedGame],699,210,31,INK);
 tag(gameEnglish[selectedGame],1075,204,MUTED);
 if(selectedGame==0){
  textUI("抬抬头，去云端。",700,247,21,INK);
  textUI("左转左移，右转右移，抬头跳跃。",700,280,18,MUTED);
  textUI("收集金币，踩上台阶，点亮检查点。",700,309,18,MUTED);
  tag("头颈活动  /  单人  /  摄像头",700,345,MUTED);
  btn("start","START  开始",1100,306,201,43,true,true);
 }else{
  textUI("一个新的运动时刻，正在酝酿。",700,254,21,INK);
  textUI("已完成卡片与介绍界面，具体玩法待定义。",700,294,18,MUTED);
  btn("unavailable","暂未开放",1100,306,201,43,false,false);
 }
}
