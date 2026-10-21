void drawGameFlow(){
 image(world,0,0,UI_W,UI_H);
 if(screen.equals("play")){drawPlayHUD();return;}
 if(screen.equals("countdown")){
  drawPlayHUD();
  noStroke();fill(INK,70);rect(0,0,UI_W,UI_H);
  centered(str(max(1,3-(millis()-countdownAt)/1000)),1000,177,104,PAPER);
  centered("准备好，慢慢向上。",1000,277,23,PAPER);return;
 }
 controls.clear();
 if(screen.equals("choice")){
  modalBase("接着上一次，还是重新出发？","A RECORD THERE");
  centered(store.slotCount()>0?"已为你保留 "+store.slotCount()+" 段冒险，随时可以继续。":"还没有存档，开启你的第一段云端冒险。",1000,159,21,MUTED);
  centered("20 层台阶   ·   40 枚金币   ·   每 5 层一个检查点",1000,203,19,INK);
  btn("records","CONTINUE  继续",717,258,254,53,false,true);
  btn("new","NEW GAME  新游戏",1020,258,263,53,true,true);
  outsideBack("detail","返回游戏介绍");
 }else if(screen.equals("records"))drawRecords(false);
 else if(screen.equals("calibrate")||screen.equals("lost"))drawCalibration();
 else if(screen.equals("pause")){
  modalBase("在云上歇一会儿。","PAUSE GAME");
  centered("金币 "+game.collected+" 枚   /   第 "+game.highest+" 层   /   已自动保存",1000,162,22,INK);
  centered("准备好了，就继续刚才的冒险。",1000,203,20,MUTED);
  btn("quit-select","QUIT  退出",717,258,254,53,false,true);
  btn("resume","BACK  继续",1020,258,263,53,true,true);
  textButton("camera","摄像头设置",1450,326,225,44,GREEN);
 }else if(screen.equals("quit")){
  modalBase("要离开这段冒险吗？","QUIT GAME");
  centered("当前进度已保存，下次可以从这里继续。",1000,167,22,INK);
  centered(quitTarget.equals("select")?"确认后返回游戏选择。":"确认后返回游戏介绍。",1000,207,19,MUTED);
  btn("cancel-quit","NO  留下来",717,258,254,53,false,true);
  btn("confirm-quit","YES  保存并退出",1020,258,263,53,true,true);
 }else if(screen.equals("win")){
  modalBase("你把云朵踩在脚下！","CLOUD EXPLORER / 云端探险家");
  centered("金币 "+game.collected+" 枚   ·   总得分 "+(game.collected*10+100),1000,166,27,INK);
  centered("20 层全部完成，获得 100 分登顶奖励。",1000,209,20,MUTED);
  btn("finish-home","返回首页",717,258,254,53,false,true);
  btn("again","再玩一次",1020,258,263,53,true,true);
 }
}
void drawPlayHUD(){
 noStroke();fill(PAPER);rect(0,0,UI_W,57);rect(0,365,UI_W,35);
 iconBtn("quit-detail","back",59,6,46,false);
 strong("云端拾光",130,28,25,INK);tag("CLOUD HOP",269,30,MUTED);
 textUI("金币  "+nf(game.collected,2)+" / 40",481,28,22,INK);
 textUI("高度  "+game.highest+" / 20",720,28,22,INK);
 fill(LINE);rect(904,23,236,8,4);fill(GREEN);rect(904,23,236*game.highest/20.0f,8,4);
 textUI("最高 "+game.best+" 枚",1187,28,20,MUTED);
 pill(keyboardMode?"键盘模式":bridge.ready()?"头部控制已连接":"等待摄像头",1512,14,204,MINT,GREEN);
 iconBtn("pause","pause",1870,6,46,false);
 textUI(keyboardMode?"← → / A D  移动      空格 / ↑  跳跃      P  暂停":"左转 ← 移动      右转 → 移动      抬头 ↑ 跳跃      正脸停止      P 暂停",61,381,18,INK);
 textUI(game.noticeTime>0?game.notice:"每 5 层点亮检查点，慢慢来。",1430,381,18,MUTED);
}
void modalBase(String title,String en){
 noStroke();fill(INK,90);rect(0,0,UI_W,UI_H);
 card(675,50,650,300,PAPER,28);tag(en,708,82,MUTED);
 strong(title,708,118,28,INK);lineUI(708,139,584);
}
void outsideBack(String id,String title){card(61,17,306,50,PAPER,15);iconBtn(id,"back",61,17,50,false);textUI(title,129,41,20,INK);}
void drawRecords(boolean replacing){
 modalBase(replacing?"选择一个存档位置":"你的冒险，都在这里。",replacing?"SAVE SLOTS / 3 个位置已满":"RECORD THERE / 本机存档");
 if(store.slotCount()==0){
  centered("这里还没有冒险记录。",1000,193,23,INK);
  centered("开始新游戏后，系统会自动保存进度。",1000,230,19,MUTED);
  btn("new","开启第一段冒险",818,271,364,47,true,true);
 }else for(int i=0;i<3;i++){
  JSONObject slot=store.slots[i];float y=152+i*61;
  noStroke();fill(slot==null?CREAM:0xffEDF1E6);rect(698,y,604,53,11);
  if(slot==null){textUI("空存档位置",717,y+25,19,MUTED);continue;}
  strong("冒险 "+nf(i+1,2)+"  ·  "+(slot.getBoolean("won",false)?"已登顶":"第 "+slot.getInt("highest",0)+" 层"),717,y+15,18,INK);
  textUI(slot.getString("updated","")+"  /  "+slot.getInt("collected",0)+" 枚金币",717,y+37,15,MUTED);
  if(replacing)btn("replace:"+i,"覆盖",1190,y+8,96,37,false,true);
  else{
   btn("load:"+i,slot.getBoolean("won",false)?"查看":"开始",1100,y+8,86,37,true,true);
   textButton("delete:"+i,"删除",1195,y+8,88,37,RED);
  }
 }
 if(!replacing)outsideBack("choice","返回新建 / 继续");
}
void drawCalibration(){
 boolean ready=bridge.ready();
 modalBase(screen.equals("lost")?"等你回到镜头前。":"让动作成为方向。","CAMERA / 头部动作校准");
 String state=ready?"校准已完成，可以开始冒险。":bridge.tracked?"已检测到人脸，请按摄像头页面提示完成校准。":"打开摄像头页面，允许摄像头并按提示校准。";
 centered(state,1000,161,19,ready?GREEN:MUTED);
 pill("左转  ←",711,190,167,MINT,INK);pill("右转  →",916,190,167,MINT,INK);pill("抬头  ↑",1121,190,167,MINT,INK);
 btn("camera","开启 / 校准摄像头",712,242,277,49,false,true);
 btn("face-play",screen.equals("lost")?"继续冒险":"开始冒险",1011,242,277,49,true,ready);
 textButton("keyboard","暂用键盘体验",908,302,184,35,MUTED);
 outsideBack("choice","返回新建 / 继续");
 noStroke();fill(PAPER,230);rect(61,347,510,36,12);textUI("让摄像头页面与游戏并排显示，保持识别。",78,365,18,INK);
}

