import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
public class BridgeChecks {
  static void check(boolean ok,String why) { if(!ok) throw new AssertionError(why); }
  public static void main(String[] args) throws Exception {
    CloudHop app=new CloudHop(){ public String dataPath(String path) { return java.nio.file.Paths.get("data",path).toAbsolutePath().toString(); } };
    System.out.println("Asset root: "+app.dataPath("tracker"));
    CloudHop.CameraBridge b=app.new CameraBridge();b.start();
    try {
      HttpClient client=HttpClient.newHttpClient();
      String base="http://127.0.0.1:"+b.port;
      for(String resource:new String[]{"/","/session","/tracker.mjs","/pose-control.mjs","/vendor/vision_bundle.mjs","/vendor/wasm/vision_wasm_internal.wasm","/vendor/face_landmarker.task"}) {
        HttpResponse<byte[]> response=client.send(HttpRequest.newBuilder(URI.create(base+resource)).build(),HttpResponse.BodyHandlers.ofByteArray());
        check(response.statusCode()==200 && response.body().length>0,"Resource "+resource+" status="+response.statusCode());
      }
      String packet="{\"tracked\":true,\"calibrated\":true,\"direction\":-1,\"jumpId\":7}";
      HttpRequest request=HttpRequest.newBuilder(URI.create(base+"/pose")).header("X-CloudHop-Token",b.token).POST(HttpRequest.BodyPublishers.ofString(packet)).build();
      check(client.send(request,HttpResponse.BodyHandlers.ofString()).statusCode()==200,"Pose accepted");
      check(b.ready() && b.direction==-1 && b.jumpId==7,"Pose reaches game");
      request=HttpRequest.newBuilder(URI.create(base+"/pose")).POST(HttpRequest.BodyPublishers.ofString(packet)).build();
      check(client.send(request,HttpResponse.BodyHandlers.ofString()).statusCode()==403,"Missing token blocked");
      request=HttpRequest.newBuilder(URI.create(base+"/%2e%2e/%2e%2e/CloudHop.pde")).build();
      check(client.send(request,HttpResponse.BodyHandlers.ofString()).statusCode()==404,"Path containment");
      System.out.println("PASS: offline assets, model, pose transport, session token, path containment");
      if(args.length>0 && args[0].equals("serve")) { System.out.println("Browser test server: "+base); System.in.read(); }
    } finally { b.stop(); }
  }
}
