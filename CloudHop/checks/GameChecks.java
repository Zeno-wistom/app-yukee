public class GameChecks {
  static void check(boolean ok, String message) { if (!ok) throw new AssertionError(message); }
  public static void main(String[] args) throws Exception {
    CloudHop app = new CloudHop();
    CloudHop.Game g = app.new Game();
    g.best=40;
    check(g.platforms.size()==21 && g.coins.size()==40,"Level inventory");
    // Climb every consecutive platform using the same fixed-step simulation as play.
    g.x=330;
    for(int level=1;level<=20;level++) {
      CloudHop.Platform target=g.platforms.get(level);
      for(int frame=0;frame<180;frame++) {
        float dx=target.x+target.w/2-(g.x+8);
        int direction=Math.abs(dx)<1.5f?0:dx>0?1:-1;
        g.update(1f/120,direction,frame==0);
        if(g.grounded && g.highest>=level) break;
      }
      check(g.grounded && g.highest==level,"Unreachable platform "+level+" at "+g.x+","+g.y);
    }
    check(g.won,"Summit reward");
    check(g.checkpointLevel==20,"Checkpoint activation");
    g.reset();g.best=40;
    CloudHop.Coin coin=g.coins.get(0);
    g.x=coin.x-8;g.y=coin.y-8;
    g.update(1f/120,0,false);
    int before=g.collected;
    g.update(1f/120,0,false);
    check(before==1 && g.collected==1,"Coin must count once");
    g.checkpointLevel=5;g.y=400;g.cameraY=0;
    g.update(1f/120,0,false);
    check(g.y==g.platforms.get(5).y-16,"Fall recovery");
    check(g.collected==1,"Fall preserves coins");
    g.reset();g.best=40;
    g.x=200;g.y=g.platforms.get(0).y+5;g.vy=-100;g.grounded=false;
    g.update(1f/120,0,false);
    check(!g.grounded,"One-way platform must allow ascending passage");
    CloudHop.CameraBridge b=app.new CameraBridge();
    b.tracked=true;b.calibrated=true;b.lastSeen=System.currentTimeMillis();
    check(b.ready(),"Camera ready");
    b.lastSeen-=1000;check(!b.ready(),"Stale input timeout");
    b.tracked=false;check(!b.ready(),"Face loss");
    System.out.println("PASS: all 20 jumps, summit, checkpoints, coin uniqueness, fall recovery, one-way platforms, camera timeout");
  }
}
