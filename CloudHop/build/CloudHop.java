import processing.core.*;
import processing.data.*;
import java.util.*;
import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpExchange;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
public class CloudHop extends PApplet {

// Processing desktop implementation of the 2000 x 400 Figma prototype.
final int W=1000, H=200;
final float UI_W=2000, UI_H=400;
PGraphics world;
PFont ui, bold, numbers;
Game game;
CameraBridge bridge;
LocalStore store;
AudioCue audio;
boolean keyboardMode=false, leftHeld, rightHeld, jumpQueued, inSession=false;
String screen="dashboard", overlay="", returnScreen="", quitTarget="detail", quitReturn="play";
float lastTick, autosaveClock, transitionStarted;
int previousJump, selectedGame=0, activeSlot=-1, pendingSlot=-1, countdownAt;
boolean captureMode=false;
String toast="";
int toastUntil=0;
String[] sprite={
 "....HHHHHH......", "...HHHHHHHH.....", "..HHHHHHHHHH....",
 "....DDSSSS......", "...DSSSSDS......", "...DSSSSSSS.....",
 "....SSSSSS......", ".....TTTT.......", "...TTTTTTTT.....",
 "..SSTTTTTTSS....", "..SSBBBBBBSS....", "....BBYYBB......",
 "....BBBBBB......", "....BB..BB......", "...DDD..DDD.....", "..DDDD..DDDD...."
};

public void settings(){size(1600,320);smooth(2);}
public void setup(){
 surface.setTitle("EmoSync · 云端拾光");surface.setResizable(true);frameRate(60);
 world=createGraphics(W,H);world.noSmooth();
 ui=createFont("Microsoft YaHei",24,true);bold=createFont("Microsoft YaHei Bold",36,true);
 numbers=createFont("Bahnschrift",96,true);
 captureMode=System.getProperty("cloudhop.capture")!=null;
 store=new LocalStore(java.nio.file.Paths.get(sketchPath("")),captureMode);
 audio=new AudioCue();loadUIAssets();game=new Game();bridge=new CameraBridge();bridge.start();
 lastTick=millis();
 if(captureMode){
  String scene=System.getProperty("cloudhop.scene","dashboard");configureCapture(scene);
  try{
   java.net.http.HttpResponse<String> probe=java.net.http.HttpClient.newHttpClient().send(
    java.net.http.HttpRequest.newBuilder(java.net.URI.create("http://127.0.0.1:"+bridge.port+"/")).build(),java.net.http.HttpResponse.BodyHandlers.ofString());
   if(probe.statusCode()!=200)throw new RuntimeException("Camera page HTTP "+probe.statusCode());
   println("Live camera page check: HTTP 200");
  }catch(Exception e){throw new RuntimeException(e);}
 }
}
public void draw(){
 float dt=min((millis()-lastTick)/1000.0f,0.05f);lastTick=millis();
 if(screen.equals("countdown") && overlay.isEmpty()){
  previousJump=bridge.jumpId;
  if(!keyboardMode && !bridge.ready())go("calibrate");
  else if(millis()-countdownAt>=3000)go("play");
 }
 if(screen.equals("play") && overlay.isEmpty()){
  if(!keyboardMode && !bridge.ready()){saveSession();go("lost");}
  else{
   int dir=keyboardMode?(rightHeld?1:0)-(leftHeld?1:0):bridge.direction;
   boolean jumped=bridge.jumpId!=previousJump;previousJump=bridge.jumpId;
   game.update(dt,dir,keyboardMode?jumpQueued:jumped);jumpQueued=false;
   autosaveClock+=dt;
   if(autosaveClock>2){saveSession();autosaveClock=0;}
   if(game.won){saveSession();go("win");if(audio!=null)audio.play(880,160,store.volume);}
  }
 }else{previousJump=bridge.jumpId;jumpQueued=false;}
 checkReminder();
 renderWorld();
 background(241,240,231);
 float scale=min(width/UI_W,height/UI_H);float ox=(width-UI_W*scale)/2,oy=(height-UI_H*scale)/2;
 pushMatrix();translate(ox,oy);scale(scale);drawApp();popMatrix();
 if(captureMode && frameCount==16){save(System.getProperty("cloudhop.capture"));exit();}
}
void renderWorld(){
 world.beginDraw();drawLandscape();world.pushMatrix();world.translate(0,-round(game.cameraY));
 for(Platform p:game.platforms)drawPlatform(p);
 for(Coin c:game.coins)if(!c.taken)drawCoin(c.x,c.y,false);
 drawGoal();drawPlayer(game.x,game.y,game.facing);
 for(Spark s:game.sparks){world.noStroke();world.fill(s.tint,255*s.life);world.rect(round(s.x),round(s.y),3,3);}
 world.popMatrix();world.endDraw();
}
public void mousePressed(){
 for(int i=controls.size()-1;i>=0;i--){Control c=controls.get(i);if(c.enabled && hitUI(c.x,c.y,c.w,c.h)){action(c.id);return;}}
}
public void keyPressed(){
 if(key==ESC){key=0;backAction();return;}
 if(key==TAB){
  int current=-1;for(int i=0;i<controls.size();i++)if(controls.get(i).id.equals(focusId))current=i;
  for(int offset=1;offset<=controls.size();offset++){Control c=controls.get((current+offset)%controls.size());if(c.enabled){focusId=c.id;break;}}return;
 }
 if((key==ENTER||key==RETURN)&&!focusId.isEmpty()){String selected=focusId;action(selected);return;}
 if(!overlay.isEmpty())return;
 if(screen.equals("select")){
  if(keyCode==LEFT)action("previous");if(keyCode==RIGHT)action("next");
  if(key==ENTER || key==RETURN)action("detail");return;
 }
 if(screen.equals("dashboard")){if(key==ENTER || key==RETURN)action("games");return;}
 if((key=='p'||key=='P') && screen.equals("play")){action("pause");return;}
 if((key=='p'||key=='P') && screen.equals("pause")){action("resume");return;}
 if((key=='c'||key=='C') && (screen.equals("calibrate")||screen.equals("lost")||screen.equals("pause"))){openCamera();return;}
 if((key=='k'||key=='K') && (screen.equals("calibrate")||screen.equals("lost"))){action("keyboard");return;}
 if(screen.equals("play")){
  if(keyCode==LEFT || key=='a'||key=='A')leftHeld=true;
  if(keyCode==RIGHT || key=='d'||key=='D')rightHeld=true;
  if(key==' '||keyCode==UP)jumpQueued=true;
 }
}
public void keyReleased(){
 if(keyCode==LEFT||key=='a'||key=='A')leftHeld=false;
 if(keyCode==RIGHT||key=='d'||key=='D')rightHeld=false;
}
public void focusLost(){leftHeld=rightHeld=jumpQueued=false;if(screen.equals("play")){saveSession();go("pause");}}
public void dispose(){saveSession();if(bridge!=null)bridge.stop();if(audio!=null)audio.stop();super.dispose();}

void drawLandscape() {
  for (int y = 0; y < H; y += 4) {
    world.noStroke(); world.fill(lerpColor(color(166, 213, 233), color(237, 245, 221), y / (float)H));
    world.rect(0, y, W, 4);
  }
  world.fill(255, 244, 194); world.rect(763, 49, 30, 30); world.rect(755, 57, 46, 14);
  for (int i = 0; i < 9; i++) {
    float cx = ((i * 143 + millis() * 0.002f * (1 + i % 3)) % 1120) - 80;
    float cy = 30 + (i * 31 % 100) - game.cameraY * 0.055f;
    cy = 30 + ((cy - 30) % 115 + 115) % 115;
    cloud(cx, cy, 1 + i % 2);
  }
  world.noStroke();
  for (int i = 0; i < 13; i++) {
    int xx = i * 90 - 30;
    float yy = H - 45 + 20 * sin(i * 1.8f) - game.cameraY * 0.018f;
    world.fill(191, 218, 199); world.rect(xx, yy, 95, H); world.rect(xx + 16, yy - 16, 65, 22);
    world.fill(173, 205, 188); world.rect(xx + 48, yy + 20, 60, H);
  }
}

void cloud(float x, float y, int size) {
  world.pushMatrix(); world.translate(round(x), round(y)); world.scale(size);
  world.noStroke(); world.fill(244, 250, 239, 220);
  world.rect(0, 8, 47, 10); world.rect(7, 2, 28, 15); world.rect(15, -3, 13, 8);
  world.fill(218, 236, 231, 210); world.rect(6, 18, 36, 3);
  world.popMatrix();
}

void drawPlatform(Platform p) {
  if (p.y - game.cameraY < -35 || p.y - game.cameraY > H + 20) return;
  world.noStroke();
  world.fill(111, 148, 129, 50); world.rect(p.x + 4, p.y + 8, p.w, 22);
  world.fill(176, 130, 100); world.rect(p.x, p.y + 5, p.w, 20);
  world.fill(209, 167, 123); world.rect(p.x, p.y + 7, p.w, 11);
  world.fill(145, 184, 112); world.rect(p.x, p.y, p.w, 6);
  world.fill(192, 221, 137); world.rect(p.x, p.y, p.w, 2);
  for (int xx = 6; xx < p.w - 4; xx += 14) {
    world.fill(146, 185, 111); world.rect(p.x + xx, p.y + 5, 5, 4);
    world.fill(187, 143, 108); world.rect(p.x + xx, p.y + 14, 5, 3);
  }
  if (p.level > 0 && p.level % 5 == 0) {
    world.fill(251, 243, 206); world.rect(p.x + 12, p.y - 29, 2, 29);
    world.fill(p.level <= game.checkpointLevel ? color(111, 177, 136) : color(222, 147, 130));
    world.rect(p.x + 14, p.y - 29, 15, 9);
  }
  if (p.level == 0) {
    for (int i = 0; i < 9; i++) {
      float fx = p.x + 12 + i * 31;
      world.fill(109, 153, 106); world.rect(fx, p.y - 7, 2, 7);
      world.fill(i % 2 == 0 ? color(255, 230, 160) : color(244, 183, 165));
      world.rect(fx - 2, p.y - 9, 6, 4);
    }
  }
}

void drawCoin(float x, float y, boolean fixed) {
  int bob = fixed ? 0 : round(2 * sin(millis() * 0.005f + x));
  world.noStroke(); world.fill(194, 140, 54); world.rect(x - 4, y - 6 + bob, 8, 12);
  world.fill(246, 196, 75); world.rect(x - 5, y - 4 + bob, 10, 8);
  world.fill(255, 229, 135); world.rect(x - 3, y - 4 + bob, 4, 7);
  world.fill(255, 248, 208); world.rect(x - 2, y - 4 + bob, 2, 3);
}

void drawGoal() {
  Platform p = game.platforms.get(game.platforms.size() - 1);
  world.noStroke(); world.fill(246, 235, 183); world.rect(p.x + p.w - 24, p.y - 62, 3, 62);
  world.fill(221, 146, 120); world.rect(p.x + p.w - 21, p.y - 60, 27, 15);
  world.fill(255, 236, 164); world.rect(p.x + p.w - 14, p.y - 57, 5, 8);
}

void drawPlayer(float x, float y, int facing) {
  world.pushMatrix(); world.translate(round(x), round(y));
  if (facing < 0) { world.translate(16, 0); world.scale(-1, 1); }
  for (int row = 0; row < sprite.length; row++) for (int col = 0; col < sprite[row].length(); col++) {
    char s = sprite[row].charAt(col); if (s == '.') continue;
    int c = color(0);
    if (s == 'H') c = color(207, 117, 88);
    if (s == 'D') c = color(79, 76, 72);
    if (s == 'S') c = color(247, 208, 158);
    if (s == 'T') c = color(250, 231, 181);
    if (s == 'B') c = color(80, 132, 141);
    if (s == 'Y') c = color(240, 191, 85);
    world.fill(c); world.noStroke();
    int walk = game.grounded && abs(game.vx) > 10 && row > 12 ? (int)(millis() / 120) % 2 : 0;
    world.rect(col, row + walk, 1, 1);
  }
  world.popMatrix();
}


// The browser performs all inference locally; only small pose messages reach this server.
class CameraBridge {
  HttpServer server;
  ExecutorService executor;
  volatile int direction=0, jumpId=0;
  volatile boolean tracked=false, calibrated=false;
  volatile long lastSeen=0;
  String error="";
  int port=0;
  final String token=java.util.UUID.randomUUID().toString();

