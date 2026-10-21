import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpExchange;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;

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

