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