  boolean ready() { return tracked && calibrated && System.currentTimeMillis()-lastSeen<800; }

  void start() {
    try {
      server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
      port=server.getAddress().getPort();
      executor=Executors.newFixedThreadPool(2,r->{ Thread t=new Thread(r,"cloudhop-camera"); t.setDaemon(true); return t; });
      server.setExecutor(executor);
      server.createContext("/",exchange->{
        try {
          String requestPath=exchange.getRequestURI().getPath();
          if(requestPath.equals("/pose")) {
            if(!exchange.getRequestMethod().equals("POST") || !token.equals(exchange.getRequestHeaders().getFirst("X-CloudHop-Token"))) { respond(exchange,403,"text/plain","Forbidden".getBytes(StandardCharsets.UTF_8)); return; }
            byte[] bytes=exchange.getRequestBody().readNBytes(1025);
            if(bytes.length>1024) { respond(exchange,413,"text/plain",new byte[0]); return; }
            JSONObject data=JSONObject.parse(new String(bytes,StandardCharsets.UTF_8));
            int nextDirection=data.getInt("direction",0);
            direction=nextDirection>=-1 && nextDirection<=1 ? nextDirection : 0;
            jumpId=data.getInt("jumpId",0);
            tracked=data.getBoolean("tracked",false); calibrated=data.getBoolean("calibrated",false);
            lastSeen=System.currentTimeMillis();
            respond(exchange,200,"text/plain","ok".getBytes(StandardCharsets.UTF_8)); return;
          }
          if(!exchange.getRequestMethod().equals("GET")) { respond(exchange,405,"text/plain",new byte[0]); return; }
          if(requestPath.equals("/session")) { respond(exchange,200,"application/json",("{\"token\":\""+token+"\"}").getBytes(StandardCharsets.UTF_8)); return; }
          Path root=java.nio.file.Paths.get(dataPath("tracker")).toAbsolutePath().normalize();
          Path file=root.resolve(requestPath.equals("/")?"index.html":requestPath.substring(1)).normalize();
          if(!file.startsWith(root) || !Files.isRegularFile(file)) { respond(exchange,404,"text/plain","Not found".getBytes(StandardCharsets.UTF_8)); return; }
          String name=file.toString();
          String mime=name.endsWith(".html")?"text/html; charset=utf-8":name.endsWith(".js")||name.endsWith(".mjs")?"text/javascript":name.endsWith(".wasm")?"application/wasm":"application/octet-stream";
          respond(exchange,200,mime,Files.readAllBytes(file));
        } catch(Exception e) { try { respond(exchange,400,"text/plain","Bad request".getBytes(StandardCharsets.UTF_8)); } catch(Exception ignored) {} }
        finally { exchange.close(); }
      });
      server.start();
      println("Camera setup: http://127.0.0.1:"+port+"/");
    } catch(Exception e) { error="摄像头连接服务未启动，请重启游戏或先用键盘体验。"; println(e); }
  }

