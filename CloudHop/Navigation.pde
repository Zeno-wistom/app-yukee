void go(String destination){screen=destination;focusId="";controls.clear();leftHeld=rightHeld=jumpQueued=false;transitionStarted=millis();}
void notifyUser(String message){toast=message;toastUntil=millis()+6500;}
void openOverlay(String name){overlay=name;controls.clear();focusId="";}
void openCamera(){
 if(screen.equals("play")){saveSession();go("pause");}
 if(bridge!=null&&bridge.server!=null)link("http://127.0.0.1:"+bridge.port+"/");
 else notifyUser("摄像头服务未启动，请重新打开应用。");
}
void saveSession(){
 if(store==null||game==null||captureMode||!inSession||activeSlot<0)return;
 if(!store.saveSlot(activeSlot,game))notifyUser("保存失败，请确认游戏文件夹可写。");
}
void newSession(int index){
 game.reset();activeSlot=index;inSession=true;keyboardMode=false;store.playedToday=true;
 saveSession();overlay="";go("calibrate");
}
void loadSession(int index){
 JSONObject saved=store.slots[index];
 if(!store.validSnapshot(saved)){notifyUser("这个存档无法读取，请选择其他记录。");return;}
 game.reset();store.restore(saved,game);activeSlot=index;inSession=true;keyboardMode=false;store.playedToday=true;
 store.persist();go(game.won?"win":"calibrate");
}
void beginPlay(boolean keys){
 if(!inSession){notifyUser("请先选择新游戏或一个存档。");return;}
 if(!keys&&!bridge.ready()){go("calibrate");return;}
 keyboardMode=keys;previousJump=bridge.jumpId;countdownAt=millis();go("countdown");
}
void requestNew(){
 saveSession();int empty=store.emptySlot();
 if(empty<0)openOverlay("replace-list");else newSession(empty);
}
void requestQuit(String target){
 if(!inSession){go(target);return;}
 saveSession();quitReturn=screen.equals("pause")?"pause":"play";quitTarget=target;go("quit");
}
void finishSession(String destination){saveSession();inSession=false;activeSlot=-1;go(destination);}

