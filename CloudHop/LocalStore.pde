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