  void respond(HttpExchange exchange,int status,String mime,byte[] body) throws java.io.IOException {
    exchange.getResponseHeaders().set("Content-Type",mime);
    exchange.getResponseHeaders().set("Cache-Control","no-store");
    exchange.getResponseHeaders().set("X-Content-Type-Options","nosniff");
    exchange.sendResponseHeaders(status,body.length); exchange.getResponseBody().write(body);
  }
  void stop() { if(server!=null) server.stop(0); if(executor!=null) executor.shutdownNow(); }
}

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

// Physics coordinates are independent of window size. Platforms are one-way.
class Platform {
  float x, y, w; int level;
  Platform(float x, float y, float w, int level) { this.x=x; this.y=y; this.w=w; this.level=level; }
}
class Coin {
  float x, y; boolean taken;
  Coin(float x, float y) { this.x=x; this.y=y; }
}
class Spark {
  float x, y, vx, vy, life=1; int tint;
  Spark(float x, float y, int tint) { this.x=x; this.y=y; this.tint=tint; vx=random(-45,45); vy=random(-65,15); }
}
class Game {
  ArrayList<Platform> platforms = new ArrayList<Platform>();
  ArrayList<Coin> coins = new ArrayList<Coin>();
  ArrayList<Spark> sparks = new ArrayList<Spark>();
  final float GRAVITY=520, JUMP_SPEED=255, RUN_SPEED=125;
  float x, y, vx, vy, cameraY, accumulator, coyote, jumpBuffer, noticeTime;
  int facing=1, highest, checkpointLevel, collected, best;
  boolean grounded, won;
  String notice="";