void drawOverlay(){
 if(overlay.equals("replace-list")){drawRecords(true);textButton("close-overlay","取消",1227,63,76,32,INK);return;}
 if(overlay.equals("delete")||overlay.equals("replace")){
  boolean deleting=overlay.equals("delete");
  modalBase(deleting?"删除这段冒险记录？":"用新冒险覆盖这个位置？",deleting?"DELETE RECORD":"REPLACE RECORD");
  centered("冒险 "+nf(pendingSlot+1,2)+"  ·  第 "+store.slots[pendingSlot].getInt("highest",0)+" 层",1000,173,23,INK);
  centered(deleting?"删除后可通过底部提示立即撤销。":"原记录会被保留在本机备份中。",1000,210,18,MUTED);
  btn("cancel-slot","取消",716,266,259,50,false,true);
  btn(deleting?"confirm-delete":"confirm-replace",deleting?"确认删除":"确认覆盖",1025,266,259,50,true,true);return;
 }
 if(overlay.equals("power")){
  modalBase("今天也辛苦啦。","REST / 休息一下");
  centered("休息模式保留日常设置，点击即可唤醒。",1000,168,21,MUTED);
  centered("关闭应用会保存已有的游戏进度。",1000,211,20,MUTED);
  btn("standby","休息模式",712,265,278,51,true,true);btn("exit-app","关闭应用",1010,265,278,51,false,true);
 }else if(overlay.equals("emotion")){
  modalBase("此刻，你感觉怎么样？","EMOTION / 记录心情");
  centered("选一个最接近的感受，让伙伴陪你调整节奏。",1000,170,20,MUTED);
  for(int i=0;i<3;i++){String mood=new String[]{"很放松","很专注","有点累"}[i];btn("mood:"+mood,mood,712+i*199,217,179,60,store.mood.equals(mood),true);}
  centered("仅记录你主动选择的心情，不通过摄像头判断。",1000,313,17,MUTED);
 }else if(overlay.equals("routine")){
  modalBase("把照顾自己，放进日常。","DAILY ROUTINE / 今日安排");
  routineItem("drink","喝杯水",store.water>0,153,store.water+" 杯已记录");
  routineItem("games","动一动",store.playedToday,214,store.playedToday?"今天已活动":"开始一段小冒险");
  routineItem("emotion","问问自己的心情",!store.mood.equals("未记录"),275,store.mood);
 }else if(overlay.equals("drink")||overlay.equals("reminder")){
  modalBase(overlay.equals("reminder")?"停一下，喝口水吧。":"给自己，一杯水的时间。","DRINK TIME / 喝水休息");
  strong("今天 "+store.water+" 杯",711,174,29,INK);
  textUI("记录一次喝水，重新开始提醒计时。",711,215,19,MUTED);
  btn("water","我喝过水了 +1",1060,166,229,53,true,true);
  textUI("提醒间隔",711,267,18,MUTED);
  int[] minutes={0,30,45,60};
  for(int i=0;i<4;i++)btn("interval:"+minutes[i],minutes[i]==0?"关闭":minutes[i]+" 分钟",821+i*119,244,107,43,store.reminderMinutes==minutes[i],true);
  textUI("仅在应用运行时提醒，可随时关闭。",711,317,16,MUTED);
 }else if(overlay.equals("sound")){
  modalBase("一点声音，刚刚好。","SOUND / 界面与游戏音效");
  centered("点击、金币与提醒音效",1000,172,22,INK);
  for(int i=0;i<=4;i++)btn("volume:"+i,i==0?"静音":i*25+"%",710+i*119,212,105,47,abs(store.volume-i*0.25f)<0.01f,true);
  textButton("test-sound","试听音效",898,282,204,44,GREEN);
 }else if(overlay.equals("light")){
  modalBase("让伙伴的光，温柔一点。","LIGHT / 屏幕氛围");
  textUI("表情亮度",711,169,20,INK);
  for(int i=1;i<=3;i++)btn("brightness:"+i,new String[]{"柔和","适中","明亮"}[i-1],868+(i-1)*143,151,125,45,abs(store.brightness-i/3.0f)<0.08f,true);
  textUI("光色",711,239,20,INK);
  btn("warm","暖光",868,216,197,47,store.warm,true);btn("cool","清光",1090,216,189,47,!store.warm,true);
  textUI("调节中央表情的屏幕效果。",711,310,18,MUTED);
 }
 textButton("close-overlay","完成",1227,63,76,32,INK);
}
void routineItem(String id,String title,boolean done,float y,String detail){
 noStroke();fill(CREAM);rect(706,y,586,52,12);
 pill(done?"完成":"待办",717,y+11,72,done?MINT:PEACH,INK);
 textUI(title,808,y+25,20,INK);textUI(detail,1050,y+25,16,MUTED);
 register(id,706,y,586,52,true);focusOutline(id,706,y,586,52,12);
}
