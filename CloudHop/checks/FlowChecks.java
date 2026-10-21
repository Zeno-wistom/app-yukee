import java.nio.file.*;
public class FlowChecks {
 static int checks=0;
 static void check(boolean ok,String why){checks++;if(!ok)throw new AssertionError(why);}
 static void screen(CloudHop app,String expected){check(app.screen.equals(expected),"Expected "+expected+" got "+app.screen);}
 public static void main(String[] args)throws Exception{
  Path root=Files.createTempDirectory(Path.of("checks"),"test-state-");
  CloudHop app=new CloudHop();app.store=app.new LocalStore(root,false);app.game=app.new Game();app.game.best=40;app.bridge=app.new CameraBridge();
  screen(app,"dashboard");
  app.action("games");screen(app,"select");
  app.action("detail");screen(app,"detail");
  app.action("start");screen(app,"choice");
  app.action("records");screen(app,"records");check(app.store.slotCount()==0,"Empty state");
  app.backAction();screen(app,"choice");
  app.action("new");screen(app,"calibrate");check(app.activeSlot==0,"First free slot");check(app.store.validSnapshot(app.store.slots[0]),"New valid snapshot");
  app.action("face-play");screen(app,"calibrate");
  app.action("keyboard");screen(app,"countdown");
  app.go("play");app.game.x=350;app.game.coins.get(0).taken=true;app.game.collected=1;
  app.action("pause");screen(app,"pause");check(app.store.slots[0].getInt("collected")==1,"Pause saves coins");
  app.action("quit-select");screen(app,"quit");
  app.action("cancel-quit");screen(app,"pause");check(app.inSession,"Cancel retains session");
  app.action("quit-select");app.action("confirm-quit");screen(app,"select");check(!app.inSession,"Quit ends live session");
  app.action("detail");app.action("start");app.action("records");app.action("load:0");screen(app,"calibrate");
  check(app.game.x==350&&app.game.collected==1&&app.game.coins.get(0).taken,"Resume restores exact progress");
  app.action("keyboard");app.go("play");app.action("quit-detail");screen(app,"quit");
  app.action("cancel-quit");screen(app,"countdown");
  app.go("play");app.action("quit-detail");app.action("confirm-quit");screen(app,"detail");
  for(int i=1;i<3;i++){app.action("start");app.action("new");check(app.activeSlot==i,"Allocate slot "+i);app.finishSession("detail");}
  check(app.store.slotCount()==3,"Three slots retained");
  app.action("start");app.action("new");check(app.overlay.equals("replace-list"),"Full slots require choice");
  app.action("replace:1");check(app.overlay.equals("replace"),"Overwrite confirmation");
  app.action("cancel-slot");check(app.overlay.equals("replace-list"),"Cancel overwrite");
  app.action("close-overlay");app.action("records");app.action("delete:0");check(app.store.slots[0]!=null,"Delete confirmation retains data");
  app.action("confirm-delete");check(app.store.slots[0]==null,"Delete committed");
  app.action("undo");check(app.store.slots[0]!=null&&app.store.slots[0].getInt("collected")==1,"Undo restores progress");
  CloudHop.LocalStore reloaded=app.new LocalStore(root,false);
  check(reloaded.slotCount()==3,"Slots survive restart");check(reloaded.validSnapshot(reloaded.slots[0]),"Persisted snapshot valid");
  app.overlay="";app.go("dashboard");app.action("drink");app.action("water");check(app.store.water==1,"Water recording");
  app.action("emotion");app.action("mood:很放松");check(app.store.mood.equals("很放松"),"Mood recording");
  app.action("sound");app.action("volume:2");check(app.store.volume==0.5f,"Volume state");
  app.action("light");app.action("brightness:1");app.action("cool");check(!app.store.warm&&app.store.brightness<0.34f,"Screen light state");
  app.action("close-overlay");app.action("strong");check(app.store.strongReminder,"Exclusive strong mode");
  app.action("gentle");check(!app.store.strongReminder,"Exclusive gentle mode");
  app.action("interval:30");check(app.store.nextReminder>System.currentTimeMillis(),"Reminder scheduled locally");
  app.action("power");app.action("standby");screen(app,"standby");app.action("wake");screen(app,"dashboard");
  app.action("games");app.action("next");app.action("detail");app.action("start");screen(app,"detail");check(!app.inSession,"Unimplemented game cannot start");
  check(app.store.completed()==3,"Daily completion");
  reloaded=app.new LocalStore(root,false);check(reloaded.water==1&&!reloaded.warm&&reloaded.volume==0.5f,"Settings survive restart");
  System.out.println("PASS: "+checks+" navigation, camera gate, save/load, cancellation, slot protection, undo and settings checks");
 }
}