  Game() {
    try { if(new java.io.File(sketchPath("record.json")).isFile()) { JSONObject save=loadJSONObject(sketchPath("record.json")); if(save!=null) best=save.getInt("bestCoins",0); } }
    catch(Exception ignored) { }
    reset();
  }

  void reset() {
    platforms.clear(); coins.clear(); sparks.clear();
    // Adjacent platforms overlap by at least 36px; max jump rise is 62.5px.
    platforms.add(new Platform(75,167,310,0));
    for(int i=1;i<=20;i++) {
      int phase=(i-1)%10;
      float px=phase<=5 ? 304+phase*72 : 664-(phase-5)*90;
      Platform p=new Platform(px,167-i*44,136,i); platforms.add(p);
      coins.add(new Coin(px+51,p.y-16)); coins.add(new Coin(px+91,p.y-16));
    }
    highest=checkpointLevel=collected=0; grounded=true; won=false;
    accumulator=coyote=jumpBuffer=noticeTime=0; cameraY=0;
    x=164; y=151; vx=vy=0;
  }

  void update(float dt,int direction,boolean jump) {
    if(jump) jumpBuffer=0.16f;
    accumulator+=dt;
    while(accumulator>=1.0f/120) { step(1.0f/120,direction); accumulator-=1.0f/120; }
    cameraY=lerp(cameraY,min(0,y-110),1-exp(-dt*6));
    noticeTime=max(0,noticeTime-dt);
    for(int i=sparks.size()-1;i>=0;i--) {
      Spark s=sparks.get(i); s.life-=dt*1.8f; s.x+=s.vx*dt; s.y+=s.vy*dt; s.vy+=100*dt;
      if(s.life<=0) sparks.remove(i);
    }
  }