void action(String id){
 if(audio!=null&&store!=null&&!id.startsWith("volume:"))audio.play(610,28,store.volume*0.5f);
 if(id.startsWith("load:")){loadSession(Integer.parseInt(id.substring(5)));return;}
 if(id.startsWith("delete:")||id.startsWith("replace:")){
  pendingSlot=Integer.parseInt(id.substring(id.indexOf(':')+1));
  if(pendingSlot>=0&&pendingSlot<3&&store.slots[pendingSlot]!=null)openOverlay(id.startsWith("delete:")?"delete":"replace");return;
 }
 if(id.startsWith("mood:")){store.mood=id.substring(5);store.persist();overlay="";notifyUser("记下来了，今天的感受也很重要。");return;}
 if(id.startsWith("interval:")){store.reminderMinutes=Integer.parseInt(id.substring(9));store.resetReminder();store.persist();return;}
 if(id.startsWith("volume:")){store.volume=Integer.parseInt(id.substring(7))*0.25f;store.persist();if(audio!=null)audio.play(740,90,store.volume);return;}
 if(id.startsWith("brightness:")){store.brightness=Integer.parseInt(id.substring(11))/3.0f;store.persist();return;}
 switch(id){
 case "games":overlay="";go("select");break;
 case "previous":selectedGame=(selectedGame+3)%4;carouselNudge=-17;go("select");break;
 case "next":selectedGame=(selectedGame+1)%4;carouselNudge=17;go("select");break;
 case "detail":go("detail");break;
 case "select":go("select");break;
 case "start":if(selectedGame==0)go("choice");break;
 case "choice":saveSession();go("choice");break;
 case "records":go("records");break;
 case "new":case "again":requestNew();break;
 case "camera":openCamera();break;
 case "face-play":beginPlay(false);break;
 case "keyboard":beginPlay(true);break;
 case "pause":if(screen.equals("play")){saveSession();go("pause");}break;
 case "resume":if(inSession)beginPlay(keyboardMode);break;
 case "quit-detail":requestQuit("detail");break;
 case "quit-select":requestQuit("select");break;
 case "cancel-quit":if(quitReturn.equals("pause"))go("pause");else beginPlay(keyboardMode);break;
 case "confirm-quit":finishSession(quitTarget);break;
 case "finish-home":finishSession("dashboard");break;
 case "back":backAction();break;
 case "drink":case "emotion":case "routine":case "sound":case "light":case "power":openOverlay(id);break;
 case "close-overlay":overlay="";controls.clear();break;
 case "warm":store.warm=true;store.persist();break;
 case "cool":store.warm=false;store.persist();break;
 case "gentle":store.strongReminder=false;store.persist();notifyUser("轻柔提醒：到时显示底部提示。");break;
 case "strong":store.strongReminder=true;store.persist();notifyUser("明显提醒：到时弹出喝水提示。");break;
 case "test-sound":if(store.volume==0)notifyUser("当前已静音，请先选择音量。");else if(audio!=null)audio.play(880,180,store.volume);break;
 case "water":store.water++;store.resetReminder();store.persist();overlay="";notifyUser("已记录一杯水，继续照顾好自己。");break;
 case "standby":overlay="";go("standby");break;
 case "wake":go("dashboard");break;
 case "exit-app":saveSession();exit();break;
 case "cancel-slot":if(overlay.equals("replace"))openOverlay("replace-list");else{overlay="";controls.clear();}break;
 case "confirm-delete":
  if(store.deleteSlot(pendingSlot)){if(activeSlot==pendingSlot){activeSlot=-1;inSession=false;}overlay="";go("records");notifyUser("存档已删除，可撤销");}
  else notifyUser("删除未保存，原记录仍然保留。");break;
 case "confirm-replace":
  if(store.backupSlot(pendingSlot)){overlay="";newSession(pendingSlot);}else notifyUser("备份失败，原记录仍然保留。");break;
 case "undo":if(store.undoDelete()){notifyUser("存档已恢复。");}else notifyUser("该位置已有记录，未覆盖现有存档。");break;
 }
}
void backAction(){
 if(!overlay.isEmpty()){if(overlay.equals("replace"))openOverlay("replace-list");else{overlay="";controls.clear();}return;}
 if(screen.equals("play")){action("pause");return;}
 if(screen.equals("pause")){action("resume");return;}
 if(screen.equals("quit")){action("cancel-quit");return;}
 if(screen.equals("detail")){go("select");return;}
 if(screen.equals("select")){go("dashboard");return;}
 if(screen.equals("records")||screen.equals("calibrate")||screen.equals("lost")){saveSession();go("choice");return;}
 if(screen.equals("choice")){go("detail");return;}
 if(screen.equals("win")){finishSession("dashboard");return;}
 if(screen.equals("standby"))go("dashboard");
}
void checkReminder(){
 if(store==null||captureMode)return;
 store.rollDay();
 if(store.reminderMinutes<=0||System.currentTimeMillis()<store.nextReminder)return;
 if(!overlay.isEmpty()||screen.equals("standby"))return;
 store.resetReminder();
 if(store.strongReminder){
  if(screen.equals("play")||screen.equals("countdown")){saveSession();go("pause");}
  openOverlay("reminder");
 }else notifyUser("喝口水、看看远处，给自己一个小休息。");
 if(audio!=null)audio.play(523,160,store.volume);
}
void configureCapture(String scene){
 selectedGame=0;screen=scene;
 if(scene.equals("home"))screen="dashboard";
 if(scene.equals("records")||scene.equals("choice")){
  for(int i=0;i<3;i++){
   game.highest=(i+1)*5;game.checkpointLevel=(i+1)*5;game.collected=(i+1)*8;
   for(int n=0;n<40;n++)game.coins.get(n).taken=n<game.collected;
   JSONObject sample=store.snapshot(game);sample.setString("updated","2026.09.05  14:"+(20+i*7));store.slots[i]=sample;
  }game.reset();
 }
 if(scene.equals("play")||scene.equals("pause")||scene.equals("quit")||scene.equals("win")){
  keyboardMode=true;inSession=true;activeSlot=0;
  if(scene.equals("win")){game.highest=20;game.collected=36;game.won=true;}
 }
 if(scene.equals("emotion")||scene.equals("routine")||scene.equals("drink")||scene.equals("sound")||scene.equals("light")||scene.equals("power")){screen="dashboard";overlay=scene;}
}