  void step(float dt,int direction) {
    if(won) return;
    if(grounded) coyote=0.1f; else coyote=max(0,coyote-dt);
    jumpBuffer=max(0,jumpBuffer-dt);
    if(jumpBuffer>0 && coyote>0) { vy=-JUMP_SPEED; grounded=false; coyote=0; jumpBuffer=0; }
    vx=direction*RUN_SPEED;
    if(direction!=0) facing=direction;
    x=constrain(x+vx*dt,4,W-20);
    float oldFeet=y+16;
    vy+=GRAVITY*dt; y+=vy*dt; grounded=false;
    if(vy>=0) for(Platform p:platforms) {
      if(x+13>p.x && x+3<p.x+p.w && oldFeet<=p.y+0.01f && y+16>=p.y) {
        y=p.y-16; vy=0; grounded=true; highest=max(highest,p.level);
        if(p.level%5==0 && p.level>checkpointLevel) {
          checkpointLevel=p.level; notice="检查点已点亮 · 第 "+p.level+" 层"; noticeTime=3;
          burst(x+8,y,color(162,203,124));
        }
        if(p.level==20 && !won) { won=true; saveBest(); burst(x+8,y,color(255,205,86)); }
        break;
      }
    }
    for(Coin c:coins) if(!c.taken && abs(x+8-c.x)<15 && abs(y+8-c.y)<18) {
      c.taken=true; collected++; burst(c.x,c.y,color(249,205,92));
      notice="+10  获得金币"; noticeTime=1.2f; saveBest();
      if(audio!=null && store!=null)audio.play(1046,55,store.volume);
    }
    if(y>cameraY+H+35 || y>H+10) respawn();
  }

  void burst(float bx,float by,int tint) { for(int i=0;i<9;i++) sparks.add(new Spark(bx,by,tint)); }
  void respawn() {
    Platform p=platforms.get(checkpointLevel);
    x=p.x+38; y=p.y-16; vx=vy=0; grounded=true; jumpBuffer=0;
    cameraY=min(0,y-110); notice="回到检查点，金币仍然保留。"; noticeTime=3;
  }
  void saveBest() {
    if(collected<=best) return;
    best=collected;
    if(captureMode)return;
    try { JSONObject data=new JSONObject(); data.setInt("bestCoins",best); saveJSONObject(data,sketchPath("record.json")); }
    catch(Exception e) { notice="本局正常进行，纪录保存失败。"; noticeTime=3; }
  }
}

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

// Settings and three resumable slots. Atomic writes preserve the previous file on failure.
class LocalStore {
 java.nio.file.Path root;
 JSONObject[] slots=new JSONObject[3];
 JSONObject lastDeleted=null, replaced=null;
 int deletedIndex=-1, water=0, reminderMinutes=0;
 boolean warm=true,strongReminder=false,playedToday=false,preview=false,loadFailed=false;
 float brightness=2.0f/3,volume=0;
 String mood="未记录",date="";
 long nextReminder=Long.MAX_VALUE;
 LocalStore(java.nio.file.Path root,boolean preview){this.root=root;this.preview=preview;load();rollDay();resetReminder();}
 String today(){return java.time.LocalDate.now().toString();}
 int completed(){return (water>0?1:0)+(playedToday?1:0)+(!mood.equals("未记录")?1:0);}
 int slotCount(){int n=0;for(JSONObject s:slots)if(s!=null)n++;return n;}
 int emptySlot(){for(int i=0;i<3;i++)if(slots[i]==null)return i;return -1;}
 void resetReminder(){nextReminder=reminderMinutes<=0?Long.MAX_VALUE:System.currentTimeMillis()+reminderMinutes*60000L;}
 void rollDay(){String d=today();if(!d.equals(date)){date=d;water=0;playedToday=false;mood="未记录";}}
 void load(){
  java.nio.file.Path file=root.resolve("companion.json");if(!java.nio.file.Files.isRegularFile(file))return;
  try{
   JSONObject o=JSONObject.parse(java.nio.file.Files.readString(file,StandardCharsets.UTF_8));
   date=o.getString("date","");water=max(0,o.getInt("water",0));mood=o.getString("mood","未记录");playedToday=o.getBoolean("playedToday",false);
   warm=o.getBoolean("warm",true);strongReminder=o.getBoolean("strongReminder",false);
   volume=constrain(o.getFloat("volume",0),0,1);brightness=constrain(o.getFloat("brightness",0.67f),0.1f,1);
   int m=o.getInt("reminderMinutes",0);reminderMinutes=m==30||m==45||m==60?m:0;
   JSONArray list=o.getJSONArray("slots");for(int i=0;i<min(3,list.size());i++){JSONObject s=list.getJSONObject(i);if(validSnapshot(s))slots[i]=s;}
   if(o.hasKey("lastDeleted")){lastDeleted=o.getJSONObject("lastDeleted");deletedIndex=o.getInt("deletedIndex",-1);}
   if(o.hasKey("replaced"))replaced=o.getJSONObject("replaced");
  }catch(Exception e){loadFailed=true;println("Settings file could not be read; original retained: "+file);}
 }
 boolean validSnapshot(JSONObject s){
  try{
   if(s==null||s.getInt("version",0)!=1)return false;
   int top=s.getInt("highest"),cp=s.getInt("checkpoint"),count=s.getInt("collected");
   if(top<0||top>20||cp<0||cp>top||cp%5!=0||count<0||count>40)return false;
   JSONArray coins=s.getJSONArray("coins");if(coins.size()!=40)return false;
   int taken=0;for(int i=0;i<40;i++)if(coins.getBoolean(i))taken++;
   if(taken!=count)return false;
   for(String key:new String[]{"x","y","vy","cameraY"})if(!Float.isFinite(s.getFloat(key)))return false;
   return s.getFloat("x")>=0&&s.getFloat("x")<=W&&s.getFloat("y")>-1100&&s.getFloat("y")<H+100;
  }catch(Exception e){return false;}
 }
 JSONObject snapshot(Game g){
  JSONObject s=new JSONObject();s.setInt("version",1);s.setInt("highest",g.highest);s.setInt("checkpoint",g.checkpointLevel);s.setInt("collected",g.collected);
  s.setFloat("x",g.x);s.setFloat("y",g.y);s.setFloat("vy",g.vy);s.setFloat("cameraY",g.cameraY);
  s.setBoolean("grounded",g.grounded);s.setBoolean("won",g.won);s.setInt("facing",g.facing);
  s.setString("updated",java.time.LocalDateTime.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyy.MM.dd  HH:mm")));
  JSONArray coins=new JSONArray();for(Coin c:g.coins)coins.append(c.taken);s.setJSONArray("coins",coins);return s;
 }
 void restore(JSONObject s,Game g){
  g.highest=s.getInt("highest");g.checkpointLevel=s.getInt("checkpoint");g.collected=s.getInt("collected");
  g.x=s.getFloat("x");g.y=s.getFloat("y");g.vy=s.getFloat("vy");g.cameraY=s.getFloat("cameraY");
  g.grounded=s.getBoolean("grounded",false);g.won=s.getBoolean("won",false);g.facing=s.getInt("facing",1);g.vx=0;
  JSONArray flags=s.getJSONArray("coins");for(int i=0;i<40;i++)g.coins.get(i).taken=flags.getBoolean(i);
  g.jumpBuffer=g.accumulator=g.coyote=0;
 }
 boolean saveSlot(int index,Game g){
  if(index<0||index>2)return false;JSONObject prior=slots[index];slots[index]=snapshot(g);
  if(!persist()){slots[index]=prior;return false;}return true;
 }
 boolean backupSlot(int index){JSONObject previous=replaced;replaced=slots[index];if(!persist()){replaced=previous;return false;}return true;}
 boolean deleteSlot(int index){
  if(index<0||index>2||slots[index]==null)return false;
  JSONObject previous=lastDeleted,slot=slots[index];int oldIndex=deletedIndex;
  lastDeleted=slot;deletedIndex=index;slots[index]=null;
  if(!persist()){slots[index]=slot;lastDeleted=previous;deletedIndex=oldIndex;return false;}return true;
 }
 boolean undoDelete(){
  if(lastDeleted==null||deletedIndex<0||deletedIndex>2||slots[deletedIndex]!=null)return false;
  JSONObject saved=lastDeleted;int index=deletedIndex;slots[index]=saved;lastDeleted=null;deletedIndex=-1;
  if(!persist()){slots[index]=null;lastDeleted=saved;deletedIndex=index;return false;}return true;
 }
 boolean persist(){
  if(preview)return true;if(loadFailed)return false;
  try{
   JSONObject o=new JSONObject();o.setString("date",date);o.setInt("water",water);o.setString("mood",mood);o.setBoolean("playedToday",playedToday);
   o.setBoolean("warm",warm);o.setBoolean("strongReminder",strongReminder);o.setFloat("volume",volume);o.setFloat("brightness",brightness);o.setInt("reminderMinutes",reminderMinutes);
   JSONArray list=new JSONArray();for(JSONObject slot:slots)list.append(slot==null?new JSONObject():slot);o.setJSONArray("slots",list);
   if(lastDeleted!=null){o.setJSONObject("lastDeleted",lastDeleted);o.setInt("deletedIndex",deletedIndex);}
   if(replaced!=null)o.setJSONObject("replaced",replaced);
   java.nio.file.Files.createDirectories(root);java.nio.file.Path temp=root.resolve("companion.json.tmp"),file=root.resolve("companion.json");
   java.nio.file.Files.writeString(temp,o.toString(),StandardCharsets.UTF_8);
   try{java.nio.file.Files.move(temp,file,java.nio.file.StandardCopyOption.ATOMIC_MOVE,java.nio.file.StandardCopyOption.REPLACE_EXISTING);}
   catch(java.nio.file.AtomicMoveNotSupportedException e){java.nio.file.Files.move(temp,file,java.nio.file.StandardCopyOption.REPLACE_EXISTING);}
   return true;
  }catch(Exception e){println("Save failed: "+e.getMessage());return false;}
 }
}

class AudioCue {
 java.util.concurrent.ExecutorService executor=java.util.concurrent.Executors.newSingleThreadExecutor(r->{Thread t=new Thread(r,"emosync-audio");t.setDaemon(true);return t;});
 volatile boolean busy=false;
 void play(int frequency,int duration,float volume){
  if(volume<=0||busy)return;busy=true;
  executor.submit(()->{
   try{
    int rate=22050,count=rate*duration/1000;byte[] data=new byte[count*2];
    for(int i=0;i<count;i++){double envelope=Math.sin(Math.PI*i/count);short sample=(short)(Math.sin(2*Math.PI*frequency*i/rate)*envelope*volume*5500);data[i*2]=(byte)sample;data[i*2+1]=(byte)(sample>>8);}
    javax.sound.sampled.AudioFormat format=new javax.sound.sampled.AudioFormat(rate,16,1,true,false);
    try(javax.sound.sampled.SourceDataLine output=javax.sound.sampled.AudioSystem.getSourceDataLine(format)){output.open(format);output.start();output.write(data,0,data.length);output.drain();}
   }catch(Exception ignored){}finally{busy=false;}
  });
 }
 void stop(){executor.shutdownNow();}
}

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

public static void main(String[] args) { PApplet.main(CloudHop.class.getName()); }
}